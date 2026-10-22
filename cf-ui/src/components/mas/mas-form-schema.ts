// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import {z} from 'zod';

const AgentFormSchema = z.object({
  agent_id: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  identity_type: z.string().optional(),
  identity_identifiers: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val || val.trim() === '') {
          return true;
        }
        try {
          JSON.parse(val);
          return true;
        } catch {
          return false;
        }
      },
      {message: 'Must be valid JSON'}
    )
});

const MCPToolFormSchema = z.object({
  name: z.string().min(1, 'Tool name is required'),
  description: z.string().optional(),
  parameters: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val || val.trim() === '') {
          return true;
        }
        try {
          JSON.parse(val);
          return true;
        } catch {
          return false;
        }
      },
      {message: 'Must be valid JSON'}
    )
});

const MCPServerFormSchema = z.object({
  name: z.string().min(1, 'Server name is required'),
  description: z.string().optional(),
  transport: z.string().optional(),
  tools: z.array(MCPToolFormSchema).optional().default([])
});

export const UpdateMASFormSchema = z
  .object({
    name: z.string().min(1, 'Name is required').min(3, 'Name must be at least 3 characters'),
    description: z.string().optional(),
    agents: z.array(AgentFormSchema).optional().default([]),
    mcp_servers: z.array(MCPServerFormSchema).optional().default([]),
    config: z
      .string()
      .optional()
      .refine(
        (val) => {
          if (!val || val.trim() === '') {
            return true;
          }
          try {
            JSON.parse(val);
            return true;
          } catch {
            return false;
          }
        },
        {message: 'Must be valid JSON'}
      )
  })
  .superRefine((data, ctx) => {
    // Validate unique agent names
    const agentNames: string[] = [];
    (data.agents || []).forEach((agent, index) => {
      const trimmed = agent.name?.trim();
      if (trimmed) {
        if (agentNames.includes(trimmed)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Agent name "${trimmed}" already exists in this system`,
            path: ['agents', index, 'name']
          });
        }
        agentNames.push(trimmed);
      }
    });

    // Validate unique MCP server names
    const serverNames: string[] = [];
    (data.mcp_servers || []).forEach((server, index) => {
      const trimmed = server.name?.trim();
      if (trimmed) {
        if (serverNames.includes(trimmed)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `MCP server name "${trimmed}" already exists in this system`,
            path: ['mcp_servers', index, 'name']
          });
        }
        serverNames.push(trimmed);
      }
    });
  });

export type FormValues = z.infer<typeof UpdateMASFormSchema>;
