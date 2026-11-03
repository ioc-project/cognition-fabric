// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

//go:build integration

package integration_test

import (
	"context"
	"net/http"
	"testing"
	"time"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
)

func TestIntegration(t *testing.T) {
	RegisterFailHandler(Fail)
	RunSpecs(t, "CFN Integration Suite")
}

var (
	mgmt *mockMgmt
	ce   *mockCE
	proc *cfnProcess
	ids  fixtureIDs
)

var _ = BeforeSuite(func() {
	SetDefaultEventuallyTimeout(15 * time.Second)
	SetDefaultEventuallyPollingInterval(200 * time.Millisecond)

	ids = newFixtureIDs()
	mgmt = startMockMgmt(ids)

	var err error
	ce, err = startMockCE()
	Expect(err).NotTo(HaveOccurred())

	proc, err = startCFN(mgmt.URL())
	Expect(err).NotTo(HaveOccurred())

	waitHTTPReady()
	waitGRPCReady()
})

var _ = AfterSuite(func() {
	if proc != nil {
		_ = proc.Stop()
	}
	if ce != nil {
		ce.Close()
	}
	if mgmt != nil {
		mgmt.Close()
	}
})

var _ = BeforeEach(func() {
	ids = newFixtureIDs()
	mgmt.Reset(ids)
	ce.Reset()
	Expect(truncateAudits()).To(Succeed())
	waitUntilMASVisible(ids.masID)
})

func waitHTTPReady() {
	Eventually(func() int {
		code, _, _, err := cfnTry(http.MethodGet, "/api/internal/diagnostics/health", nil)
		if err != nil {
			return 0
		}
		return code
	}).WithTimeout(90 * time.Second).Should(Equal(http.StatusOK))
}

func waitGRPCReady() {
	Eventually(func() error {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		conn, err := dialEnforcement(ctx)
		if err != nil {
			return err
		}
		return conn.Close()
	}).Should(Succeed())
}

func waitUntilMASVisible(masID string) {
	Eventually(func() int {
		code, _, _ := cfnDo(http.MethodGet, "/api/multi-agentic-systems/"+masID, nil)
		return code
	}).Should(Equal(http.StatusOK))
}

func waitUntilCEInSnapshot(ceID string) {
	Eventually(func() int {
		code, _, _ := cfnDo(http.MethodPost, "/api/internal/mgmt/cognition-engine/probe", map[string]any{
			"ce_id": ceID,
		})
		return code
	}).Should(Equal(http.StatusOK))
}

func registerAndWaitCASA() string {
	ceID, body, code := registerCASA()
	Expect(code).To(Equal(http.StatusCreated), "register CASA: %v", body)
	Expect(ceID).NotTo(BeEmpty())
	waitUntilCEInSnapshot(ceID)
	return ceID
}
