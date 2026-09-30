// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package mgmt

import "testing"

func TestFindFirstHealthyCASA(t *testing.T) {
	tests := []struct {
		name    string
		engines []MASCognitionEngine
		wantID  string
		wantNil bool
	}{
		{
			name:    "no engines",
			engines: []MASCognitionEngine{},
			wantNil: true,
		},
		{
			name: "online CASA is matched",
			engines: []MASCognitionEngine{
				{CEID: "ce-1", CEType: "CASA", Enabled: true, Status: "online"},
			},
			wantID: "ce-1",
		},
		{
			name: "disabled but online CASA is still matched (caller checks Enabled)",
			engines: []MASCognitionEngine{
				{CEID: "ce-1", CEType: "CASA", Enabled: false, Status: "online"},
			},
			wantID: "ce-1",
		},
		{
			name: "offline CASA is not matched",
			engines: []MASCognitionEngine{
				{CEID: "ce-1", CEType: "CASA", Enabled: true, Status: "offline"},
			},
			wantNil: true,
		},
		{
			name: "DETECTIVE alone is not matched",
			engines: []MASCognitionEngine{
				{CEID: "ce-1", CEType: "DETECTIVE", Enabled: true, Status: "online"},
			},
			wantNil: true,
		},
		{
			name: "DETECTIVE is skipped in favor of online CASA",
			engines: []MASCognitionEngine{
				{CEID: "ce-detective", CEType: "DETECTIVE", Enabled: true, Status: "online"},
				{CEID: "ce-casa", CEType: "CASA", Enabled: true, Status: "online"},
			},
			wantID: "ce-casa",
		},
		{
			name: "offline CASA is skipped in favor of online CASA",
			engines: []MASCognitionEngine{
				{CEID: "ce-offline", CEType: "CASA", Enabled: true, Status: "offline"},
				{CEID: "ce-online", CEType: "CASA", Enabled: true, Status: "online"},
			},
			wantID: "ce-online",
		},
		{
			name: "all CASA offline returns nil",
			engines: []MASCognitionEngine{
				{CEID: "ce-offline-1", CEType: "CASA", Enabled: true, Status: "offline"},
				{CEID: "ce-offline-2", CEType: "CASA", Enabled: false, Status: "offline"},
			},
			wantNil: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mas := &MASResponse{CognitionEngines: tt.engines}
			got := mas.FindFirstHealthyCASA()
			if tt.wantNil {
				if got != nil {
					t.Errorf("FindFirstHealthyCASA() = %+v, want nil", got)
				}
				return
			}
			if got == nil {
				t.Fatalf("FindFirstHealthyCASA() = nil, want CEID %q", tt.wantID)
			}
			if got.CEID != tt.wantID {
				t.Errorf("FindFirstHealthyCASA().CEID = %q, want %q", got.CEID, tt.wantID)
			}
		})
	}
}
