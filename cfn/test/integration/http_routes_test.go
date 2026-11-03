// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

//go:build integration

package integration_test

import (
	"net/http"

	"github.com/google/uuid"
	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
)

var _ = Describe("HTTP routes", Serial, func() {
	Describe("GET /api/internal/diagnostics/health", func() {
		It("returns healthy with the registered cfn_id", func() {
			code, body, _ := cfnDo(http.MethodGet, "/api/internal/diagnostics/health", nil)
			Expect(code).To(Equal(http.StatusOK))
			Expect(body["status"]).To(Equal("healthy"))
			Expect(mustString(body, "cfn_id")).NotTo(BeEmpty())
		})
	})

	Describe("GET /docs/", func() {
		It("serves Swagger UI", func() {
			code, _, raw := cfnDo(http.MethodGet, "/docs/", nil)
			Expect(code).To(BeNumerically(">=", 200))
			Expect(code).To(BeNumerically("<", 400))
			Expect(len(raw) > 0 || code == http.StatusMovedPermanently || code == http.StatusFound).To(BeTrue())
		})
	})

	Describe("POST /api/cognition-engine", func() {
		It("registers a CASA CE and forwards cfn_id to management", func() {
			ceID, body, code := registerCASA()
			Expect(code).To(Equal(http.StatusCreated), "%v", body)
			Expect(ceID).NotTo(BeEmpty())
			Expect(mustString(body, "ce_type")).To(Equal("CASA"))
			Expect(mustString(body, "cfn_id")).NotTo(BeEmpty())

			fwd := mgmt.LastRegister()
			Expect(fwd).NotTo(BeNil())
			Expect(fwd["cfn_id"]).To(Equal(mustString(body, "cfn_id")))
			Expect(fwd["name"]).To(Equal(fixtureCASAName))
			Expect(fwd["mas_auto_associate"]).To(Equal(true))
		})

		It("registers a DETECTIVE CE without enforcing fields", func() {
			code, body, _ := cfnDo(http.MethodPost, "/api/cognition-engine", map[string]any{
				"name":            "detective-ce",
				"version":         "1.0.0",
				"ce_type":         "DETECTIVE",
				"health_url":      ce.HTTPURL(),
				"health_endpoint": "/healthz",
			})
			Expect(code).To(Equal(http.StatusCreated), "%v", body)
			Expect(mustString(body, "ce_id")).NotTo(BeEmpty())
			Expect(mustString(body, "ce_type")).To(Equal("DETECTIVE"))
		})

		It("returns 409 with existing_ce_id on duplicate name/version", func() {
			firstID, _, code := registerCASA()
			Expect(code).To(Equal(http.StatusCreated))
			Expect(firstID).NotTo(BeEmpty())

			code, body, _ := cfnDo(http.MethodPost, "/api/cognition-engine", casaRegisterBody())
			Expect(code).To(Equal(http.StatusConflict), "%v", body)
			detail := nestedMap(body, "detail")
			Expect(detail).NotTo(BeNil())
			Expect(mustString(detail, "existing_ce_id")).To(Equal(firstID))
		})

		It("returns 400 when name is missing", func() {
			code, body, _ := cfnDo(http.MethodPost, "/api/cognition-engine", map[string]any{
				"version":         "1.0.0",
				"ce_type":         "CASA",
				"health_url":      ce.HTTPURL(),
				"health_endpoint": "/healthz",
			})
			Expect(code).To(Equal(http.StatusBadRequest))
			Expect(mustString(body, "error")).To(ContainSubstring("name is required"))
		})

		It("returns 400 for an unsupported ce_type", func() {
			code, body, _ := cfnDo(http.MethodPost, "/api/cognition-engine", map[string]any{
				"name":            "bad-ce",
				"version":         "1.0.0",
				"ce_type":         "UNKNOWN",
				"health_url":      ce.HTTPURL(),
				"health_endpoint": "/healthz",
			})
			Expect(code).To(Equal(http.StatusBadRequest))
			Expect(mustString(body, "error")).To(ContainSubstring("ce_type"))
		})

		It("returns 400 when enforcing_protocol is not grpc", func() {
			payload := casaRegisterBody()
			payload["enforcing_protocol"] = "http"
			code, body, _ := cfnDo(http.MethodPost, "/api/cognition-engine", payload)
			Expect(code).To(Equal(http.StatusBadRequest))
			Expect(mustString(body, "error")).To(ContainSubstring("enforcing_protocol"))
		})

		It("returns 400 when notification fields are only half-set", func() {
			payload := casaRegisterBody()
			payload["notification_endpoint"] = nil
			code, body, _ := cfnDo(http.MethodPost, "/api/cognition-engine", payload)
			Expect(code).To(Equal(http.StatusBadRequest))
			Expect(mustString(body, "error")).To(ContainSubstring("notification_url and notification_endpoint"))
		})

		It("returns 400 for a link-local health_url", func() {
			payload := casaRegisterBody()
			payload["health_url"] = "http://169.254.169.254"
			code, body, _ := cfnDo(http.MethodPost, "/api/cognition-engine", payload)
			Expect(code).To(Equal(http.StatusBadRequest))
			Expect(mustString(body, "error")).To(ContainSubstring("link-local"))
		})

		It("returns 502 when management returns a non-JSON 201", func() {
			mgmt.FailNextRegisterJSON()
			_, body, code := registerCASA()
			Expect(code).To(Equal(http.StatusBadGateway), "%v", body)
			Expect(mustString(body, "error")).To(ContainSubstring("failed to parse"))
		})
	})

	Describe("PATCH /api/cognition-engine/{ceId}", func() {
		It("updates enforcing_url and returns 200", func() {
			ceID := registerAndWaitCASA()
			code, body, _ := cfnDo(http.MethodPatch, "/api/cognition-engine/"+ceID, map[string]any{
				"enforcing_url":      "127.0.0.1:59999",
				"enforcing_endpoint": "ioc.ce.v1.CognitionEngine",
			})
			Expect(code).To(Equal(http.StatusOK), "%v", body)
			Expect(mustString(body, "enforcing_url")).To(Equal("127.0.0.1:59999"))
		})

		It("returns 400 for a non-UUID ceId", func() {
			code, body, _ := cfnDo(http.MethodPatch, "/api/cognition-engine/not-a-uuid", map[string]any{
				"enforcing_url": "127.0.0.1:1",
			})
			Expect(code).To(Equal(http.StatusBadRequest))
			Expect(mustString(body, "error")).To(ContainSubstring("invalid ce_id"))
		})

		It("returns 404 for an unknown CE", func() {
			code, body, _ := cfnDo(http.MethodPatch, "/api/cognition-engine/"+uuid.NewString(), map[string]any{
				"enforcing_url": "127.0.0.1:1",
			})
			Expect(code).To(Equal(http.StatusNotFound), "%v", body)
		})
	})

	Describe("DELETE /api/cognition-engine/{ceId}", func() {
		It("deletes a registered CE with 204", func() {
			ceID := registerAndWaitCASA()
			code, _, raw := cfnDo(http.MethodDelete, "/api/cognition-engine/"+ceID, nil)
			Expect(code).To(Equal(http.StatusNoContent), string(raw))
		})

		It("returns 400 for a non-UUID ceId", func() {
			code, body, _ := cfnDo(http.MethodDelete, "/api/cognition-engine/not-a-uuid", nil)
			Expect(code).To(Equal(http.StatusBadRequest))
			Expect(mustString(body, "error")).To(ContainSubstring("invalid ce_id"))
		})

		It("returns 404 for an unknown CE", func() {
			code, body, _ := cfnDo(http.MethodDelete, "/api/cognition-engine/"+uuid.NewString(), nil)
			Expect(code).To(Equal(http.StatusNotFound), "%v", body)
		})
	})

	Describe("POST /api/internal/mgmt/cognition-engine/probe", func() {
		It("reports healthy when the CE health endpoint returns 200", func() {
			ceID := registerAndWaitCASA()
			code, body, _ := cfnDo(http.MethodPost, "/api/internal/mgmt/cognition-engine/probe", map[string]any{
				"ce_id": ceID,
			})
			Expect(code).To(Equal(http.StatusOK), "%v", body)
			Expect(body["healthy"]).To(Equal(true))
		})

		It("reports unhealthy when the CE health endpoint is not 200", func() {
			ceID := registerAndWaitCASA()
			ce.SetHealthStatus(http.StatusInternalServerError)
			code, body, _ := cfnDo(http.MethodPost, "/api/internal/mgmt/cognition-engine/probe", map[string]any{
				"ce_id": ceID,
			})
			Expect(code).To(Equal(http.StatusOK), "%v", body)
			Expect(body["healthy"]).To(Equal(false))
		})

		It("returns 404 for a UUID that is not in the snapshot", func() {
			code, body, _ := cfnDo(http.MethodPost, "/api/internal/mgmt/cognition-engine/probe", map[string]any{
				"ce_id": uuid.NewString(),
			})
			Expect(code).To(Equal(http.StatusNotFound), "%v", body)
			Expect(mustString(body, "error")).To(ContainSubstring("CE not yet in CFN config"))
		})

		It("returns 400 for an invalid ce_id", func() {
			code, body, _ := cfnDo(http.MethodPost, "/api/internal/mgmt/cognition-engine/probe", map[string]any{
				"ce_id": "not-a-uuid",
			})
			Expect(code).To(Equal(http.StatusBadRequest))
			Expect(mustString(body, "error")).To(ContainSubstring("invalid ce_id"))
		})
	})

	Describe("GET /api/multi-agentic-systems/{masId}", func() {
		It("returns the MAS from the management plane", func() {
			code, body, _ := cfnDo(http.MethodGet, "/api/multi-agentic-systems/"+ids.masID, nil)
			Expect(code).To(Equal(http.StatusOK), "%v", body)
			Expect(mustString(body, "id")).To(Equal(ids.masID))
			Expect(mustString(body, "workspace_id")).To(Equal(ids.workspaceID))
			Expect(mustString(body, "name")).To(Equal(fixtureMASName))
		})

		It("returns 503 for a MAS that is not in the snapshot", func() {
			code, body, _ := cfnDo(http.MethodGet, "/api/multi-agentic-systems/"+uuid.NewString(), nil)
			Expect(code).To(Equal(http.StatusServiceUnavailable), "%v", body)
			Expect(mustString(body, "error")).To(Equal("workspace not configured"))
		})

		It("returns 404 when the snapshot has the MAS but GetMAS is 404", func() {
			mgmt.SetMASGetStatus(http.StatusNotFound)
			code, body, _ := cfnDo(http.MethodGet, "/api/multi-agentic-systems/"+ids.masID, nil)
			Expect(code).To(Equal(http.StatusNotFound), "%v", body)
			Expect(mustString(body, "error")).To(ContainSubstring("MAS not found"))
		})

		It("returns 502 when GetMAS fails with a non-retryable 4xx", func() {
			mgmt.SetMASGetStatus(http.StatusBadRequest)
			code, body, _ := cfnDo(http.MethodGet, "/api/multi-agentic-systems/"+ids.masID, nil)
			Expect(code).To(Equal(http.StatusBadGateway), "%v", body)
			Expect(mustString(body, "error")).To(ContainSubstring("failed to fetch MAS"))
		})
	})

	Describe("audit endpoints", func() {
		It("lists events and fetches one by id after a CE invocation", func() {
			ceID := registerAndWaitCASA()
			_, err := getDisposition(ids.masID)
			Expect(err).NotTo(HaveOccurred())

			var event map[string]any
			Eventually(func() bool {
				code, body, _ := cfnDo(http.MethodGet, "/api/internal/mgmt/audit?resource_type=COGNITION_ENGINE&audit_type=CE_INVOKED", nil)
				if code != http.StatusOK {
					return false
				}
				data, _ := body["data"].([]any)
				for _, item := range data {
					row, _ := item.(map[string]any)
					if mustString(row, "resource_identifier") == ceID {
						event = row
						return true
					}
				}
				return false
			}).Should(BeTrue(), "expected CE_INVOKED audit for %s", ceID)

			Expect(mustString(event, "audit_type")).To(Equal("CE_INVOKED"))
			id := mustString(event, "id")
			Expect(id).NotTo(BeEmpty())

			code, body, _ := cfnDo(http.MethodGet, "/api/internal/mgmt/audit/"+id, nil)
			Expect(code).To(Equal(http.StatusOK), "%v", body)
			Expect(mustString(body, "id")).To(Equal(id))
		})

		It("returns 400 for an invalid event id", func() {
			code, body, _ := cfnDo(http.MethodGet, "/api/internal/mgmt/audit/not-a-uuid", nil)
			Expect(code).To(Equal(http.StatusBadRequest))
			Expect(mustString(body, "error")).To(ContainSubstring("invalid event ID"))
		})

		It("returns 404 for an unknown event id", func() {
			code, body, _ := cfnDo(http.MethodGet, "/api/internal/mgmt/audit/"+uuid.NewString(), nil)
			Expect(code).To(Equal(http.StatusNotFound), "%v", body)
			Expect(mustString(body, "error")).To(Equal("audit event not found"))
		})

		It("returns 400 for an invalid page parameter", func() {
			code, body, _ := cfnDo(http.MethodGet, "/api/internal/mgmt/audit?page=-1", nil)
			Expect(code).To(Equal(http.StatusBadRequest))
			Expect(mustString(body, "error")).To(ContainSubstring("invalid page"))
		})

		It("returns 400 for an unknown resource_type filter", func() {
			code, body, _ := cfnDo(http.MethodGet, "/api/internal/mgmt/audit?resource_type=NOT_A_TYPE", nil)
			Expect(code).To(Equal(http.StatusBadRequest))
			Expect(mustString(body, "error")).NotTo(BeEmpty())
		})
	})
})
