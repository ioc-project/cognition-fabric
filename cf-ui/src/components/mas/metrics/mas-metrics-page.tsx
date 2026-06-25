// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {useParams} from 'next/navigation';
import useSWR from 'swr';
import {masApi} from '@/api/endpoints';
import {useDefaultWorkspace} from '@/hooks/useDefaultWorkspace';
import {swrKeys} from '@/lib/swr-config';
import {BasePage} from '@/components/ui/base-page';
import {MASMetricsPanel} from './mas-metrics-panel';
import {routes} from '@/constants/routes';
import type {MultiAgenticSystem} from '@/api/endpoints/mas';

export default function MASMetricsPage() {
  const params = useParams();
  const rawMasId = params?.masId as string | string[] | undefined;
  const masId = Array.isArray(rawMasId) ? rawMasId[0] : rawMasId;

  const {defaultWorkspaceId} = useDefaultWorkspace();

  const {data: mas, isLoading} = useSWR<MultiAgenticSystem>(
    defaultWorkspaceId && masId ? swrKeys.masDetails(defaultWorkspaceId, masId) : null,
    () => masApi.get(defaultWorkspaceId!, masId!),
    {revalidateOnFocus: false}
  );

  const cognitionEngines =
    mas?.cognition_engines?.map((ce) => ({
      ce_id: ce.ce_id,
      name: ce.name ?? null
    })) ?? [];

  const agents =
    mas?.agents
      ?.map((a) => ({
        agent_id: a.agent_id ?? '',
        name: a.name ?? null
      }))
      .filter((a) => a.agent_id) ?? [];

  const crumbs = mas
    ? [
        {link: routes.mas.list, text: 'Multi-Agentic Systems'},
        {link: routes.mas.details(masId!), text: mas.name},
        {link: '', text: 'Metrics', active: true as const}
      ]
    : undefined;

  return (
    <BasePage title={mas ? `${mas.name} Metrics` : 'Metrics'} description="Token usage and LLM operation metrics" useBreadcrumbs breadcrumbs={crumbs}>
      {!isLoading && masId && <MASMetricsPanel masId={masId} cognitionEngines={cognitionEngines} agents={agents} />}
    </BasePage>
  );
}
