// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

// Form values are a projection of the request draft. Submission validation
// lives in mas-request-draft so JSON and Form use the same API contract.
type AgentFormValues = {
  _request?: Record<string, unknown>;
  cf_agent_id?: string;
  agent_id?: string;
  config?: Record<string, unknown> | null;
  name?: string;
  description?: string;
  url?: string;
  identity_type?: string;
  identity_identifiers?: string;
};

type MCPToolFormValues = {
  _request?: Record<string, unknown>;
  name: string;
  description?: string;
  parameters?: string;
};

type MCPServerFormValues = {
  _request?: Record<string, unknown>;
  name: string;
  description?: string;
  transport?: string;
  tools: MCPToolFormValues[];
};

export type FormValues = {
  name: string;
  description?: string;
  cognition_engine_ids: string[];
  agents: AgentFormValues[];
  mcp_servers: MCPServerFormValues[];
  config?: string;
};
