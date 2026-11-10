// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import {z} from 'zod';
import type {MultiAgenticSystem, MultiAgenticSystemRequest, MultiAgenticSystemUpdate} from '@/api/endpoints/mas';
import type {FormValues} from './mas-form-schema';

export type RequestObject = Record<string, unknown>;
export type RequestKind = 'create' | 'update';
export interface RequestIssue {
  path: (string | number)[];
  message: string;
}

export class RequestValidationError extends Error {
  constructor(public issues: RequestIssue[]) {
    super(issues.map((issue) => `${issue.path.join('.') || 'Request'}: ${issue.message}`).join('\n'));
    this.name = 'RequestValidationError';
  }
}
const object = z.record(z.unknown());
const text = z.string().nullable().optional();
const configuration = object.nullable().optional();
const identity = z
  .object({type: z.string(), identifiers: z.record(z.string())})
  .strict()
  .nullable()
  .optional();
const document = z
  .object({content: z.unknown().optional(), source_url: text, source: configuration, media_type: text, provenance: configuration})
  .passthrough();
const description = document.extend({format: z.string(), spec_version: text, schema_version: text});
const snapshot = {definition: configuration, provenance: configuration, protocol_version: text};
const runtimeTool = z
  .object({
    ...snapshot,
    tool_id: z.string().min(1),
    provider: z.object({mcp_server_name: z.string(), native_tool_name: z.string()}).strict().nullable().optional(),
    metadata: configuration
  })
  .strict();
const agent = z
  .object({
    agent_id: text,
    name: text,
    description: text,
    url: text,
    identity,
    config: configuration,
    agent_descriptions: z.array(description).optional(),
    metadata: configuration
  })
  .strict();
const tool = z.object({name: z.string(), description: text, parameters: configuration, ...snapshot}).strict();

// Match database uniqueness exactly, including the empty string. Blank MCP
// names are valid individually; they cannot be omitted like agent names.
function validateUniqueNames(rows: {name: string}[], context: z.RefinementCtx, message: (name: string) => string) {
  const indexes = new Map<string, number[]>();
  rows.forEach(({name}, index) => indexes.set(name, [...(indexes.get(name) ?? []), index]));
  for (const [name, positions] of indexes) {
    if (positions.length > 1) {
      positions.forEach((index) => context.addIssue({code: 'custom', path: [index, 'name'], message: message(name)}));
    }
  }
}

const tools = z.array(tool).superRefine((rows, context) => {
  validateUniqueNames(rows, context, (name) => `Duplicate tool name ${JSON.stringify(name)}; tool names must be unique within this MCP server.`);
});
const server = z.object({name: z.string(), transport: text, description: text, tools: tools.nullable().optional(), config: configuration}).strict();
const servers = z.array(server).superRefine((rows, context) => {
  validateUniqueNames(rows, context, (name) => `Duplicate MCP server name ${JSON.stringify(name)}; server names must be unique within this MAS.`);
});

const node = z.object({id: z.string().min(1), type: z.enum(['agent', 'start', 'end']).optional(), tool_ids: z.array(z.string()).optional()}).strict();
const edge = z
  .object({
    source: z.string(),
    target: z.string(),
    interaction_type: z.string().optional(),
    conditional: z.boolean().nullable().optional(),
    data: z.unknown().optional()
  })
  .strict();
const topology = z
  .object({source: z.literal('provided'), completeness: z.enum(['complete', 'partial']), nodes: z.array(node), edges: z.array(edge)})
  .strict()
  .superRefine((graph, context) => {
    const ids = new Set<string>();
    graph.nodes.forEach((entry, index) => {
      if (ids.has(entry.id)) {
        context.addIssue({code: 'custom', path: ['nodes', index, 'id'], message: 'Duplicate node ID'});
      }
      ids.add(entry.id);
      if (entry.type && entry.type !== 'agent' && entry.tool_ids !== undefined) {
        context.addIssue({code: 'custom', path: ['nodes', index, 'tool_ids'], message: 'Start/end markers cannot own tools'});
      }
      if (new Set(entry.tool_ids).size !== (entry.tool_ids?.length ?? 0)) {
        context.addIssue({code: 'custom', path: ['nodes', index, 'tool_ids'], message: 'Duplicate tool ID'});
      }
    });
    graph.edges.forEach((entry, index) => {
      for (const endpoint of ['source', 'target'] as const) {
        if (!ids.has(entry[endpoint])) {
          context.addIssue({code: 'custom', path: ['edges', index, endpoint], message: 'Unknown graph node'});
        }
      }
    });
  });

export const ProvidedTopologiesSchema = z.array(topology).max(1, 'Only one provided topology is allowed');
const fields = {
  name: z.string().min(1).max(255),
  description: text,
  agents: z.array(agent).nullable().optional(),
  mcp_servers: servers.nullable().optional(),
  config: configuration,
  cognition_engine_ids: z.array(z.string()).nullable().optional(),
  topologies: ProvidedTopologiesSchema.optional(),
  metadata_schema_version: text,
  tag: text,
  version: text,
  metadata: configuration,
  documentation: z.array(document).optional(),
  tools: z.array(runtimeTool).optional()
};
// Mirrors Management writable fields; output-only identities and timestamps are excluded.
export const CreateRequestSchema = z.object(fields).strict();
export const UpdateRequestSchema = z.object({...fields, name: fields.name.nullable().optional(), cognition_engine_configs: configuration}).strict();

export function jsonObject(text: string, label = 'Request'): RequestObject {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`${label}: ${error instanceof Error ? error.message : 'Invalid JSON'}`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value as RequestObject;
}

// Form projection only requires safe container shapes, not a complete API
// request. Missing fields and unsupported properties remain in the draft;
// Save still validates them against the current request contract.
const DraftProjectionSchema = z
  .object({
    agents: z
      .array(z.object({identity: configuration}).passthrough())
      .nullable()
      .optional(),
    mcp_servers: z
      .array(z.object({tools: z.array(object).nullable().optional()}).passthrough())
      .nullable()
      .optional()
  })
  .passthrough();

export function parseRequestDraft(text: string): RequestObject {
  const value = jsonObject(text);
  const result = DraftProjectionSchema.safeParse(value);
  if (!result.success) {
    throw new RequestValidationError(result.error.issues);
  }
  return value;
}

export function validateRequest(value: RequestObject, kind: RequestKind): RequestObject {
  const result = (kind === 'create' ? CreateRequestSchema : UpdateRequestSchema).safeParse(value);
  if (!result.success) {
    throw new RequestValidationError(result.error.issues);
  }
  // Keep original values and property presence, including nulls and empty lists.
  return value;
}

export function supportedRequest(value: RequestObject, kind: 'create'): MultiAgenticSystemRequest;
export function supportedRequest(value: RequestObject, kind: 'update'): MultiAgenticSystemUpdate;
export function supportedRequest(value: RequestObject, kind: RequestKind): MultiAgenticSystemRequest | MultiAgenticSystemUpdate {
  validateRequest(value, kind);
  return value as MultiAgenticSystemRequest | MultiAgenticSystemUpdate;
}

const own = (value: RequestObject, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const record = (value: unknown): RequestObject => (value && typeof value === 'object' && !Array.isArray(value) ? (value as RequestObject) : {});
const string = (value: unknown) => (typeof value === 'string' ? value : '');
const jsonText = (value: unknown) => (value === undefined || value === null ? '' : JSON.stringify(value, null, 2));
const equal = (first: unknown, second: unknown) => JSON.stringify(first) === JSON.stringify(second);

function agentToForm(entry: RequestObject, saved?: MultiAgenticSystem) {
  const identification = record(entry.identity);
  return {
    _request: entry,
    cf_agent_id: saved?.agents?.find((row) => row.agent_id === entry.agent_id)?.cf_agent_id,
    agent_id: string(entry.agent_id),
    name: string(entry.name),
    description: string(entry.description),
    url: string(entry.url),
    identity_type: string(identification.type),
    identity_identifiers: jsonText(identification.identifiers),
    config: entry.config as Record<string, unknown> | null | undefined
  };
}

function toolToForm(entry: RequestObject) {
  return {_request: entry, name: string(entry.name), description: string(entry.description), parameters: jsonText(entry.parameters)};
}

function serverToForm(entry: RequestObject) {
  return {
    _request: entry,
    name: string(entry.name),
    description: string(entry.description),
    transport: string(entry.transport),
    tools: (Array.isArray(entry.tools) ? entry.tools : []).map((item) => toolToForm(record(item)))
  };
}

function writableSnapshot(item: RequestObject): RequestObject {
  const {
    source_snapshot: _original,
    collected_at: _collected,
    content_hash: _hash,
    resolution_state: _resolution,
    support_state: _support,
    ...rest
  } = item;
  return rest;
}

function writableToolSnapshot(item: RequestObject): RequestObject {
  const rest = writableSnapshot(item);
  const provenance = record(rest.provenance);
  if (own(provenance, 'claims')) {
    rest.provenance = provenance.claims;
  } else {
    delete rest.provenance;
  }
  return rest;
}

export function seedUpdateRequest(saved: MultiAgenticSystem): RequestObject {
  const result: RequestObject = {
    name: saved.name,
    description: saved.description,
    agents:
      saved.agents?.map(({cf_agent_id: _internal, ...entry}) => ({
        ...entry,
        ...(entry.agent_descriptions !== undefined &&
          entry.agent_descriptions !== null && {agent_descriptions: entry.agent_descriptions.map(writableSnapshot)})
      })) ?? saved.agents,
    mcp_servers:
      saved.mcp_servers?.map(({id: _internal, tools, ...entry}) => ({
        ...entry,
        ...(tools !== undefined && {tools: tools?.map(({id: _toolId, ...item}) => writableToolSnapshot(item)) ?? tools})
      })) ?? saved.mcp_servers,
    config: saved.config
  };
  for (const field of ['metadata_schema_version', 'tag', 'version', 'metadata'] as const) {
    if (saved[field] !== undefined) {
      result[field] = saved[field];
    }
  }
  if (saved.documentation !== undefined && saved.documentation !== null) {
    result.documentation = saved.documentation.map(writableSnapshot);
  }
  if (saved.tools !== undefined && saved.tools !== null) {
    result.tools = saved.tools.map((item) => {
      const tool = writableToolSnapshot(item);
      if (tool.provider) {
        delete tool.definition;
        delete tool.protocol_version;
        delete tool.provenance;
      }
      return tool;
    });
  }
  if (saved.topologies !== undefined && saved.topologies !== null) {
    result.topologies = saved.topologies.filter((g) => g.source === 'provided').map(({updated_at: _time, ...graph}) => graph);
  }
  return result;
}

// Form saves omit retained graph/bindings. Full JSON mode sends its explicit body.
export function formUpdateRequest(request: RequestObject, saved: RequestObject): RequestObject {
  const result = {...request};
  for (const field of ['topologies', 'tools', 'agents', 'mcp_servers']) {
    if (equal(request[field], saved[field])) {
      delete result[field];
    }
  }
  return result;
}

export function requestToForm(value: RequestObject, saved?: MultiAgenticSystem): FormValues {
  const fallback = saved ? seedUpdateRequest(saved) : {};
  const field = (key: string) => (own(value, key) ? value[key] : fallback[key]);
  return {
    name: string(field('name')),
    description: string(field('description')),
    config: jsonText(field('config')),
    agents: (Array.isArray(field('agents')) ? (field('agents') as unknown[]) : []).map((item) => agentToForm(record(item), saved)),
    mcp_servers: (Array.isArray(field('mcp_servers')) ? (field('mcp_servers') as unknown[]) : []).map((item) => serverToForm(record(item))),
    cognition_engine_ids: Array.isArray(value.cognition_engine_ids) ? (value.cognition_engine_ids as string[]) : []
  };
}

function parseField(value: string | undefined, path: string): unknown {
  if (!value?.trim()) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    throw new RequestValidationError([{path: path.split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part)), message: 'Invalid JSON'}]);
  }
}

function assignStrings(target: RequestObject, current: RequestObject, baseline: RequestObject, keys: string[]) {
  keys.forEach((key) => {
    if (!equal(current[key] ?? '', baseline[key] ?? '')) {
      target[key] = current[key] ?? '';
    }
  });
}

function formAgent(entry: NonNullable<FormValues['agents']>[number], index: number): RequestObject {
  const original = entry._request ?? {};
  const baseline = agentToForm(original);
  const result = {...original};
  assignStrings(result, entry, baseline, ['agent_id', 'description', 'url']);
  if (!equal(entry.name ?? '', baseline.name)) {
    const name = entry.name?.trim();
    if (name) {
      result.name = name;
    } else {
      delete result.name;
    }
  }
  if (!equal(entry.identity_type ?? '', baseline.identity_type) || !equal(entry.identity_identifiers ?? '', baseline.identity_identifiers)) {
    result.identity =
      entry.identity_type || entry.identity_identifiers
        ? {
            ...record(original.identity),
            type: entry.identity_type ?? '',
            identifiers: parseField(entry.identity_identifiers, `agents.${index}.identity.identifiers`) ?? {}
          }
        : null;
  }
  if (!equal(entry.config, baseline.config)) {
    result.config = entry.config;
  }
  return result;
}

function formServer(entry: NonNullable<FormValues['mcp_servers']>[number], index: number): RequestObject {
  const original = entry._request ?? {};
  const baseline = serverToForm(original);
  const result: RequestObject = entry._request ? {...original} : {name: entry.name};
  assignStrings(result, entry, baseline, ['name', 'description', 'transport']);
  if (!equal(entry.tools, baseline.tools)) {
    result.tools = entry.tools.filter(toolEntered).map((item, toolIndex) => {
      const originalTool = item._request ?? {};
      const toolBaseline = toolToForm(originalTool);
      const next: RequestObject = item._request ? {...originalTool} : {name: item.name};
      assignStrings(next, item, toolBaseline, ['name', 'description']);
      const renamed = !equal(item.name, toolBaseline.name);
      const descriptionChanged = !equal(item.description, toolBaseline.description);
      const parametersChanged = !equal(item.parameters, toolBaseline.parameters);
      if (parametersChanged) {
        next.parameters = parseField(item.parameters, `mcp_servers.${index}.tools.${toolIndex}.parameters`);
      }
      if (renamed && next.definition) {
        const definition: RequestObject = {...record(next.definition), name: item.name};
        if (descriptionChanged) {
          definition.description = item.description;
        }
        if (parametersChanged) {
          if (next.parameters === null) {
            delete definition.inputSchema;
          } else {
            definition.inputSchema = next.parameters;
          }
        }
        next.definition = definition;
      } else if (descriptionChanged || parametersChanged) {
        // Let Management derive edits from the retained snapshot.
        delete next.definition;
        delete next.provenance;
        delete next.protocol_version;
      }
      return next;
    });
  }
  return result;
}

function entered(entry: RequestObject, fields: string[]): boolean {
  return !!entry._request || fields.some((field) => entry[field] !== undefined && entry[field] !== null && entry[field] !== '');
}

const agentEntered = (entry: FormValues['agents'][number]) =>
  entered({...entry, name: entry.name?.trim()}, ['agent_id', 'name', 'description', 'url', 'identity_type', 'identity_identifiers', 'config']);
const toolEntered = (entry: FormValues['mcp_servers'][number]['tools'][number]) => entered(entry, ['name', 'description', 'parameters']);
const serverEntered = (entry: FormValues['mcp_servers'][number]) =>
  entered(entry, ['name', 'description', 'transport']) || entry.tools.some(toolEntered);

// Requests omit blank new rows. Translate API indexes back to the corresponding
// form rows before attaching errors, including nested tool parameter editors.
export function requestFormField(path: RequestIssue['path'], current: FormValues): string | undefined {
  const [root, requestIndex, field, ...rest] = path;
  if (root === 'name' || root === 'description' || root === 'config' || root === 'cognition_engine_ids') {
    return root;
  }
  const formIndex = <T>(rows: T[], included: (row: T) => boolean, index: unknown) =>
    typeof index === 'number' && Number.isInteger(index) && index >= 0
      ? rows.map((row, position) => ({row, position})).filter(({row}) => included(row))[index]?.position
      : undefined;
  if (root === 'agents') {
    const index = formIndex(current.agents, agentEntered, requestIndex);
    if (index === undefined) {
      return;
    }
    if (field === 'identity') {
      if (rest[0] === 'type') {
        return `agents.${index}.identity_type`;
      }
      return `agents.${index}.identity_identifiers`;
    }
    if (['agent_id', 'name', 'description', 'url'].includes(String(field))) {
      return `agents.${index}.${field}`;
    }
  }
  if (root === 'mcp_servers') {
    const index = formIndex(current.mcp_servers, serverEntered, requestIndex);
    if (index === undefined) {
      return;
    }
    if (['name', 'description', 'transport'].includes(String(field))) {
      return `mcp_servers.${index}.${field}`;
    }
    if (field === 'tools') {
      const toolIndex = formIndex(current.mcp_servers[index].tools, toolEntered, rest[0]);
      if (toolIndex !== undefined && ['name', 'description', 'parameters'].includes(String(rest[1]))) {
        return `mcp_servers.${index}.tools.${toolIndex}.${rest[1]}`;
      }
    }
  }
}

export function requestErrorIssues(error: unknown): RequestIssue[] {
  if (error instanceof RequestValidationError) {
    return error.issues;
  }
  const detail = record(record(error).body).detail;
  if (!Array.isArray(detail)) {
    return [];
  }
  return detail.flatMap((item) => {
    const issue = record(item);
    if (!Array.isArray(issue.loc) || typeof issue.msg !== 'string') {
      return [];
    }
    const path = issue.loc[0] === 'body' ? issue.loc.slice(1) : issue.loc;
    if (!path.every((part) => typeof part === 'string' || typeof part === 'number')) {
      return [];
    }
    return [{path, message: issue.msg}];
  });
}

// Compare against the projection of the SAME draft, not against API defaults.
// Row-local originals survive field-array removals/reorders and preserve hidden
// configs, nulls and omission even when another field in that row is edited.
export function mergeFormRequest(value: RequestObject, current: FormValues, baseline: FormValues): RequestObject {
  const result = {...value};
  assignStrings(result, current, baseline, ['name', 'description']);
  if (!equal(current.config, baseline.config)) {
    result.config = parseField(current.config, 'config');
  }
  if (!equal(current.cognition_engine_ids, baseline.cognition_engine_ids)) {
    result.cognition_engine_ids = current.cognition_engine_ids;
  }
  if (!equal(current.agents, baseline.agents)) {
    result.agents = current.agents.filter(agentEntered).map(formAgent);
  }
  if (!equal(current.mcp_servers, baseline.mcp_servers)) {
    result.mcp_servers = current.mcp_servers.filter(serverEntered).map(formServer);
  }
  return result;
}

export function applyTopologyText(value: RequestObject, text: string, edited: boolean): RequestObject {
  if (!edited) {
    return value;
  }
  let parsed: unknown;
  try {
    parsed = text.trim() ? JSON.parse(text) : [];
  } catch {
    throw new RequestValidationError([{path: ['topologies'], message: 'Invalid JSON'}]);
  }
  const result = ProvidedTopologiesSchema.safeParse(parsed);
  if (!result.success) {
    throw new RequestValidationError(result.error.issues.map((issue) => ({...issue, path: ['topologies', ...issue.path]})));
  }
  return {...value, topologies: parsed};
}

export function topologyText(value: RequestObject): string {
  return own(value, 'topologies') ? JSON.stringify(value.topologies, null, 2) : '';
}

export function pendingTopologyKey(workspaceId: string, masId: string): string {
  return `cf.mas.pending-topology.${workspaceId}.${masId}`;
}
