// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package audit

import (
	"encoding/hex"
	"errors"
	"strconv"
	"strings"
	"unicode"

	api "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/enforcement/v1"
	"github.com/google/uuid"
)

// Limits cover captured bytes and the entire protobuf request (including metadata).
// The transport envelope leaves headroom for permanent application rejections.
const (
	MaxProxyFormBytes      = 1 << 20
	MaxProxyRequestBytes   = 4 << 20
	ProxyTransportMaxBytes = 8 << 20
)

// ValidateProxyRecord follows the Proxy codec's variant-specific rules.
// Middleware rules are separate because their evidence differs from sender observations.
func ValidateProxyRecord(r *api.AuditRecord) error {
	if r == nil {
		return errors.New("record is required")
	}
	parsedID, err := uuid.Parse(r.GetAuditRecordId())
	if err != nil || parsedID.String() != r.GetAuditRecordId() {
		return errors.New("audit_record_id must be a UUID")
	}
	if r.GetRecordedAt() == nil || r.GetRecordedAt().CheckValid() != nil {
		return errors.New("recorded_at must be a valid timestamp")
	}
	if !knownAction(r.GetReturnedDisposition()) || !knownOutcome(r.GetAppliedOutcome()) || !knownUpstreamState(r.GetUpstreamInvocation()) {
		return errors.New("record contains an unknown enum value")
	}
	if r.GetMiddlewareAuthorization() != nil || r.GetMiddlewareResponseObservation() != nil {
		return validateMiddlewareObservation(r)
	}
	if strings.TrimSpace(r.GetTraceId()) == "" {
		// A request rejected before CF can lack any native context. Keep its
		// audit UUID without manufacturing a trace that has no OTel span.
		unreferencedRejection := r.GetTraceId() == "" && r.GetSpanId() == "" && r.GetObservation() == nil &&
			r.GetReturnedDisposition() == api.DispositionAction_DISPOSITION_ACTION_UNSPECIFIED &&
			r.GetAppliedOutcome() == api.AppliedOutcome_APPLIED_OUTCOME_DEGRADED &&
			r.GetUpstreamInvocation() == api.UpstreamInvocationState_UPSTREAM_INVOCATION_STATE_NOT_CALLED &&
			r.GetDegradationReason() == "local_validation"
		if !unreferencedRejection {
			return errors.New("trace_id is required outside unreferenced local rejection")
		}
	}
	if r.GetObservation() != nil {
		return validateObservation(r)
	}
	if r.GetUpstreamInvocation() == api.UpstreamInvocationState_UPSTREAM_INVOCATION_STATE_UNSPECIFIED {
		return errors.New("upstream_invocation is required")
	}
	if r.GetAppliedOutcome() == api.AppliedOutcome_APPLIED_OUTCOME_UNSPECIFIED {
		return errors.New("applied_outcome is required")
	}
	if r.GetReturnedDisposition() == api.DispositionAction_DISPOSITION_ACTION_UNSPECIFIED && r.GetAppliedOutcome() != api.AppliedOutcome_APPLIED_OUTCOME_DEGRADED && r.GetAppliedOutcome() != api.AppliedOutcome_APPLIED_OUTCOME_UNSUPPORTED {
		return errors.New("returned_disposition may be unspecified only for degraded or unsupported records")
	}
	submitted, err := fromProtoForm(r.GetSubmittedForm())
	if err != nil {
		return fmtFormError("submitted_form", err)
	}
	if hasFabricProvenance(submitted) {
		return errors.New("submitted_form must not declare fabric provenance")
	}
	var modified *api.CapturedForm
	if r.GetModifiedForm() != nil {
		form, err := fromProtoForm(r.GetModifiedForm())
		if err != nil {
			return fmtFormError("modified_form", err)
		}
		if hasFabricProvenance(form) {
			return errors.New("modified_form must not declare fabric provenance")
		}
		modified = form
	}
	injected := make([]*api.CapturedForm, 0, len(r.GetInjectedForms()))
	for index, form := range r.GetInjectedForms() {
		converted, err := fromProtoForm(form)
		if err != nil {
			return fmtFormError("injected_forms["+strconv.Itoa(index)+"]", err)
		}
		injected = append(injected, converted)
		if strings.TrimSpace(converted.GetFabricOriginId()) == "" || strings.TrimSpace(converted.GetFabricOriginAttestation()) == "" {
			return errors.New("injected_forms[" + strconv.Itoa(index) + "] require fabric origin and attestation")
		}
	}
	// A returned CF verdict and the adapter's final application are separate
	// evidence. A local veto or teardown may prevent an allowed invocation.
	localStop := r.GetDegradationReason() == "local_validation" || r.GetDegradationReason() == "canceled_before_upstream"
	if localStop && (r.GetAppliedOutcome() != api.AppliedOutcome_APPLIED_OUTCOME_DEGRADED || r.GetUpstreamInvocation() != api.UpstreamInvocationState_UPSTREAM_INVOCATION_STATE_NOT_CALLED || (r.GetReturnedDisposition() != api.DispositionAction_DISPOSITION_ACTION_ALLOW && r.GetReturnedDisposition() != api.DispositionAction_DISPOSITION_ACTION_UNSPECIFIED)) {
		return errors.New("local rejection or cancellation requires degraded outcome, no upstream invocation and allow or unspecified disposition")
	}
	if r.GetReturnedDisposition() == api.DispositionAction_DISPOSITION_ACTION_ALLOW && r.GetAppliedOutcome() != api.AppliedOutcome_APPLIED_OUTCOME_ALLOWED && !localStop {
		return errors.New("allow disposition requires allowed outcome or explicit local rejection or cancellation")
	}
	if r.GetAppliedOutcome() == api.AppliedOutcome_APPLIED_OUTCOME_ALLOWED && r.GetUpstreamInvocation() == api.UpstreamInvocationState_UPSTREAM_INVOCATION_STATE_NOT_CALLED {
		return errors.New("allowed records must declare upstream_invocation as attempted or completed")
	}
	if r.GetAppliedOutcome() == api.AppliedOutcome_APPLIED_OUTCOME_BLOCKED && r.GetReturnedDisposition() != api.DispositionAction_DISPOSITION_ACTION_BLOCK {
		return errors.New("blocked outcome requires block disposition")
	}
	if r.GetAppliedOutcome() == api.AppliedOutcome_APPLIED_OUTCOME_UNSUPPORTED && r.GetUpstreamInvocation() != api.UpstreamInvocationState_UPSTREAM_INVOCATION_STATE_NOT_CALLED {
		return errors.New("unsupported records must declare upstream_invocation as not_called")
	}
	if r.GetReturnedDisposition() == api.DispositionAction_DISPOSITION_ACTION_BLOCK && r.GetAppliedOutcome() != api.AppliedOutcome_APPLIED_OUTCOME_BLOCKED {
		return errors.New("block disposition requires blocked outcome")
	}
	if r.GetReturnedDisposition() == api.DispositionAction_DISPOSITION_ACTION_MODIFY && r.GetAppliedOutcome() != api.AppliedOutcome_APPLIED_OUTCOME_UNSUPPORTED && modified == nil {
		return errors.New("modify records require modified_form")
	}
	if r.GetReturnedDisposition() == api.DispositionAction_DISPOSITION_ACTION_INJECT && r.GetAppliedOutcome() != api.AppliedOutcome_APPLIED_OUTCOME_UNSUPPORTED && len(injected) == 0 {
		return errors.New("inject records require injected_forms")
	}
	if r.GetReturnedDisposition() != api.DispositionAction_DISPOSITION_ACTION_MODIFY && modified != nil {
		return errors.New("modified_form requires modify disposition")
	}
	if r.GetReturnedDisposition() != api.DispositionAction_DISPOSITION_ACTION_INJECT && len(injected) != 0 {
		return errors.New("injected_forms require inject disposition")
	}
	if r.GetReturnedDisposition() == api.DispositionAction_DISPOSITION_ACTION_BLOCK {
		if r.GetUpstreamInvocation() != api.UpstreamInvocationState_UPSTREAM_INVOCATION_STATE_NOT_CALLED {
			return errors.New("block records must declare upstream_invocation as not_called")
		}
	}
	if (r.GetAppliedOutcome() == api.AppliedOutcome_APPLIED_OUTCOME_DEGRADED || (r.GetAppliedOutcome() == api.AppliedOutcome_APPLIED_OUTCOME_UNSUPPORTED && r.GetReturnedDisposition() == api.DispositionAction_DISPOSITION_ACTION_UNSPECIFIED)) && strings.TrimSpace(r.GetDegradationReason()) == "" {
		return errors.New("degraded and dispositionless unsupported records require degradation_reason")
	}
	return nil
}

func fromProtoForm(form *api.CapturedForm) (*api.CapturedForm, error) {
	if form == nil {
		return nil, errors.New("is required")
	}
	if form.GetOriginalBodyBytes() < 0 {
		return nil, errors.New("original_body_bytes must not be negative")
	}
	if len(form.GetBody()) > MaxProxyFormBytes {
		return nil, errors.New("captured body exceeds 1 MiB")
	}
	return form, nil
}

func fmtFormError(field string, err error) error { return errors.New(field + " " + err.Error()) }
func hasFabricProvenance(form *api.CapturedForm) bool {
	return strings.TrimSpace(form.GetFabricOriginId()) != "" || strings.TrimSpace(form.GetFabricOriginAttestation()) != ""
}
func knownAction(a api.DispositionAction) bool {
	_, ok := api.DispositionAction_name[int32(a)]
	return ok
}

func knownOutcome(o api.AppliedOutcome) bool {
	_, ok := api.AppliedOutcome_name[int32(o)]
	return ok
}

func knownUpstreamState(s api.UpstreamInvocationState) bool {
	_, ok := api.UpstreamInvocationState_name[int32(s)]
	return ok
}

func validateAuthorization(a *api.AuthorizationContext) error {
	if a == nil || !validObservationID(a.GetEvaluationId()) || !validObservationID(a.GetMessageId()) || a.GetLatencyMs() < 0 {
		return errors.New("authorization requires bounded evaluation/message IDs and nonnegative latency")
	}
	if !validActivity(a.GetSendTraceId(), a.GetSendSpanId()) {
		return errors.New("authorization requires valid send trace/span IDs")
	}
	return nil
}
func validObservationID(value string) bool {
	return value != "" && len(value) <= 256 && !strings.ContainsFunc(value, func(r rune) bool { return unicode.IsControl(r) || unicode.IsSpace(r) })
}
func validActivity(traceID, spanID string) bool {
	return validHexID(traceID, 32) && validHexID(spanID, 16)
}
func validHexID(value string, length int) bool {
	if len(value) != length || strings.ToLower(value) != value {
		return false
	}
	bytes, err := hex.DecodeString(value)
	if err != nil {
		return false
	}
	for _, b := range bytes {
		if b != 0 {
			return true
		}
	}
	return false
}
func validateObservation(r *api.AuditRecord) error {
	if r.GetModifiedForm() != nil || len(r.GetInjectedForms()) != 0 {
		return errors.New("sender observations cannot assert mutation")
	}
	if !validActivity(r.GetTraceId(), r.GetSpanId()) || strings.TrimSpace(r.GetMasId()) == "" || strings.TrimSpace(r.GetSourceAgentId()) == "" || strings.TrimSpace(r.GetDestinationAgentId()) == "" {
		return errors.New("endpoint observations require activity and workload identities")
	}
	submitted, err := fromProtoForm(r.GetSubmittedForm())
	if err != nil || hasFabricProvenance(submitted) || len(submitted.GetBody()) != 0 || submitted.GetOriginalBodyBytes() != 0 {
		return errors.New("endpoint observation submitted_form must be metadata only")
	}
	if a := r.GetAuthorization(); a != nil {
		if r.GetAppliedOutcome() != api.AppliedOutcome_APPLIED_OUTCOME_UNSPECIFIED || r.GetUpstreamInvocation() != api.UpstreamInvocationState_UPSTREAM_INVOCATION_STATE_UNSPECIFIED {
			return errors.New("authorization alone cannot assert application")
		}
		if err := validateAuthorization(a); err != nil {
			return err
		}
		if r.GetReturnedDisposition() == api.DispositionAction_DISPOSITION_ACTION_UNSPECIFIED && r.GetDegradationReason() == "" {
			return errors.New("authorization without a CF disposition requires a failure classification")
		}
		return nil
	}
	response := r.GetResponseObservation()
	if response == nil {
		return errors.New("sender response observation is required")
	}
	id, err := uuid.Parse(response.GetAuthorizationRecordId())
	if err != nil || id.String() != response.GetAuthorizationRecordId() || id.String() == r.GetAuditRecordId() {
		return errors.New("response requires a distinct authorization record UUID")
	}
	if err := validateAuthorization(response.GetAuthorization()); err != nil {
		return err
	}
	if response.GetStartedAt() == nil || response.GetStartedAt().CheckValid() != nil || response.GetCompletedAt() == nil || response.GetCompletedAt().CheckValid() != nil || response.GetCompletedAt().AsTime().Before(response.GetStartedAt().AsTime()) || response.GetLatencyMs() < 0 {
		return errors.New("response requires valid ordered timestamps and nonnegative latency")
	}
	switch response.GetErrorCode() {
	case "", "transport_error", "timeout", "canceled", "remote_error", "blocked", "authorization_unavailable":
	default:
		return errors.New("unknown response error classification")
	}
	if response.GetResponseForm() != nil {
		form, err := fromProtoForm(response.GetResponseForm())
		if err != nil || hasFabricProvenance(form) {
			return errors.New("invalid response capture")
		}
	} else if response.GetErrorCode() == "" {
		return errors.New("response requires a capture or error classification")
	}
	if r.GetAppliedOutcome() == api.AppliedOutcome_APPLIED_OUTCOME_UNSPECIFIED {
		if r.GetUpstreamInvocation() != api.UpstreamInvocationState_UPSTREAM_INVOCATION_STATE_UNSPECIFIED || r.GetReturnedDisposition() != api.DispositionAction_DISPOSITION_ACTION_UNSPECIFIED || r.GetDegradationReason() != "" || response.GetErrorCode() == "blocked" || response.GetErrorCode() == "authorization_unavailable" {
			return errors.New("legacy response cannot assert an application or decision")
		}
		return nil
	}
	return validateHostApplication(r, response)
}

// Sender evidence describes transport application, not remote business success.
func validateHostApplication(r *api.AuditRecord, o *api.ResponseObservation) error {
	switch r.GetAppliedOutcome() {
	case api.AppliedOutcome_APPLIED_OUTCOME_ALLOWED:
		if r.GetReturnedDisposition() == api.DispositionAction_DISPOSITION_ACTION_ALLOW && r.GetDegradationReason() == "" {
			if r.GetUpstreamInvocation() == api.UpstreamInvocationState_UPSTREAM_INVOCATION_STATE_COMPLETED && (o.GetErrorCode() == "" || o.GetErrorCode() == "remote_error") {
				return nil
			}
			if r.GetUpstreamInvocation() == api.UpstreamInvocationState_UPSTREAM_INVOCATION_STATE_ATTEMPTED && (o.GetErrorCode() == "transport_error" || o.GetErrorCode() == "timeout" || o.GetErrorCode() == "canceled") {
				return nil
			}
		}
	case api.AppliedOutcome_APPLIED_OUTCOME_BLOCKED:
		if r.GetReturnedDisposition() == api.DispositionAction_DISPOSITION_ACTION_BLOCK && r.GetUpstreamInvocation() == api.UpstreamInvocationState_UPSTREAM_INVOCATION_STATE_NOT_CALLED && r.GetDegradationReason() == "" && o.GetErrorCode() == "blocked" && o.GetResponseForm() == nil {
			return nil
		}
	case api.AppliedOutcome_APPLIED_OUTCOME_UNSUPPORTED:
		if (r.GetReturnedDisposition() == api.DispositionAction_DISPOSITION_ACTION_MODIFY || r.GetReturnedDisposition() == api.DispositionAction_DISPOSITION_ACTION_INJECT) && r.GetUpstreamInvocation() == api.UpstreamInvocationState_UPSTREAM_INVOCATION_STATE_NOT_CALLED && r.GetDegradationReason() != "" && o.GetErrorCode() == "authorization_unavailable" && o.GetResponseForm() == nil {
			return nil
		}
	case api.AppliedOutcome_APPLIED_OUTCOME_DEGRADED:
		if (r.GetReturnedDisposition() == api.DispositionAction_DISPOSITION_ACTION_UNSPECIFIED || r.GetReturnedDisposition() == api.DispositionAction_DISPOSITION_ACTION_ALLOW || (r.GetReturnedDisposition() == api.DispositionAction_DISPOSITION_ACTION_BLOCK && r.GetDegradationReason() == "posture=fail_closed trigger=authorization_deadline")) && r.GetUpstreamInvocation() == api.UpstreamInvocationState_UPSTREAM_INVOCATION_STATE_NOT_CALLED && r.GetDegradationReason() != "" && o.GetErrorCode() == "authorization_unavailable" && o.GetResponseForm() == nil {
			return nil
		}
	}
	return errors.New("inconsistent sender application evidence")
}
