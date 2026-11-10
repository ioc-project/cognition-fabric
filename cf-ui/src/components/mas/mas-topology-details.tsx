// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {useEffect, useRef} from 'react';
import {motion, useReducedMotion} from 'framer-motion';
import {X} from 'lucide-react';
import {InlineId} from '@/components/ui/inline-id';
import {SyntaxJson} from '@/components/ui/syntax-json';
import {toolAssignmentSummary} from './mas-topology-model';
import type {TopologyAgentNode, TopologyGraph, TopologyMAS} from './mas-topology-model';
import styles from './mas-topology.module.css';

function DetailRow({label, value}: {label: string; value: string | null | undefined}) {
  return (
    <div className={styles.detailRow}>
      <span>{label}</span>
      <span>{value || 'Not supplied'}</span>
    </div>
  );
}

function DetailJSON({label, value}: {label: string; value: unknown}) {
  if (value === undefined || value === null) {
    return null;
  }
  return (
    <details className={styles.detailJSON}>
      <summary>{label}</summary>
      <SyntaxJson code={JSON.stringify(value, null, 2)} />
    </details>
  );
}

export function MASTopologyDetails({
  id,
  node,
  graph,
  mas,
  onClose
}: {
  id: string;
  node: TopologyAgentNode;
  graph: TopologyGraph;
  mas: TopologyMAS;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const reduceMotion = useReducedMotion();
  const agent = node.kind === 'agent' ? mas.agents?.find((item) => item.agent_id === node.id) : undefined;
  const tools = new Map((mas.tools ?? []).map((tool) => [tool.tool_id, tool]));
  const relationships = graph.edges.filter((edge) => edge.source === node.id || edge.target === node.id);
  const title = node.kind === 'agent' ? 'Agent details' : 'Topology node details';

  useEffect(() => {
    closeRef.current?.focus({preventScroll: true});
  }, [node.id]);

  return (
    <motion.aside
      id={id}
      aria-label={title}
      className={styles.panel}
      initial={reduceMotion ? false : {opacity: 0, x: 20}}
      animate={{opacity: 1, x: 0}}
      exit={reduceMotion ? {opacity: 0} : {opacity: 0, x: 20}}
      transition={{duration: reduceMotion ? 0 : 0.15}}
    >
      <div className={styles.panelHeader}>
        <span>Inspect</span>
        <button ref={closeRef} type="button" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <div className={styles.panelBody} role="region" aria-label={`${title} content`} tabIndex={0}>
        <p className={styles.panelKind}>{node.kind === 'agent' ? 'Agent' : node.kind === 'start' ? 'Start node' : 'End node'}</p>
        <h4 className={styles.panelTitle}>{node.name}</h4>
        <div className="mb-4 mt-2 flex items-start gap-1.5">
          <span aria-hidden="true" className="text-xs text-slate-400">
            #
          </span>
          <InlineId value={node.id} truncate={false} alwaysShowCopyIcon className="min-w-0 text-slate-400 hover:text-slate-200" />
        </div>
        <DetailRow label="source" value={graph.source} />
        {node.isolated && <p className={styles.detailNote}>No declared edges</p>}
        {node.kind === 'agent' && (
          <>
            <div className={styles.detailRow}>
              <span>internal ID</span>
              {agent?.cf_agent_id ? (
                <InlineId value={agent.cf_agent_id} truncate={false} alwaysShowCopyIcon className="min-w-0 text-slate-300 hover:text-slate-100" />
              ) : (
                <span>Not supplied</span>
              )}
            </div>
            <p className={styles.sectionLabel}>Description</p>
            <p className={styles.description}>{agent?.description || 'Not supplied'}</p>
            <DetailRow label="URL" value={agent?.url} />
            <DetailRow label="identity type" value={agent?.identity?.type} />
            {!agent && <p className={styles.detailNote}>Agent inventory details have not been supplied for this node.</p>}
            <DetailJSON label="Identity identifiers" value={agent?.identity?.identifiers} />
            <DetailJSON label="Configuration" value={agent?.config} />
            <DetailJSON label="Metadata" value={agent?.metadata} />
            <DetailJSON label="Agent descriptions" value={agent?.agent_descriptions} />
            <p className={styles.sectionLabel}>Assigned tools</p>
            {!node.tools?.length ? (
              <p className={styles.detailNote}>{toolAssignmentSummary(node.tools)}</p>
            ) : (
              <ul className={styles.toolList}>
                {node.tools.map((assignment) => {
                  const tool = tools.get(assignment.id);
                  const description = tool?.definition?.description;
                  return (
                    <li key={assignment.id}>
                      <code>{assignment.id}</code>
                      {assignment.provider && <p className={styles.detailNote}>{assignment.provider}</p>}
                      {typeof description === 'string' && description && <p className={styles.description}>{description}</p>}
                      {assignment.unresolved && <p className={styles.detailNote}>Definition not supplied</p>}
                      <DetailJSON label={`${assignment.id} JSON`} value={tool} />
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
        <p className={styles.sectionLabel}>Directed relationships ({relationships.length})</p>
        {relationships.length ? (
          <ul className={styles.relationshipList}>
            {relationships.map((edge, index) => (
              <li key={index}>
                <code>{edge.source}</code> → <code>{edge.target}</code>
                {edge.interaction_type && ` (${edge.interaction_type})`}
                {edge.conditional && ' · conditional'}
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.detailNote}>No relationships declared.</p>
        )}
      </div>
    </motion.aside>
  );
}
