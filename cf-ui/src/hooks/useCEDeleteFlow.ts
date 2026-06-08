'use client';

import {useState} from 'react';
import {mutate as globalMutate} from 'swr';
import type {KeyedMutator} from 'swr';
import {cognitionEngineApi, type CognitionEngineDetail} from '@/api/endpoints/cognition-engine';
import {masApi, type MultiAgenticSystem} from '@/api/endpoints/mas';
import {swrKeys} from '@/lib/swr-config';
import {parseError} from '@/lib/utils';
import {toast} from 'sonner';

export type DeleteStep = 'disable' | 'disassociate' | 'delete' | null;

interface UseCEDeleteFlowParams {
  cognitiveAgentId: string | undefined;
  ce: Pick<CognitionEngineDetail, 'name' | 'enabled'> | undefined;
  defaultWorkspaceId: string | undefined;
  mutate: KeyedMutator<CognitionEngineDetail>;
  onDeleted: () => void;
}

export function useCEDeleteFlow({cognitiveAgentId, ce, defaultWorkspaceId, mutate, onDeleted}: UseCEDeleteFlowParams) {
  const [deleteStep, setDeleteStep] = useState<DeleteStep>(null);
  const [hasDisabled, setHasDisabled] = useState(false);
  const [associatedMas, setAssociatedMas] = useState<MultiAgenticSystem[]>([]);
  const [disassociatingIds, setDisassociatingIds] = useState<Set<string>>(new Set());
  const [disassociatedIds, setDisassociatedIds] = useState<Set<string>>(new Set());
  const [isDisabling, setIsDisabling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  const openDeleteFlow = async () => {
    setHasDisabled(false);
    setDisassociatedIds(new Set());
    setDisassociatingIds(new Set());
    setDisableError(null);
    setDeleteError(null);

    if (ce?.enabled) {
      setDeleteStep('disable');
      return;
    }

    const mas = await fetchAssociatedMas();
    setAssociatedMas(mas);
    setDeleteStep(mas.length > 0 ? 'disassociate' : 'delete');
  };

  const handleDisable = async () => {
    if (!cognitiveAgentId) {
      return;
    }
    setIsDisabling(true);
    setDisableError(null);
    try {
      const updated = await cognitionEngineApi.patch(cognitiveAgentId, {enabled: false});
      setHasDisabled(true);
      await mutate(updated, {revalidate: false});
      await globalMutate(swrKeys.cognitionEngines());
      toast.success(`Cognition Engine "${ce?.name}" disabled successfully`);

      const mas = await fetchAssociatedMas();
      setAssociatedMas(mas);
      setDeleteStep(mas.length > 0 ? 'disassociate' : 'delete');
    } catch (err) {
      setDisableError(parseError(err));
    } finally {
      setIsDisabling(false);
    }
  };

  const handleDisassociate = async (mas: MultiAgenticSystem) => {
    setDisassociatingIds((prev) => new Set(prev).add(mas.id));
    try {
      await masApi.disassociateCE(mas.workspace_id, mas.id, cognitiveAgentId as string);
      setDisassociatedIds((prev) => new Set(prev).add(mas.id));
      toast.success(`Disassociated from "${mas.name}"`);
    } catch (err) {
      toast.error(parseError(err));
    } finally {
      setDisassociatingIds((prev) => {
        const next = new Set(prev);
        next.delete(mas.id);
        return next;
      });
    }
  };

  const handleDelete = async () => {
    if (!cognitiveAgentId) {
      return;
    }
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await cognitionEngineApi.delete(cognitiveAgentId);
      toast.success(`Cognition Engine "${ce?.name}" deleted successfully`);
      await globalMutate(swrKeys.cognitionEngines());
      setDeleteStep(null);
      onDeleted();
    } catch (err) {
      setDeleteError(parseError(err));
    } finally {
      setIsDeleting(false);
    }
  };

  const pendingMas = associatedMas.filter((m) => !disassociatedIds.has(m.id));

  return {
    deleteStep,
    setDeleteStep,
    hasDisabled,
    associatedMas,
    disassociatingIds,
    disassociatedIds,
    isDisabling,
    isDeleting,
    disableError,
    setDisableError,
    deleteError,
    setDeleteError,
    pendingMas,
    openDeleteFlow,
    handleDisable,
    handleDisassociate,
    handleDelete
  };
}
