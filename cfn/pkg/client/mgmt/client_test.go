// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package mgmt

import "testing"

func TestFindCASACE(t *testing.T) {
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
			name: "CASA is matched",
			engines: []MASCognitionEngine{
				{CEID: "ce-1", CEType: "CASA"},
			},
			wantID: "ce-1",
		},
		{
			name: "DETECTIVE alone is not matched",
			engines: []MASCognitionEngine{
				{CEID: "ce-1", CEType: "DETECTIVE"},
			},
			wantNil: true,
		},
		{
			name: "DETECTIVE is skipped in favor of the CASA engine",
			engines: []MASCognitionEngine{
				{CEID: "ce-detective", CEType: "DETECTIVE"},
				{CEID: "ce-casa", CEType: "CASA"},
			},
			wantID: "ce-casa",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mas := &MASResponse{CognitionEngines: tt.engines}
			got := mas.FindCASACE()
			if tt.wantNil {
				if got != nil {
					t.Errorf("FindCASACE() = %+v, want nil", got)
				}
				return
			}
			if got == nil {
				t.Fatalf("FindCASACE() = nil, want CEID %q", tt.wantID)
			}
			if got.CEID != tt.wantID {
				t.Errorf("FindCASACE().CEID = %q, want %q", got.CEID, tt.wantID)
			}
		})
	}
}
