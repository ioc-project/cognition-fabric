// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package audit

import (
	"errors"
	"strings"
	"unicode"

	"github.com/google/uuid"
	api "github.com/ioc-project/cognition-fabric/api/enforcement/v1"
)

func validateMiddlewareContext(c *api.MiddlewareContext, localRejection bool) error {
	if c == nil {
		return errors.New("middleware context is required")
	}
	for _, value := range []string{c.GetEvaluationId(), c.GetRequestId(), c.GetGatewayId(), c.GetSandboxId()} {
		if !validObservationID(value) && !(localRejection && value == "") {
			return errors.New("middleware requires bounded evaluation/request/gateway/sandbox IDs")
		}
	}
	for _, value := range []string{c.GetMethod(), c.GetScheme(), c.GetHost(), c.GetPath()} {
		if len(value) > 8192 || strings.ContainsFunc(value, unicode.IsControl) || (!localRejection && strings.TrimSpace(value) == "") {
			return errors.New("middleware requires a bounded HTTP target")
		}
	}
	if !localRejection && ((c.GetScheme() != "http" && c.GetScheme() != "https") || c.GetPort() == 0 || c.GetPort() > 65535) {
		return errors.New("middleware requires an HTTP scheme and valid port")
	}
	return nil
}

func validateMiddlewareObservation(r *api.AuditRecord) error {
	if r.GetAppliedOutcome() != api.AppliedOutcome_APPLIED_OUTCOME_UNSPECIFIED || r.GetUpstreamInvocation() != api.UpstreamInvocationState_UPSTREAM_INVOCATION_STATE_UNSPECIFIED || r.GetModifiedForm() != nil || len(r.GetInjectedForms()) != 0 {
		return errors.New("middleware observations cannot assert application or mutation")
	}
	authorization := r.GetMiddlewareAuthorization()
	localRejection := authorization != nil && r.GetDegradationReason() == "local_validation" && r.GetReturnedDisposition() == api.DispositionAction_DISPOSITION_ACTION_UNSPECIFIED
	if strings.TrimSpace(r.GetMasId()) == "" || strings.TrimSpace(r.GetSourceAgentId()) == "" {
		return errors.New("middleware observations require MAS and source workload identities")
	}
	if !localRejection && (!validActivity(r.GetTraceId(), r.GetSpanId()) || strings.TrimSpace(r.GetDestinationAgentId()) == "") {
		return errors.New("middleware observations require activity and workload identities outside local validation rejection")
	}

	var submitted *api.CapturedForm
	if r.GetSubmittedForm() != nil {
		var err error
		submitted, err = fromProtoForm(r.GetSubmittedForm())
		if err != nil || hasFabricProvenance(submitted) {
			return errors.New("invalid middleware submitted_form")
		}
	}

	if authorization != nil {
		if err := validateMiddlewareContext(authorization.GetContext(), localRejection); err != nil {
			return err
		}
		if authorization.GetLatencyMs() < 0 || (r.GetReturnedDisposition() == api.DispositionAction_DISPOSITION_ACTION_UNSPECIFIED && strings.TrimSpace(r.GetDegradationReason()) == "") {
			return errors.New("middleware authorization requires nonnegative latency and a disposition or failure classification")
		}
		return nil
	}

	response := r.GetMiddlewareResponseObservation()
	if response == nil {
		return errors.New("middleware response observation is required")
	}
	if r.GetReturnedDisposition() != api.DispositionAction_DISPOSITION_ACTION_UNSPECIFIED || r.GetDegradationReason() != "" || r.GetDispositionReason() != "" || r.GetDecidingCfIdentity() != "" || (submitted != nil && (len(submitted.GetBody()) != 0 || submitted.GetOriginalBodyBytes() != 0 || submitted.GetTruncated() || submitted.GetRedacted())) {
		return errors.New("middleware response cannot assert a decision or top-level capture")
	}
	if err := validateMiddlewareContext(response.GetContext(), false); err != nil {
		return err
	}
	id, err := uuid.Parse(response.GetAuthorizationRecordId())
	if err != nil || id.String() != response.GetAuthorizationRecordId() || id.String() == r.GetAuditRecordId() {
		return errors.New("middleware response requires a distinct authorization record UUID")
	}
	if response.GetStartedAt() == nil || response.GetStartedAt().CheckValid() != nil || response.GetCompletedAt() == nil || response.GetCompletedAt().CheckValid() != nil || response.GetCompletedAt().AsTime().Before(response.GetStartedAt().AsTime()) || response.GetLatencyMs() < 0 {
		return errors.New("middleware response requires ordered timestamps and nonnegative latency")
	}
	if !validObservationID(response.GetTerminal()) || (response.GetStatusCode() != 0 && (response.GetStatusCode() < 100 || response.GetStatusCode() > 599)) {
		return errors.New("middleware response requires a bounded terminal classification and valid HTTP status")
	}
	if response.GetStreamComplete() && (!response.GetBodyObserved() || response.GetTerminal() != "MIDDLEWARE_SESSION_END_REASON_NORMAL") {
		return errors.New("complete middleware response requires an observed body stream and normal terminal reason")
	}
	if response.GetResponseForm() != nil {
		form, err := fromProtoForm(response.GetResponseForm())
		if err != nil || hasFabricProvenance(form) || !response.GetBodyObserved() {
			return errors.New("middleware response capture requires an observed body without fabric provenance")
		}
	}
	return nil
}
