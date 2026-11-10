// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import test from 'node:test';
import ts from 'typescript';

function sourceModule(relative) {
  const url = new URL(relative, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}
  }).outputText;
  const module = {exports: {}};
  new Function('require', 'module', 'exports', compiled)(createRequire(url), module, module.exports);
  return module.exports;
}

const {
  jsonObject,
  parseRequestDraft,
  validateRequest,
  supportedRequest,
  seedUpdateRequest,
  requestToForm,
  mergeFormRequest,
  applyTopologyText,
  topologyText,
  requestErrorIssues,
  requestFormField
} = sourceModule('../src/components/mas/mas-request-draft.ts');
const {apiErrorMessage} = sourceModule('../src/api/error-message.ts');
const clone = (value) => structuredClone(value);
const saved = {
  id: 'mas-id',
  workspace_id: 'workspace-id',
  name: 'A',
  description: null,
  config: {opaque: [null, true, 1]},
  agents: [
    {
      cf_agent_id: 'internal-a',
      agent_id: 'runtime-a',
      name: null,
      description: '',
      url: 'not-an-http-url',
      identity: {type: 'custom', identifiers: {locator: 'native::agent'}},
      config: {nested: {keep: true}}
    },
    {cf_agent_id: 'internal-b', agent_id: 'runtime-b', name: 'Second', identity: null, config: null}
  ],
  mcp_servers: [
    {
      id: 'server-id',
      name: 'documents',
      description: null,
      transport: null,
      config: {opaque: ['preserve']},
      tools: [{id: 'tool-id', name: 'list', description: null, parameters: {type: 'object', properties: {}}}]
    }
  ],
  cognition_engines: [{ce_id: 'existing-ce', status: 'online'}],
  created_at: 'timestamp',
  updated_at: 'timestamp'
};

test('current API schema accepts short MAS names, unnamed agents and arbitrary string URLs', () => {
  const value = seedUpdateRequest(saved);
  assert.equal(validateRequest(value, 'create'), value);
  assert.deepEqual(supportedRequest(value, 'create'), value);
});

test('invalid syntax and non-object requests fail locally', () => {
  for (const text of ['{', '[]', 'null', 'false']) assert.throws(() => jsonObject(text));
  assert.throws(() => validateRequest({}, 'create'), /name/);
  assert.deepEqual(validateRequest({}, 'update'), {});
});

test('unsupported and output-only fields are reported at every request level', () => {
  for (const value of [
    {name: 'MAS', id: 'output'},
    {name: 'MAS', unsupported: {}},
    {name: 'MAS', agents: [{agent_id: 'a', cf_agent_id: 'output'}]},
    {name: 'MAS', mcp_servers: [{name: 'mcp', tools: [{name: 'tool', id: 'output'}]}]}
  ])
    assert.throws(() => validateRequest(value, 'create'), /Unrecognized key/);
});

test('incomplete create drafts can return to Form without weakening Save validation', () => {
  for (const value of [{}, {name: ''}, {agents: [{}], mcp_servers: [{tools: [{}]}]}]) {
    const draft = parseRequestDraft(JSON.stringify(value));
    const form = requestToForm(draft);
    assert.deepEqual(mergeFormRequest(draft, clone(form), form), value);
    assert.throws(() => supportedRequest(draft, 'create'), /name/);
  }
});

test('unsupported fields survive form edits and remain rejected on Save', () => {
  const value = {
    name: 'MAS',
    future_field: {preserve: true},
    agents: [{agent_id: 'runtime', future_agent_field: [1, 2], identity: {type: 'old', identifiers: {}, future_identity_field: 'keep'}}],
    mcp_servers: [{future_server_field: 'keep', tools: [{future_tool_field: 'keep'}]}]
  };
  const draft = parseRequestDraft(JSON.stringify(value));
  const baseline = requestToForm(draft),
    edited = clone(baseline);
  edited.name = 'Edited MAS';
  edited.agents[0].identity_type = 'new';
  edited.mcp_servers[0].name = 'documents';
  edited.mcp_servers[0].tools[0].name = 'list';
  const next = mergeFormRequest(draft, edited, baseline);
  assert.deepEqual(next.future_field, value.future_field);
  assert.deepEqual(next.agents[0], {...value.agents[0], identity: {...value.agents[0].identity, type: 'new'}});
  assert.deepEqual(next.mcp_servers[0], {
    ...value.mcp_servers[0],
    name: 'documents',
    tools: [{...value.mcp_servers[0].tools[0], name: 'list'}]
  });
  assert.throws(() => supportedRequest(next, 'create'), /Unrecognized key/);
});

test('draft switching rejects malformed JSON and containers that Form cannot safely represent', () => {
  for (const text of ['{', '[]', 'null', '{"agents":[null]}', '{"agents":[{"identity":[]}]}', '{"mcp_servers":[{"tools":[1]}]}']) {
    assert.throws(() => parseRequestDraft(text));
  }
});

test('null, empty and omitted fields retain their distinct request representations', () => {
  for (const value of [
    {},
    {config: null},
    {config: {}},
    {agents: null},
    {agents: []},
    {mcp_servers: []},
    {cognition_engine_ids: []},
    {cognition_engine_configs: {ce: null}}
  ]) {
    assert.deepEqual(supportedRequest(value, 'update'), value);
  }
  assert.throws(() => validateRequest({agents: [{identity: {type: 'x', identifiers: {notString: 1}}}]}, 'update'), /identifiers/);
});

test('edit seeding strips all output IDs and CE membership/status', () => {
  const value = seedUpdateRequest(saved);
  assert.ok(!('id' in value) && !('workspace_id' in value) && !('created_at' in value));
  assert.ok(!('cognition_engine_ids' in value) && !('cognition_engine_configs' in value) && !('cognition_engines' in value));
  assert.ok(!('cf_agent_id' in value.agents[0]));
  assert.ok(!('id' in value.mcp_servers[0]) && !('id' in value.mcp_servers[0].tools[0]));
});

test('unchanged form/JSON projections preserve every current supported field', () => {
  const value = seedUpdateRequest(saved),
    baseline = requestToForm(value, saved);
  assert.deepEqual(mergeFormRequest(value, clone(baseline), baseline), value);
  assert.deepEqual(validateRequest(jsonObject(JSON.stringify(value)), 'update'), value);
});

test('editing one agent field retains its identity, nulls and opaque configuration', () => {
  const value = seedUpdateRequest(saved),
    baseline = requestToForm(value, saved),
    edited = clone(baseline);
  edited.agents[0].name = 'New display name';
  const next = mergeFormRequest(value, edited, baseline);
  assert.deepEqual(next.agents[0], {...value.agents[0], name: 'New display name'});
  assert.deepEqual(next.agents[1], value.agents[1]);
  assert.ok(!('cf_agent_id' in next.agents[0]));
});

test('clearing two agent names omits both names while retaining runtime IDs and opaque data', () => {
  const value = seedUpdateRequest({...saved, agents: saved.agents.map((agent, index) => ({...agent, name: `Agent ${index}`}))});
  const baseline = requestToForm(value),
    edited = clone(baseline);
  edited.agents[0].name = '';
  edited.agents[1].name = '   ';
  const next = supportedRequest(mergeFormRequest(value, edited, baseline), 'update');
  assert.deepEqual(
    next.agents,
    value.agents.map(({name: _name, ...agent}) => agent)
  );
});

test('form-edited agent names are trimmed and whitespace-only new rows are ignored', () => {
  const value = seedUpdateRequest(saved),
    baseline = requestToForm(value),
    edited = clone(baseline);
  edited.agents[1].name = '  Renamed  ';
  edited.agents.push({agent_id: 'new-runtime', name: '  New Agent  '}, {name: '   '});
  const next = mergeFormRequest(value, edited, baseline);
  assert.equal(next.agents[1].name, 'Renamed');
  assert.deepEqual(next.agents[2], {agent_id: 'new-runtime', name: 'New Agent'});
  assert.equal(next.agents.length, 3);
});

test('explicit JSON names are unchanged by mode switches or unrelated form edits', () => {
  const value = {
    name: 'MAS',
    agents: [
      {agent_id: 'one', name: ''},
      {agent_id: 'two', name: '  Supplied name  '}
    ]
  };
  const draft = parseRequestDraft(JSON.stringify(value));
  const baseline = requestToForm(draft),
    edited = clone(baseline);
  assert.deepEqual(mergeFormRequest(draft, edited, baseline), value);
  edited.agents[0].description = 'Other field';
  edited.agents[1].description = 'Other field';
  const next = supportedRequest(mergeFormRequest(draft, edited, baseline), 'create');
  assert.deepEqual(
    next.agents.map((agent) => agent.name),
    ['', '  Supplied name  ']
  );
});

test('new name-only agents retain server-generated IDs while preserving existing internal IDs in the form only', () => {
  const value = seedUpdateRequest(saved),
    baseline = requestToForm(value, saved),
    edited = clone(baseline);
  edited.agents.push({name: '  New Agent  '}, {agent_id: 'explicit', name: ''}, {name: ''});
  const payload = supportedRequest(mergeFormRequest(value, edited, baseline), 'update');
  assert.deepEqual(
    baseline.agents.map((agent) => agent.cf_agent_id),
    ['internal-a', 'internal-b']
  );
  assert.deepEqual(payload.agents.slice(0, 2), value.agents);
  assert.deepEqual(payload.agents.slice(2), [{name: 'New Agent'}, {agent_id: 'explicit'}]);
  assert.ok(payload.agents.every((agent) => !('cf_agent_id' in agent)));
});

test('null and empty agent configs and identity survive an unrelated form edit', () => {
  const value = {
    name: 'MAS',
    agents: [
      {agent_id: 'a', config: null},
      {agent_id: 'b', config: {}, identity: {type: 'openclaw', identifiers: {url: 'native'}}}
    ]
  };
  const baseline = requestToForm(value),
    edited = clone(baseline);
  edited.description = 'Other field';
  assert.deepEqual(supportedRequest(mergeFormRequest(value, edited, baseline), 'update').agents, value.agents);
});

test('editing MCP names preserves server config and the complete current tool parameters', () => {
  const value = seedUpdateRequest(saved),
    baseline = requestToForm(value, saved),
    edited = clone(baseline);
  edited.mcp_servers[0].name = 'renamed';
  edited.mcp_servers[0].tools[0].description = 'new';
  const next = mergeFormRequest(value, edited, baseline);
  assert.deepEqual(next.mcp_servers[0], {...value.mcp_servers[0], name: 'renamed', tools: [{...value.mcp_servers[0].tools[0], description: 'new'}]});
});

test('row removal/reordering does not move opaque metadata between agents or providers', () => {
  const value = seedUpdateRequest(saved),
    baseline = requestToForm(value, saved),
    edited = clone(baseline);
  edited.agents.reverse();
  assert.deepEqual(mergeFormRequest(value, edited, baseline).agents, [...value.agents].reverse());
  edited.agents.splice(0, 1);
  assert.deepEqual(mergeFormRequest(value, edited, baseline).agents, [value.agents[0]]);
});

test('JSON omission survives switching to a populated form until a represented field is edited', () => {
  const value = {description: 'only this field'},
    baseline = requestToForm(value, saved),
    edited = clone(baseline);
  assert.deepEqual(mergeFormRequest(value, edited, baseline), value);
  edited.agents[0].name = 'intentional edit';
  const next = mergeFormRequest(value, edited, baseline);
  assert.equal(next.agents[0].name, 'intentional edit');
  assert.ok(!('name' in next) && !('config' in next) && !('mcp_servers' in next) && !('cognition_engine_ids' in next));
});

test('create CE selection is part of the same request; unrelated edits omit CE membership', () => {
  const value = {name: 'MAS'},
    baseline = requestToForm(value),
    edited = clone(baseline);
  edited.cognition_engine_ids = ['current-environment-ce'];
  assert.deepEqual(mergeFormRequest(value, edited, baseline), {...value, cognition_engine_ids: ['current-environment-ce']});
  const explicit = {cognition_engine_ids: [], cognition_engine_configs: {ce: {value: true}}};
  assert.deepEqual(mergeFormRequest(explicit, requestToForm(explicit, saved), requestToForm(explicit, saved)), explicit);
});

test('new ID-only agents survive and blank new rows remain ignored', () => {
  const value = {name: 'MAS'},
    baseline = requestToForm(value),
    edited = clone(baseline);
  edited.agents.push(
    {agent_id: 'new-runtime', name: '', description: '', url: '', identity_type: '', identity_identifiers: ''},
    {agent_id: '', name: ''}
  );
  assert.deepEqual(mergeFormRequest(value, edited, baseline).agents, [{agent_id: 'new-runtime'}]);
});

test('new agents with generated IDs and no display name retain other entered fields', () => {
  const value = {name: 'MAS'},
    baseline = requestToForm(value),
    edited = clone(baseline);
  edited.agents.push({
    agent_id: '',
    name: '',
    description: 'Runs workflow',
    url: 'native::agent',
    identity_type: 'custom',
    identity_identifiers: '{"key":"value"}'
  });
  const next = mergeFormRequest(value, edited, baseline);
  assert.deepEqual(next.agents, [{description: 'Runs workflow', url: 'native::agent', identity: {type: 'custom', identifiers: {key: 'value'}}}]);
  validateRequest(next, 'create');
});

test('new API-valid empty-name MCP/tool rows retain descriptions and parameters', () => {
  const value = {name: 'MAS'},
    baseline = requestToForm(value),
    edited = clone(baseline);
  edited.mcp_servers.push({
    name: '',
    description: 'Configured server',
    transport: '',
    tools: [{name: '', description: 'Configured tool', parameters: '{"type":"object"}'}]
  });
  const next = mergeFormRequest(value, edited, baseline);
  assert.deepEqual(next.mcp_servers, [
    {name: '', description: 'Configured server', tools: [{name: '', description: 'Configured tool', parameters: {type: 'object'}}]}
  ]);
  validateRequest(next, 'create');
});

test('duplicate MCP server names, including empty names, are rejected on create and update', () => {
  for (const kind of ['create', 'update']) {
    for (const name of ['', 'documents', ' ']) {
      const value = {name: 'MAS', mcp_servers: [{name}, {name}]};
      assert.throws(
        () => validateRequest(value, kind),
        (error) => {
          const issues = requestErrorIssues(error);
          assert.deepEqual(
            issues.map((issue) => issue.path),
            [
              ['mcp_servers', 0, 'name'],
              ['mcp_servers', 1, 'name']
            ]
          );
          assert.ok(issues.every((issue) => issue.message.includes('Duplicate MCP server name')));
          return true;
        }
      );
    }
  }
});

test('duplicate tool names are rejected even when the MCP server name is empty', () => {
  for (const kind of ['create', 'update']) {
    for (const serverName of ['', 'documents']) {
      for (const name of ['', 'list_documents', ' ']) {
        const value = {name: 'MAS', mcp_servers: [{name: serverName, tools: [{name}, {name}]}]};
        assert.throws(
          () => validateRequest(value, kind),
          (error) => {
            const issues = requestErrorIssues(error);
            assert.deepEqual(
              issues.map((issue) => issue.path),
              [
                ['mcp_servers', 0, 'tools', 0, 'name'],
                ['mcp_servers', 0, 'tools', 1, 'name']
              ]
            );
            assert.ok(issues.every((issue) => issue.message.includes('Duplicate tool name')));
            return true;
          }
        );
      }
    }
  }
});

test('single blank names and repeated native tool names across different MCP servers remain valid', () => {
  const value = {
    name: 'MAS',
    mcp_servers: [
      {name: '', tools: [{name: ''}, {name: 'list'}]},
      {name: 'documents', tools: [{name: ''}, {name: 'list'}]},
      {name: 'optional', tools: null}
    ]
  };
  assert.deepEqual(supportedRequest(value, 'create'), value);
  assert.deepEqual(supportedRequest(value, 'update'), value);
});

test('MCP uniqueness preserves exact names without trimming or case folding', () => {
  const value = {
    name: 'MAS',
    mcp_servers: [{name: '', tools: [{name: ''}, {name: ' '}, {name: 'Tool'}, {name: 'tool'}]}, {name: ' '}, {name: 'Server'}, {name: 'server'}]
  };
  assert.deepEqual(supportedRequest(value, 'create'), value);
});

test('duplicate blank MCP names map to the configured form rows after empty rows are omitted', () => {
  const value = {name: 'MAS'},
    baseline = requestToForm(value),
    edited = clone(baseline);
  edited.mcp_servers.push(
    {name: '', tools: []},
    {name: '', description: 'First configured server', tools: []},
    {name: '', description: 'Second configured server', tools: []}
  );
  const request = mergeFormRequest(value, edited, baseline);
  assert.throws(
    () => supportedRequest(request, 'create'),
    (error) => {
      assert.deepEqual(
        requestErrorIssues(error).map((issue) => requestFormField(issue.path, edited)),
        ['mcp_servers.1.name', 'mcp_servers.2.name']
      );
      return true;
    }
  );
});

test('duplicate blank tool names map to configured tool rows after empty rows are omitted', () => {
  const value = {name: 'MAS'},
    baseline = requestToForm(value),
    edited = clone(baseline);
  edited.mcp_servers.push({
    name: '',
    description: 'Configured server',
    tools: [{name: ''}, {name: '', description: 'First tool'}, {name: '', parameters: '{}'}]
  });
  const request = mergeFormRequest(value, edited, baseline);
  assert.throws(
    () => supportedRequest(request, 'create'),
    (error) => {
      assert.deepEqual(
        requestErrorIssues(error).map((issue) => requestFormField(issue.path, edited)),
        ['mcp_servers.0.tools.1.name', 'mcp_servers.0.tools.2.name']
      );
      return true;
    }
  );
});

test('invalid form JSON is retained for correction and cannot produce a request', () => {
  const value = seedUpdateRequest(saved),
    baseline = requestToForm(value, saved),
    edited = clone(baseline);
  edited.config = '{';
  assert.throws(() => mergeFormRequest(value, edited, baseline), /config: Invalid JSON/);
  assert.equal(edited.config, '{');
  edited.config = '[]';
  assert.throws(() => validateRequest(mergeFormRequest(value, edited, baseline), 'update'), /config/);
});

test('schema failures retain structured paths for the visible form controls', () => {
  const current = requestToForm({name: '', agents: [{agent_id: 'a', identity: {type: 'x', identifiers: {key: 3}}}]});
  let caught;
  try {
    supportedRequest({name: '', agents: [{agent_id: 'a', identity: {type: 'x', identifiers: {key: 3}}}]}, 'create');
  } catch (error) {
    caught = error;
  }
  const issues = requestErrorIssues(caught);
  assert.deepEqual(
    issues.map((issue) => requestFormField(issue.path, current)),
    ['name', 'agents.0.identity_identifiers']
  );
  assert.equal(requestFormField(['config', 'body'], current), 'config');
  assert.equal(requestFormField(['agents', 0, 'config', 'hidden'], current), undefined);
});

test('form error indexes account for omitted blank agents, MCP servers and tools', () => {
  const value = seedUpdateRequest(saved),
    baseline = requestToForm(value),
    edited = clone(baseline);
  edited.agents.unshift({name: ''});
  edited.mcp_servers.unshift({name: '', tools: []});
  edited.mcp_servers[1].tools.unshift({name: '', parameters: ''});
  assert.equal(requestFormField(['agents', 0, 'identity', 'type'], edited), 'agents.1.identity_type');
  assert.equal(requestFormField(['mcp_servers', 0, 'tools', 0, 'parameters', 'properties'], edited), 'mcp_servers.1.tools.1.parameters');
  edited.agents[1].identity_identifiers = '{';
  assert.throws(
    () => mergeFormRequest(value, edited, baseline),
    (error) => {
      const issue = requestErrorIssues(error)[0];
      assert.equal(issue.message, 'Invalid JSON');
      assert.equal(requestFormField(issue.path, edited), 'agents.1.identity_identifiers');
      return true;
    }
  );
});

test('server 422 paths map to form fields while preserving the response text', () => {
  const error = {body: {detail: [{loc: ['body', 'mcp_servers', 0, 'tools', 0, 'parameters'], msg: 'Invalid schema', type: 'value_error'}]}};
  const issues = requestErrorIssues(error);
  assert.deepEqual(issues, [{path: ['mcp_servers', 0, 'tools', 0, 'parameters'], message: 'Invalid schema'}]);
  assert.equal(requestFormField(issues[0].path, requestToForm(seedUpdateRequest(saved))), 'mcp_servers.0.tools.0.parameters');
  assert.deepEqual(requestErrorIssues(new Error('Network unavailable')), []);
});

test('topology input errors retain a dedicated field path', () => {
  assert.throws(
    () => applyTopologyText({}, '{', true),
    (error) => {
      assert.deepEqual(requestErrorIssues(error), [{path: ['topologies'], message: 'Invalid JSON'}]);
      return true;
    }
  );
});

test('both, either and neither start/end marker are accepted without synthesizing edges', () => {
  for (const start of [false, true])
    for (const end of [false, true]) {
      const graph = {source: 'provided', completeness: 'partial', nodes: [{id: 'agent'}], edges: []};
      if (start) {
        graph.nodes.unshift({id: '__start__', type: 'start'});
        graph.edges.push({source: '__start__', target: 'agent'});
      }
      if (end) graph.nodes.push({id: '__end__', type: 'end'});
      const value = {topologies: [graph]};
      assert.deepEqual(validateRequest(value, 'update'), value);
      assert.deepEqual(supportedRequest(value, 'update'), value);
      assert.deepEqual(JSON.parse(topologyText(value)), [graph]);
    }
});

test('topology is included in supported writes', () => {
  const value = {name: 'MAS', topologies: [{source: 'provided', completeness: 'partial', nodes: [], edges: []}]};
  assert.deepEqual(supportedRequest(value, 'create'), value);
  assert.ok('topologies' in value);
  assert.equal(applyTopologyText(value, '', false), value);
  assert.deepEqual(applyTopologyText(value, '', true).topologies, []);
  assert.throws(() => applyTopologyText(value, '{', true), /topologies: Invalid JSON/);
});

test('explicitly cleared topology keeps request intent', () => {
  const cleared = applyTopologyText({name: 'MAS'}, '', true);
  assert.deepEqual(cleared.topologies, []);
  assert.equal(topologyText(cleared), '[]');
  const emptyGraph = {topologies: [{source: 'provided', completeness: 'partial', nodes: [], edges: []}]};
});

test('topology rejects observed writes, marker tools and dangling graph endpoints', () => {
  for (const graph of [
    {source: 'observed', completeness: 'partial', nodes: [], edges: []},
    {source: 'provided', completeness: 'partial', nodes: [{id: 'start', type: 'start', tool_ids: []}], edges: []},
    {source: 'provided', completeness: 'partial', nodes: [{id: 'a'}], edges: [{source: 'a', target: 'missing'}]}
  ])
    assert.throws(() => validateRequest({topologies: [graph]}, 'update'), /topologies/);
});

test('both 422 detail shapes show field paths and every dangling reference', () => {
  assert.equal(
    apiErrorMessage({detail: [{loc: ['body', 'agents', 0, 'identity', 'type'], msg: 'Field required', type: 'missing'}]}),
    'agents.0.identity.type: Field required'
  );
  const result = apiErrorMessage({
    detail: {code: 'dangling', message: 'Update or clear references', references: [{node_id: 'missing-agent'}, {tool_id: 'missing-tool'}]}
  });
  assert.match(result, /Update or clear references/);
  assert.match(result, /missing-agent/);
  assert.match(result, /missing-tool/);
  assert.ok(!result.includes('[object Object]'));
  assert.equal(apiErrorMessage({detail: 'Conflict'}), 'Conflict');
  assert.equal(apiErrorMessage({detail: [{loc: ['body', 'config', 'body'], msg: 'Invalid value'}]}), 'config.body: Invalid value');
});

test('error messages retain nested error text and unfamiliar structured details', () => {
  assert.equal(apiErrorMessage({detail: {error: 'CE already exists', existing_ce_id: 'ce-id'}}, 'Conflict'), 'CE already exists');
  assert.equal(apiErrorMessage({detail: {reason: 'Unavailable source'}}, 'Bad Request'), 'Unavailable source');
  const unknown = apiErrorMessage({detail: {code: 'custom', diagnostics: {text: 'Keep this explanation'}}});
  assert.match(unknown, /Keep this explanation/);
  assert.equal(apiErrorMessage({detail: []}, 'Bad Request'), 'Bad Request');
});

test('rich metadata seeds writable JSON without generated snapshot fields', () => {
  const definition = {name: 'read', inputSchema: {type: 'object'}, 'x-extension': [null, true]};
  const value = seedUpdateRequest({
    ...saved,
    metadata_schema_version: '1.0',
    metadata: {large: 'opaque'},
    documentation: [{content: 'notes', content_hash: 'hash', collected_at: 'now', resolution_state: 'inline'}],
    agents: [
      {
        ...saved.agents[0],
        agent_descriptions: [{format: 'future', content: {'x-extension': true}, support_state: 'unsupported', content_hash: 'hash'}]
      }
    ],
    mcp_servers: [
      {
        name: 'docs',
        tools: [
          {
            name: 'read',
            definition,
            source_snapshot: {name: 'original'},
            provenance: {state: 'derived', content_hash: 'hash', claims: {owner: 'operator'}}
          }
        ]
      }
    ],
    tools: [
      {
        tool_id: 'read',
        provider: {mcp_server_name: 'docs', native_tool_name: 'read'},
        definition,
        source_snapshot: {},
        provenance: {content_hash: 'hash'}
      }
    ],
    topologies: [{source: 'provided', completeness: 'partial', nodes: [{id: 'runtime-a'}], edges: [], updated_at: 'now'}]
  });
  assert.equal(supportedRequest(value, 'update'), value);
  assert.equal(value.topologies[0].updated_at, undefined);
  assert.equal(value.tools[0].definition, undefined);
  assert.equal(value.mcp_servers[0].tools[0].source_snapshot, undefined);
  assert.deepEqual(value.mcp_servers[0].tools[0].provenance, {owner: 'operator'});
  assert.deepEqual(value.documentation, [{content: 'notes'}]);
  assert.deepEqual(value.agents[0].agent_descriptions, [{format: 'future', content: {'x-extension': true}}]);
});

test('Form saves omit unchanged inventories and graph but retain explicit edits and clears', () => {
  const {formUpdateRequest} = sourceModule('../src/components/mas/mas-request-draft.ts');
  const original = {
    name: 'MAS',
    topologies: [{source: 'provided', completeness: 'partial', nodes: [], edges: []}],
    tools: [{tool_id: 'runtime'}],
    agents: [{agent_id: 'a'}],
    mcp_servers: [{name: 'docs'}]
  };
  assert.deepEqual(formUpdateRequest({...clone(original), name: 'New'}, original), {name: 'New'});
  assert.deepEqual(formUpdateRequest({...clone(original), topologies: [], tools: []}, original), {name: 'MAS', topologies: [], tools: []});
  assert.deepEqual(supportedRequest(clone(original), 'update'), original);
});

test('native tool form rename updates definition name and preserves extensions', () => {
  const original = {
    name: 'MAS',
    mcp_servers: [{name: 'docs', tools: [{name: 'read', definition: {name: 'read', inputSchema: {}, 'x-extra': true}}]}]
  };
  const baseline = requestToForm(original);
  const changed = clone(baseline);
  changed.mcp_servers[0].tools[0].name = 'renamed';
  const next = mergeFormRequest(original, changed, baseline);
  assert.equal(next.mcp_servers[0].tools[0].definition.name, 'renamed');
  assert.equal(next.mcp_servers[0].tools[0].definition['x-extra'], true);
});

test('document caller provenance is opaque while tool provenance unwraps only its claims', () => {
  const provenance = {claims: {signed: true}, issuer: 'provider', verification: 'caller-declared'};
  const value = seedUpdateRequest({
    ...saved,
    documentation: [{content: 'notes', provenance}],
    agents: [{...saved.agents[0], agent_descriptions: [{format: 'a2a', content: {}, provenance}]}]
  });
  assert.deepEqual(value.documentation[0].provenance, provenance);
  assert.deepEqual(value.agents[0].agent_descriptions[0].provenance, provenance);
});

test('combined native tool rename and legacy field edits keep full definition extensions', () => {
  const original = {
    mcp_servers: [
      {
        name: 'docs',
        tools: [
          {
            name: 'read',
            description: 'old',
            parameters: {},
            definition: {name: 'read', description: 'old', inputSchema: {}, outputSchema: {type: 'string'}, 'x-extra': true}
          }
        ]
      }
    ]
  };
  const baseline = requestToForm(original);
  const changed = clone(baseline);
  Object.assign(changed.mcp_servers[0].tools[0], {name: 'renamed', description: 'new', parameters: '{"type":"number"}'});
  const next = mergeFormRequest(original, changed, baseline).mcp_servers[0].tools[0];
  assert.deepEqual(next.definition, {
    name: 'renamed',
    description: 'new',
    inputSchema: {type: 'number'},
    outputSchema: {type: 'string'},
    'x-extra': true
  });
});

test('seed and save never turn server tool provenance into caller claims', () => {
  const bookkeeping = {content_hash: 'sha256:server-hash', collected_at: 'server-time', state: 'snapshot'};
  const value = seedUpdateRequest({
    ...saved,
    mcp_servers: [
      {
        name: 'docs',
        tools: [
          {name: 'read', description: 'Original', definition: {name: 'read', description: 'Original', inputSchema: {}}, provenance: bookkeeping},
          {name: 'list', definition: {name: 'list', inputSchema: {}}, provenance: bookkeeping}
        ]
      }
    ],
    tools: [{tool_id: 'unbound', definition: {name: 'unbound', inputSchema: {}}, provenance: bookkeeping}]
  });
  const jsonRequest = supportedRequest(value, 'update');
  assert.ok(jsonRequest.mcp_servers[0].tools.every((tool) => !Object.hasOwn(tool, 'provenance')));
  assert.ok(!Object.hasOwn(jsonRequest.tools[0], 'provenance'));
  const baseline = requestToForm(value);
  const edited = clone(baseline);
  edited.mcp_servers[0].tools[0].description = 'Edited';
  const {formUpdateRequest} = sourceModule('../src/components/mas/mas-request-draft.ts');
  const formRequest = supportedRequest(formUpdateRequest(mergeFormRequest(value, edited, baseline), value), 'update');
  assert.ok(formRequest.mcp_servers[0].tools.every((tool) => !Object.hasOwn(tool, 'provenance')));
  assert.equal(formRequest.mcp_servers[0].tools[1].definition.name, 'list');
});

test('tool claim objects, empty claims and explicit null claims retain their write meaning', () => {
  for (const claims of [{owner: 'provider', claims: {caller: true}}, {}, null]) {
    const value = seedUpdateRequest({
      ...saved,
      mcp_servers: [{name: 'docs', tools: [{name: 'read', provenance: {state: 'snapshot', content_hash: 'server', claims}}]}],
      tools: [{tool_id: 'unbound', provenance: {collected_at: 'server-time', claims}}]
    });
    assert.deepEqual(supportedRequest(value, 'update').mcp_servers[0].tools[0].provenance, claims);
    assert.deepEqual(value.tools[0].provenance, claims);
  }
});
