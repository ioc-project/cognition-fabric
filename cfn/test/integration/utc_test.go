// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

//go:build integration

package integration_test

import (
	"time"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
)

var _ = Describe("UTC config cutover", Serial, func() {
	for _, regenerateFirst := range []bool{true, false} {
		regenerateFirst := regenerateFirst
		name := "regeneration before restart"
		if !regenerateFirst {
			name = "regeneration after restart"
		}
		It("keeps the registration baseline silent with "+name, func() {
			registerAndWaitCASA()
			// A new Management build always generates explicit-zone stamps at
			// registration, regardless of when the one-off rebuild is run.
			_ = proc.Stop() // SIGTERM stops the go-run process group.
			mgmt.SetMASUpdatedOn("2026-11-11T12:00:00.123456Z")
			if regenerateFirst {
				mgmt.BumpConfigVersion()
			}
			ce.Reset()
			var err error
			proc, err = startCFN(mgmt.URL())
			Expect(err).NotTo(HaveOccurred())
			waitHTTPReady()
			waitGRPCReady()
			if !regenerateFirst {
				mgmt.BumpConfigVersion()
			}
			count := func() int { n, _ := ce.Notifications(); return n }
			Consistently(count, 2500*time.Millisecond, 100*time.Millisecond).Should(BeZero())

			// A different spelling of the same instant and a version bump are
			// also silent once registration established the canonical baseline.
			mgmt.SetMASUpdatedOn("2026-11-11T14:00:00.123456000+02:00")
			Consistently(count, 2500*time.Millisecond, 100*time.Millisecond).Should(BeZero())
			mgmt.SetMASUpdatedOn("2026-11-11T12:00:01.123456Z")
			Eventually(count).Should(Equal(1))
			_, last := ce.Notifications()
			Expect(last["event_type"]).To(Equal("mas.updated"))
			Expect(last["mas_id"]).To(Equal(ids.masID))
			Expect(last).To(HaveLen(3))
			stamp, ok := last["timestamp"].(string)
			Expect(ok).To(BeTrue())
			Expect(stamp).To(HaveSuffix("Z"))
			_, err = time.Parse(time.RFC3339Nano, stamp)
			Expect(err).NotTo(HaveOccurred())
		})
	}
})
