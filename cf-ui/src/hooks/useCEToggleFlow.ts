// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {useState} from 'react';
import {mutate as globalMutate} from 'swr';
import type {KeyedMutator} from 'swr';
import {cognitionEngineApi, type CognitionEngineDetail} from '@/api/endpoints/cognition-engine';
import {swrKeys} from '@/lib/swr-config';
import {parseError} from '@/lib/utils';
import {toast} from 'sonner';

export type ToggleStep = 'confirm' | null;

interface UseCEToggleFlowParams {
  cognitiveAgentId: string | undefined;
  ce: Pick<CognitionEngineDetail, 'ce_type' | 'enabled'> | undefined;
  mutate: KeyedMutator<CognitionEngineDetail>;
}

export function useCEToggleFlow({cognitiveAgentId, ce, mutate}: UseCEToggleFlowParams) {
  const [toggleStep, setToggleStep] = useState<ToggleStep>(null);
  const [isTogglingEnabled, setIsTogglingEnabled] = useState(false);

  const openToggleFlow = () => {
    if (!ce) {
      return;
    }
    setToggleStep('confirm');
  };

  const handleConfirmToggle = async () => {
    if (!cognitiveAgentId || !ce) {
      return;
    }
    setIsTogglingEnabled(true);
    try {
      const updated = await cognitionEngineApi.patch(cognitiveAgentId, {enabled: !ce.enabled});
      toast.success(`CE ${ce.ce_type} ${ce.enabled ? 'disabled' : 'enabled'} successfully`);
      await mutate(updated, {revalidate: false});
      await globalMutate(swrKeys.cognitionEngines());
      setToggleStep(null);
    } catch (err) {
      toast.error(parseError(err));
    } finally {
      setIsTogglingEnabled(false);
    }
  };

  return {
    toggleStep,
    setToggleStep,
    isTogglingEnabled,
    openToggleFlow,
    handleConfirmToggle
  };
}
