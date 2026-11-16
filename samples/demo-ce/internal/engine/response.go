// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package engine

import (
	cev1 "github.com/cisco-eti/cognition-fabric/api/ce/v1"
	"google.golang.org/protobuf/types/known/structpb"
)

// publishDetails moves the demo's typed internal diagnostics to its own wire
// object after evaluation, finding persistence and diagnostic logging finish.
func publishDetails(out *cev1.EvaluateResponse) error {
	checks := make([]any, 0, len(out.GetChecksRun()))
	for _, check := range out.GetChecksRun() {
		checks = append(checks, map[string]any{
			"check_id": check.GetCheckId(), "passed": check.GetPassed(), "reason": check.GetReason(),
		})
	}
	values := map[string]any{"schema": "demo-ce.v1", "checks_run": checks}
	if out.DenialReason != nil {
		values["denial_reason"] = out.GetDenialReason().String()
	}
	if out.MissingContextCause != nil {
		values["missing_context_cause"] = out.GetMissingContextCause().String()
	}
	if out.ContextSufficiency != nil {
		values["context_sufficiency"] = out.GetContextSufficiency().String()
	}
	details, err := structpb.NewStruct(values)
	if err != nil {
		return err
	}
	out.Details = details
	out.DenialReason, out.MissingContextCause, out.ContextSufficiency = nil, nil, nil
	out.ChecksRun = nil
	return nil
}
