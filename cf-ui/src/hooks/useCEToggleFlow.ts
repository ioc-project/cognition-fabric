// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {useState} from 'react';
import {mutate as globalMutate} from 'swr';
import type {KeyedMutator} from 'swr';
import {cognitionEngineApi, type CognitionEngineDetail} from '@/api/endpoints/cognition-engine';
import {masApi, type MultiAgenticSystem} from '@/api/endpoints/mas';
import {swrKeys} from '@/lib/swr-config';
import {parseError} from '@/lib/utils';
import {toast} from 'sonner';

export type ToggleStep = 'disassociate' | 'confirm' | null;

interface UseCEToggleFlowParams {
  cognitiveAgentId: string | undefined;
  ce: Pick<CognitionEngineDetail, 'name' | 'enabled'> | undefined;
  defaultWorkspaceId: string | undefined;
  mutate: KeyedMutator<CognitionEngineDetail>;
}

export function useCEToggleFlow({cognitiveAgentId, ce, defaultWorkspaceId, mutate}: UseCEToggleFlowParams) {
  const [toggleStep, setToggleStep] = useState<ToggleStep>(null);
  const [toggleAssociatedMas, setToggleAssociatedMas] = useState<MultiAgenticSystem[]>([]);
  const [toggleDisassociatingIds, setToggleDisassociatingIds] = useState<Set<string>>(new Set());
  const [toggleDisassociatedIds, setToggleDisassociatedIds] = useState<Set<string>>(new Set());
  const [isTogglingEnabled, setIsTogglingEnabled] = useState(false);

  const fetchAssociatedMas = async (): Promise<MultiAgenticSystem[]> => {
    if (!defaultWorkspaceId || !cognitiveAgentId) {
      return [];
    }
    try {
      const masList = await masApi.list(defaultWorkspaceId);
      return masList.filter((mas) => mas.cognition_engines?.some((c) => c.ce_id === cognitiveAgentId));
    } catch {
      return [];
    }
  };

  const openToggleFlow = async () => {
    if (!ce) {
      return;
    }
    setToggleAssociatedMas([]);
    setToggleDisassociatedIds(new Set());
    setToggleDisassociatingIds(new Set());
    if (ce.enabled) {
      const mas = await fetchAssociatedMas();
      setToggleAssociatedMas(mas);
      setToggleStep(mas.length > 0 ? 'disassociate' : 'confirm');
    } else {
      setToggleStep('confirm');
    }
  };

  const handleToggleDisassociate = async (mas: MultiAgenticSystem) => {
    if (!cognitiveAgentId) {
      return;
    }
    setToggleDisassociatingIds((prev) => new Set(prev).add(mas.id));
    try {
      await masApi.disassociateCE(mas.workspace_id, mas.id, cognitiveAgentId);
      setToggleDisassociatedIds((prev) => new Set(prev).add(mas.id));
      toast.success(`Disassociated from "${mas.name}"`);
    } catch (err) {
      toast.error(parseError(err));
    } finally {
      setToggleDisassociatingIds((prev) => {
        const next = new Set(prev);
        next.delete(mas.id);
        return next;
      });
    }
  };

  const handleConfirmToggle = async () => {
    if (!cognitiveAgentId || !ce) {
      return;
    }
    setIsTogglingEnabled(true);
    try {
      const updated = await cognitionEngineApi.patch(cognitiveAgentId, {enabled: !ce.enabled});
      toast.success(`Cognition Engine "${ce.name}" ${ce.enabled ? 'disabled' : 'enabled'} successfully`);
      await mutate(updated, {revalidate: false});
      await globalMutate(swrKeys.cognitionEngines());
      setToggleStep(null);
    } catch (err) {
      toast.error(parseError(err));
    } finally {
      setIsTogglingEnabled(false);
    }
  };

  const togglePendingMas = toggleAssociatedMas.filter((m) => !toggleDisassociatedIds.has(m.id));

  return {
    toggleStep,
    setToggleStep,
    toggleAssociatedMas,
    toggleDisassociatedIds,
    toggleDisassociatingIds,
    togglePendingMas,
    isTogglingEnabled,
    openToggleFlow,
    handleToggleDisassociate,
    handleConfirmToggle
  };
}
