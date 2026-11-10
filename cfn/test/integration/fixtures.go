// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

//go:build integration

package integration_test

import "github.com/google/uuid"

// Fixture IDs and payload shapes match the management-plane responses CFN
// unmarshals today (CfnConfigPayload and mgmt.MASResponse): snapshot CEs use
// "id", GetMAS CEs use "ce_id", register 201 uses "ce_id", PATCH 200 uses "id".
// See ioc-scale-cf-mgmt-svc cognition_fabric_node / cognition_engine handlers.

const (
	fixtureWorkspaceName = "Integration Workspace"
	fixtureMASName       = "integration-mas"
	fixtureCASAName      = "integration-casa"
	fixtureCASAVersion   = "1.0.0"
)

type fixtureIDs struct {
	workspaceID string
	masID       string
}

func newFixtureIDs() fixtureIDs {
	return fixtureIDs{
		workspaceID: uuid.NewString(),
		masID:       uuid.NewString(),
	}
}
