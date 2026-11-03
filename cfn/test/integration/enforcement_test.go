// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

//go:build integration

package integration_test

import (
	"time"

	"github.com/google/uuid"
	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	cev1 "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/ce/v1"
	enforcementv1 "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/enforcement/v1"
)

var _ = Describe("GetDisposition", Serial, func() {
	It("returns ACTION_ALLOW when the CASA CE allows", func() {
		ceID := registerAndWaitCASA()
		ce.SetOutcome(cev1.Decision_DECISION_ALLOW, "ok")

		resp, err := getDisposition(ids.masID)
		Expect(err).NotTo(HaveOccurred())
		Expect(resp.GetAction()).To(Equal(enforcementv1.GetDispositionResponse_ACTION_ALLOW))
		Expect(resp.GetModify()).To(BeFalse())

		eval := ce.LastEvaluate()
		Expect(eval).NotTo(BeNil())
		Expect(eval.GetMasId()).To(Equal(ids.masID))
		Expect(eval.GetWorkspaceId()).To(Equal(ids.workspaceID))
		Expect(eval.GetSourceAgentId()).To(Equal("agent-src"))
		Expect(eval.GetDestinationAgentId()).To(Equal("agent-dst"))
		_ = ceID
	})

	It("returns ACTION_BLOCK when the CASA CE denies", func() {
		_ = registerAndWaitCASA()
		ce.SetOutcome(cev1.Decision_DECISION_DENY, "denied")

		resp, err := getDisposition(ids.masID)
		Expect(err).NotTo(HaveOccurred())
		Expect(resp.GetAction()).To(Equal(enforcementv1.GetDispositionResponse_ACTION_BLOCK))
		Expect(resp.GetModify()).To(BeFalse())
	})

	It("maps DECISION_MODIFY to ACTION_MODIFY", func() {
		_ = registerAndWaitCASA()
		ce.SetOutcome(cev1.Decision_DECISION_MODIFY, "rewrite")

		resp, err := getDisposition(ids.masID)
		Expect(err).NotTo(HaveOccurred())
		Expect(resp.GetAction()).To(Equal(enforcementv1.GetDispositionResponse_ACTION_MODIFY))
		Expect(resp.GetModify()).To(BeTrue())
	})

	It("returns InvalidArgument when payload fields are missing", func() {
		_, err := getDispositionWith("", "src", "dst", "trace", "span")
		Expect(err).To(HaveOccurred())
		st, ok := status.FromError(err)
		Expect(ok).To(BeTrue())
		Expect(st.Code()).To(Equal(codes.InvalidArgument))
	})

	It("returns NotFound for a MAS that is not in the snapshot", func() {
		_, err := getDisposition(uuid.NewString())
		Expect(err).To(HaveOccurred())
		st, ok := status.FromError(err)
		Expect(ok).To(BeTrue())
		Expect(st.Code()).To(Equal(codes.NotFound))
	})

	It("returns NotFound when no CASA CE is associated", func() {
		code, body, _ := cfnDo("POST", "/api/cognition-engine", map[string]any{
			"name":            "detective-only",
			"version":         "1.0.0",
			"ce_type":         "DETECTIVE",
			"health_url":      ce.HTTPURL(),
			"health_endpoint": "/healthz",
		})
		Expect(code).To(Equal(201), "%v", body)
		waitUntilCEInSnapshot(mustString(body, "ce_id"))

		_, err := getDisposition(ids.masID)
		Expect(err).To(HaveOccurred())
		st, ok := status.FromError(err)
		Expect(ok).To(BeTrue())
		Expect(st.Code()).To(Equal(codes.NotFound))
		Expect(st.Message()).To(ContainSubstring("no CASA CE"))
	})

	It("returns Unavailable when the CASA CE is disabled", func() {
		ceID := registerAndWaitCASA()
		mgmt.SetEngineStatus(ceID, "online", false)

		_, err := getDisposition(ids.masID)
		Expect(err).To(HaveOccurred())
		st, ok := status.FromError(err)
		Expect(ok).To(BeTrue())
		Expect(st.Code()).To(Equal(codes.Unavailable))
		Expect(st.Message()).To(ContainSubstring("disabled"))
	})

	It("returns Unavailable when the CASA CE is offline", func() {
		ceID := registerAndWaitCASA()
		mgmt.SetEngineStatus(ceID, "offline", true)

		_, err := getDisposition(ids.masID)
		Expect(err).To(HaveOccurred())
		st, ok := status.FromError(err)
		Expect(ok).To(BeTrue())
		Expect(st.Code()).To(Equal(codes.Unavailable))
		Expect(st.Message()).To(ContainSubstring("offline"))
	})

	It("returns Unavailable when the CASA CE gRPC address cannot be dialed", func() {
		ceID := registerAndWaitCASA()
		mgmt.SetEngineEnforcingURL(ceID, "127.0.0.1:1")

		// casa.Client.Connect uses grpc.WithBlock and a 30s timeout, so the
		// caller deadline must outlive that or gRPC surfaces DeadlineExceeded
		// instead of CFN's Unavailable mapping.
		_, err := getDispositionWithTimeout(45*time.Second, ids.masID, "agent-src", "agent-dst", "trace-1", "span-1")
		Expect(err).To(HaveOccurred())
		st, ok := status.FromError(err)
		Expect(ok).To(BeTrue())
		Expect(st.Code()).To(Equal(codes.Unavailable))
	})

	It("returns Internal when Evaluate fails", func() {
		_ = registerAndWaitCASA()
		ce.SetEvaluateError(status.Error(codes.Internal, "ce exploded"))

		_, err := getDisposition(ids.masID)
		Expect(err).To(HaveOccurred())
		st, ok := status.FromError(err)
		Expect(ok).To(BeTrue())
		Expect(st.Code()).To(Equal(codes.Internal))
		Expect(st.Message()).To(ContainSubstring("CASA CE Evaluate failed"))
	})
})
