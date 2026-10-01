// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package mgmt

import "testing"

func TestFindCASACEs(t *testing.T) {
	tests := []struct {
		name     string
		engines  []MASCognitionEngine
		wantIDs  []string
		wantNone bool
	}{
		{
			name:     "no engines",
			engines:  []MASCognitionEngine{},
			wantNone: true,
		},
		{
			name: "single CASA is returned",
			engines: []MASCognitionEngine{
				{CEID: "ce-1", CEType: "CASA", Enabled: true, Status: "online"},
			},
			wantIDs: []string{"ce-1"},
		},
		{
			name: "DETECTIVE alone returns empty",
			engines: []MASCognitionEngine{
				{CEID: "ce-1", CEType: "DETECTIVE", Enabled: true, Status: "online"},
			},
			wantNone: true,
		},
		{
			name: "only CASA CEs are returned",
			engines: []MASCognitionEngine{
				{CEID: "ce-detective", CEType: "DETECTIVE", Enabled: true, Status: "online"},
				{CEID: "ce-casa-1", CEType: "CASA", Enabled: true, Status: "online"},
				{CEID: "ce-casa-2", CEType: "CASA", Enabled: false, Status: "offline"},
			},
			wantIDs: []string{"ce-casa-1", "ce-casa-2"},
		},
		{
			name: "all CASA CEs returned regardless of status",
			engines: []MASCognitionEngine{
				{CEID: "ce-online", CEType: "CASA", Enabled: true, Status: "online"},
				{CEID: "ce-offline", CEType: "CASA", Enabled: true, Status: "offline"},
				{CEID: "ce-disabled", CEType: "CASA", Enabled: false, Status: "online"},
			},
			wantIDs: []string{"ce-online", "ce-offline", "ce-disabled"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mas := &MASResponse{CognitionEngines: tt.engines}
			got := mas.FindCASACEs()
			if tt.wantNone {
				if len(got) != 0 {
					t.Errorf("FindCASACEs() returned %d CEs, want 0", len(got))
				}
				return
			}
			if len(got) != len(tt.wantIDs) {
				t.Fatalf("FindCASACEs() returned %d CEs, want %d", len(got), len(tt.wantIDs))
			}
			for i, ce := range got {
				if ce.CEID != tt.wantIDs[i] {
					t.Errorf("FindCASACEs()[%d].CEID = %q, want %q", i, ce.CEID, tt.wantIDs[i])
				}
			}
		})
	}
}
