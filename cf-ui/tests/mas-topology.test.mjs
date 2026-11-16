// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const url = new URL('../src/components/mas/mas-topology-model.ts', import.meta.url);
const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}
}).outputText;
const module = {exports: {}};
new Function('require', 'module', 'exports', compiled)(createRequire(url), module, module.exports);
const {topologySourceView, topologyNodes, toolAssignmentSummary} = module.exports;
const graph = (source = 'provided') => ({
  source,
  completeness: 'partial',
  nodes: [
    {id: 'a', type: 'agent'},
    {id: 'b', type: 'agent', tool_ids: []}
  ],
  edges: [
    {source: 'a', target: 'b'},
    {source: 'b', target: 'a'},
    {source: 'a', target: 'a'}
  ]
});

test('both, either and neither source remain independent without substitution', () => {
  for (const provided of [true, false])
    for (const observed of [true, false]) {
      const graphs = [...(provided ? [graph()] : []), ...(observed ? [graph('observed')] : [])];
      const mas = {
        topologies: graphs,
        topology_sources: {provided: {status: provided ? 'available' : 'absent'}, observed: {status: observed ? 'available' : 'disabled'}}
      };
      for (const source of ['provided', 'observed']) {
        const view = topologySourceView(mas, source);
        if (source === 'provided' ? provided : observed) {
          assert.equal(view.status, 'available');
          assert.equal(
            view.graph,
            graphs.find((g) => g.source === source)
          );
        } else {
          assert.equal(view.status, source === 'provided' ? 'absent' : 'disabled');
          assert.ok(!('graph' in view));
        }
      }
    }
});

test('legacy optional metadata and empty inventories remain usable', () => {
  for (const mas of [{}, {topologies: null, agents: null, tools: null}, {topologies: []}]) {
    assert.equal(topologySourceView(mas, 'provided').status, 'absent');
    assert.equal(topologySourceView(mas, 'observed').status, 'disabled');
    assert.deepEqual(topologyNodes({nodes: [], edges: []}, mas), []);
  }
  const supplied = graph();
  assert.equal(topologySourceView({topologies: [supplied]}, 'provided').graph, supplied);
});

test('disabled, absent and unavailable sources do not expose another source JSON', () => {
  for (const status of ['disabled', 'absent', 'unavailable']) {
    const mas = {topologies: [graph()], topology_sources: {provided: {status}}};
    const view = topologySourceView(mas, 'provided');
    assert.equal(view.status, status);
    assert.ok(view.message);
    assert.ok(!('graph' in view));
  }
});

test('explicitly empty and partial graphs are available, missing or malformed graph data is unavailable', () => {
  const empty = {source: 'provided', completeness: 'complete', nodes: [], edges: []};
  assert.equal(topologySourceView({topologies: [empty]}, 'provided').graph, empty);
  assert.equal(topologySourceView({topologies: [graph()]}, 'provided').graph.completeness, 'partial');
  for (const data of [
    undefined,
    null,
    {...graph(), nodes: null},
    {...graph(), edges: null},
    {...graph(), nodes: [null]},
    {...graph(), edges: [{source: 'a', target: 'missing'}]},
    {...graph(), nodes: [...graph().nodes, {id: 'a', type: 'end'}]},
    {...graph(), nodes: [{id: 'a', type: 'helper'}]}
  ]) {
    const view = topologySourceView({topologies: data === undefined ? [] : [data], topology_sources: {provided: {status: 'available'}}}, 'provided');
    assert.equal(view.status, 'unavailable');
    assert.ok(view.message.includes('missing or invalid'));
  }
});

test('all four optional start/end combinations preserve supplied nodes, cycles, self-edges and disconnection', () => {
  for (const start of [false, true])
    for (const end of [false, true]) {
      const value = graph();
      value.nodes.push({id: 'isolated', type: 'agent'});
      if (start) {
        value.nodes.push({id: 'entry', type: 'start'});
        value.edges.push({source: 'entry', target: 'a'});
      }
      if (end) value.nodes.push({id: 'exit', type: 'end'});
      const before = structuredClone(value);
      const mas = {topologies: [value]};
      assert.equal(topologySourceView(mas, 'provided').status, 'available');
      const nodes = topologyNodes(value, mas);
      assert.deepEqual(
        nodes.map((n) => n.id),
        value.nodes.map((n) => n.id)
      );
      assert.equal(nodes.filter((n) => n.kind === 'start').length, Number(start));
      assert.equal(nodes.filter((n) => n.kind === 'end').length, Number(end));
      assert.ok(nodes.every((n) => Number.isFinite(n.position.x) && Number.isFinite(n.position.y)));
      assert.equal(new Set(nodes.map((n) => JSON.stringify(n.position))).size, nodes.length);
      assert.deepEqual(value, before);
    }
});

test('only assigned runtime tool IDs appear; missing, empty and unresolved assignments stay distinct', () => {
  const value = graph();
  value.nodes.push({id: 'c', type: 'agent', tool_ids: ['bound', 'standalone', 'unknown']}, {id: 'entry', type: 'start'});
  const mas = {
    agents: [
      {agent_id: 'a', name: null},
      {agent_id: 'b', name: 'Named agent'},
      {agent_id: 'c', name: ''}
    ],
    tools: [
      {tool_id: 'bound', provider: {mcp_server_name: 'documents', native_tool_name: 'native'}},
      {tool_id: 'standalone'},
      {tool_id: 'not-assigned'}
    ]
  };
  const nodes = topologyNodes(value, mas);
  assert.equal(nodes[0].name, 'a');
  assert.equal(nodes[1].name, 'Named agent');
  assert.equal(nodes[2].name, 'c');
  assert.equal(nodes[0].tools, undefined);
  assert.deepEqual(nodes[1].tools, []);
  assert.deepEqual(nodes[2].tools, [
    {id: 'bound', provider: 'documents / native', unresolved: false},
    {id: 'standalone', provider: undefined, unresolved: false},
    {id: 'unknown', provider: undefined, unresolved: true}
  ]);
  assert.equal(nodes[3].tools, undefined);
  assert.equal(toolAssignmentSummary(nodes[0].tools), 'Tool assignments unknown');
  assert.equal(toolAssignmentSummary(nodes[1].tools), 'No tools declared');
  assert.equal(toolAssignmentSummary(nodes[2].tools), '3 assigned tools');
  assert.ok(!JSON.stringify(nodes).includes('not-assigned'));
});

test('long IDs and long tool lists are preserved without mutation or special property-name collisions', () => {
  const value = {
    source: 'observed',
    completeness: 'partial',
    nodes: [
      {id: '__proto__', type: 'agent', tool_ids: Array.from({length: 50}, (_, i) => `very_long_runtime_tool_name_${i}_${'x'.repeat(100)}`)},
      {id: 'a'.repeat(256), type: 'agent'}
    ],
    edges: []
  };
  const before = structuredClone(value);
  const nodes = topologyNodes(value, {agents: [], tools: []});
  assert.equal(nodes[0].id, '__proto__');
  assert.equal(nodes[0].tools.length, 50);
  assert.equal(nodes[1].id.length, 256);
  assert.deepEqual(
    nodes[0].tools.map((t) => t.id),
    value.nodes[0].tool_ids
  );
  assert.deepEqual(value, before);
});

test('Management reads with omitted node type default to agents without changing source JSON', () => {
  const value = {
    source: 'provided',
    completeness: 'partial',
    nodes: [{id: 'reader', tool_ids: []}, {id: '__start__'}, {id: 'entry', type: 'start'}, {id: 'finish', type: 'end'}],
    edges: [{source: 'entry', target: 'reader'}]
  };
  const before = structuredClone(value);
  const mas = {topologies: [value], agents: [{agent_id: 'reader', name: 'Reader'}]};
  assert.equal(topologySourceView(mas, 'provided').status, 'available');
  const nodes = topologyNodes(value, mas);
  assert.deepEqual(
    nodes.map((node) => node.kind),
    ['agent', 'agent', 'start', 'end']
  );
  assert.equal(nodes[0].name, 'Reader');
  assert.deepEqual(nodes[0].tools, []);
  assert.equal(nodes[1].name, '__start__');
  assert.equal(nodes[1].tools, undefined);
  assert.deepEqual(value, before);
  for (const type of [null, '', 'helper']) {
    assert.equal(topologySourceView({topologies: [{...value, nodes: [{id: 'reader', type}], edges: []}]}, 'provided').status, 'unavailable');
  }
  assert.equal(topologySourceView({topologies: [{...value, completeness: undefined}]}, 'provided').status, 'unavailable');
});

test('NOA is layered from Start through moderator and specialists, with its unconnected End separate and rightmost', () => {
  // Same nodes and directed relationships as the CFN NOA onboarding declaration.
  // Keep this fixture self-contained so the UI suite needs no sibling checkout.
  const value = {
    source: 'provided',
    completeness: 'partial',
    nodes: [
      {id: '__start__', type: 'start'},
      {id: 'moderator', type: 'agent'},
      {id: 'schedule_agent', type: 'agent'},
      {id: 'itinerary_agent', type: 'agent'},
      {id: 'concierge_agent', type: 'agent'},
      {id: '__end__', type: 'end'}
    ],
    edges: [
      {source: '__start__', target: 'moderator'},
      ...['schedule_agent', 'itinerary_agent', 'concierge_agent'].flatMap((id) => [
        {source: 'moderator', target: id, interaction_type: 'delegation'},
        {source: id, target: 'moderator'}
      ])
    ]
  };
  const before = structuredClone(value);
  for (const input of [value, {...value, nodes: [...value.nodes].reverse()}]) {
    const nodes = topologyNodes(input, {}),
      byId = new Map(nodes.map((node) => [node.id, node]));
    const start = byId.get('__start__'),
      moderator = byId.get('moderator'),
      end = byId.get('__end__');
    const specialists = ['schedule_agent', 'itinerary_agent', 'concierge_agent'].map((id) => byId.get(id));
    assert.ok(
      nodes.every((node) => node.position.x >= start.position.x),
      'Start must be leftmost'
    );
    assert.ok(start.position.x < moderator.position.x);
    assert.equal(new Set(specialists.map((node) => node.position.x)).size, 1, 'Specialists must share a column');
    assert.ok(specialists.every((node) => node.position.x > moderator.position.x));
    assert.ok(
      nodes.every((node) => node === end || node.position.x < end.position.x),
      'End must be rightmost'
    );
    assert.equal(end.isolated, true);
    assert.ok(
      nodes.filter((node) => !node.isolated).every((node) => node.position.y + node.height < end.position.y),
      'Isolated End must occupy a separate row'
    );
  }
  assert.deepEqual(value, before, 'Layout must not fabricate the missing End relationship');
});

test('layering supports multiple starts, incoming-free roots and disconnected rootless cycles', () => {
  for (const markers of [true, false]) {
    const value = {
      nodes: [
        {id: 'root-a', ...(markers ? {type: 'start'} : {})},
        {id: 'root-b', ...(markers ? {type: 'start'} : {})},
        {id: 'shared'},
        {id: 'cycle-a'},
        {id: 'cycle-b'},
        {id: 'alone'}
      ],
      edges: [
        {source: 'root-a', target: 'shared'},
        {source: 'root-b', target: 'shared'},
        {source: 'cycle-a', target: 'cycle-b'},
        {source: 'cycle-b', target: 'cycle-a'},
        {source: 'cycle-a', target: 'cycle-a'}
      ]
    };
    const nodes = topologyNodes(value, {}),
      byId = new Map(nodes.map((node) => [node.id, node]));
    assert.equal(byId.get('root-a').rank, 0);
    assert.equal(byId.get('root-b').rank, 0);
    assert.equal(byId.get('shared').rank, 1);
    assert.equal(byId.get('alone').isolated, true);
    assert.ok(nodes.every((node) => Number.isFinite(node.position.x) && Number.isFinite(node.position.y)));
    assert.equal(new Set(nodes.map((node) => JSON.stringify(node.position))).size, nodes.length);
  }
});

test('measured node heights keep same-column nodes separated', () => {
  const value = {
    nodes: [{id: 'root', type: 'start'}, {id: 'first'}, {id: 'second'}, {id: 'third'}],
    edges: ['first', 'second', 'third'].map((id) => ({source: 'root', target: id}))
  };
  const heights = new Map([
    ['root', 80],
    ['first', 140],
    ['second', 410],
    ['third', 120]
  ]);
  const nodes = topologyNodes(value, {}, heights).filter((node) => node.kind === 'agent');
  assert.equal(new Set(nodes.map((node) => node.position.x)).size, 1);
  for (let i = 1; i < nodes.length; i++) {
    assert.ok(nodes[i].position.y > nodes[i - 1].position.y + heights.get(nodes[i - 1].id));
  }
});
