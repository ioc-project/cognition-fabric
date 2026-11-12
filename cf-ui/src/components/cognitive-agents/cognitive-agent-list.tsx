// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {useMemo, useState} from 'react';
import {BrainCircuit} from 'lucide-react';
import {useRouter} from 'next/navigation';
import {mutate as globalMutate} from 'swr';
import {Button} from '@/components/ui/button';
import {SearchInput} from '@/components/ui/search-input';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {ListShell} from '@/components/ui/list-shell';
import {BasePage} from '@/components/ui/base-page';
import {routes} from '@/constants/routes';
import {parseError, compareTimestamps} from '@/lib/utils';
import {toast} from 'sonner';
import {useCognitionEngines} from '@/hooks/useCognitionEngines';
import {useDefaultWorkspace} from '@/hooks/useDefaultWorkspace';
import {CognitiveAgentTableList} from '@/components/cognitive-agents/cognitive-agent-table-list';
import {CognitiveAgentCardList} from '@/components/cognitive-agents/cognitive-agent-card-list';
import {CognitionEngineDialogs} from '@/components/cognitive-agents/cognition-engine-dialogs';
import {cognitionEngineApi, type CognitionEngineListItem} from '@/api/endpoints/cognition-engine';
import {masApi, type MultiAgenticSystem} from '@/api/endpoints/mas';
import {swrKeys} from '@/lib/swr-config';
import type {ToggleStep} from '@/hooks/useCEToggleFlow';
import type {DeleteStep} from '@/hooks/useCEDeleteFlow';

type SortConfig = {key: string; dir: 'asc' | 'desc'} | null;

export function CognitiveAgentList() {
  const router = useRouter();
  const {defaultWorkspaceId} = useDefaultWorkspace();
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

  const {cognitionEngines = [], isLoading, error, mutate} = useCognitionEngines();

  function toggleSort(key: string) {
    setSortConfig((prev) => (prev?.key === key ? (prev.dir === 'asc' ? {key, dir: 'desc'} : null) : {key, dir: 'asc'}));
  }

  const displayedCEs = useMemo(() => {
    let items: CognitionEngineListItem[] = [...cognitionEngines];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.ce_type.toLowerCase().includes(q) ||
          r.version.toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q)
      );
    }
    if (sortConfig) {
      const {key, dir} = sortConfig;
      items.sort((a, b) => {
        let cmp = 0;
        if (key === 'name' || key === 'version' || key === 'ce_type' || key === 'status') {
          cmp = ((a[key as keyof CognitionEngineListItem] as string) ?? '').localeCompare((b[key as keyof CognitionEngineListItem] as string) ?? '');
        } else {
          cmp = compareTimestamps(a.created_at, b.created_at);
        }
        return dir === 'asc' ? cmp : -cmp;
      });
    }
    return items;
  }, [cognitionEngines, searchQuery, sortConfig]);

  const [toggleTarget, setToggleTarget] = useState<CognitionEngineListItem | null>(null);
  const [toggleStep, setToggleStep] = useState<ToggleStep>(null);
  const [isTogglingEnabled, setIsTogglingEnabled] = useState(false);

  const handleToggleEnabled = (r: CognitionEngineListItem) => {
    setToggleTarget(r);
    setToggleStep('confirm');
  };

  const handleConfirmToggle = async () => {
    if (!toggleTarget) {
      return;
    }
    setIsTogglingEnabled(true);
    try {
      await cognitionEngineApi.patch(toggleTarget.id, {enabled: !toggleTarget.enabled});
      toast.success(`CE ${toggleTarget.name} ${toggleTarget.enabled ? 'disabled' : 'enabled'} successfully`);
      await mutate();
      await globalMutate(swrKeys.cognitionEngines());
      setToggleStep(null);
      setToggleTarget(null);
    } catch (err) {
      toast.error(parseError(err));
    } finally {
      setIsTogglingEnabled(false);
    }
  };

  const [deleteTarget, setDeleteTarget] = useState<CognitionEngineListItem | null>(null);
  const [deleteStep, setDeleteStep] = useState<DeleteStep>(null);
  const [hasDisabled, setHasDisabled] = useState(false);
  const [associatedMas, setAssociatedMas] = useState<MultiAgenticSystem[]>([]);
  const [disassociatingIds, setDisassociatingIds] = useState<Set<string>>(new Set());
  const [disassociatedIds, setDisassociatedIds] = useState<Set<string>>(new Set());
  const [isDisabling, setIsDisabling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchAssociatedMas = async (ceId: string): Promise<MultiAgenticSystem[]> => {
    if (!defaultWorkspaceId) {
      return [];
    }
    try {
      const masList = await masApi.list(defaultWorkspaceId);
      return masList.filter((mas) => mas.cognition_engines?.some((c) => c.ce_id === ceId));
    } catch {
      return [];
    }
  };

  const openDeleteFlow = async (r: CognitionEngineListItem) => {
    setDeleteTarget(r);
    setHasDisabled(false);
    setDisassociatedIds(new Set());
    setDisassociatingIds(new Set());
    setDisableError(null);
    setDeleteError(null);

    if (r.enabled) {
      setDeleteStep('disable');
      return;
    }

    const mas = await fetchAssociatedMas(r.id);
    setAssociatedMas(mas);
    setDeleteStep(mas.length > 0 ? 'disassociate' : 'delete');
  };

  const handleDisable = async () => {
    if (!deleteTarget) {
      return;
    }
    setIsDisabling(true);
    setDisableError(null);
    try {
      await cognitionEngineApi.patch(deleteTarget.id, {enabled: false});
      setHasDisabled(true);
      await mutate();
      await globalMutate(swrKeys.cognitionEngines());
      toast.success(`CE ${deleteTarget.name} disabled successfully`);

      const mas = await fetchAssociatedMas(deleteTarget.id);
      setAssociatedMas(mas);
      setDeleteStep(mas.length > 0 ? 'disassociate' : 'delete');
    } catch (err) {
      setDisableError(parseError(err));
    } finally {
      setIsDisabling(false);
    }
  };

  const handleDisassociate = async (mas: MultiAgenticSystem) => {
    if (!deleteTarget) {
      return;
    }
    setDisassociatingIds((prev) => new Set(prev).add(mas.id));
    try {
      await masApi.disassociateCE(mas.workspace_id, mas.id, deleteTarget.id);
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

  const pendingMas = associatedMas.filter((m) => !disassociatedIds.has(m.id));

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await cognitionEngineApi.delete(deleteTarget.id);
      toast.success(`CE ${deleteTarget.name} deleted successfully`);
      await mutate();
      await globalMutate(swrKeys.cognitionEngines());
      setDeleteStep(null);
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(parseError(err));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="space-y-8">
        <BasePage
          title="Cognition Engines"
          description="View your Cognition Engines"
          callToAction={
            cognitionEngines.length > 0 ? (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setViewMode(viewMode === 'table' ? 'card' : 'table')}>
                  {viewMode === 'table' ? 'Card View' : 'Table View'}
                </Button>
              </div>
            ) : undefined
          }
        >
          <ConditionalSWRRenderer
            data={cognitionEngines}
            error={error}
            itemName="Cognition Engines"
            customIsLoading={isLoading}
            customEmptyComponent={
              <div className="flex items-center justify-center min-h-[50vh]">
                <ListShell
                  empty={{
                    icon: BrainCircuit,
                    title: 'No Cognition Engines yet.',
                    description: 'Cognition engines will appear here once they are created.'
                  }}
                />
              </div>
            }
          >
            <div className="space-y-6">
              <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search…" className="max-w-xs" />
              {viewMode === 'table' ? (
                <CognitiveAgentTableList
                  cognitiveAgents={displayedCEs}
                  selectedId={selectedId}
                  onRowClick={(r) => {
                    setSelectedId(r.id);
                    router.push(routes.cognitiveAgents.details(r.id));
                  }}
                  onOpenEdit={(r) => router.push(`${routes.cognitiveAgents.details(r.id)}?edit=true`)}
                  onOpenDelete={openDeleteFlow}
                  onToggleEnabled={handleToggleEnabled}
                  sortConfig={sortConfig}
                  onSort={toggleSort}
                />
              ) : (
                <CognitiveAgentCardList
                  cognitiveAgents={displayedCEs}
                  selectedId={selectedId}
                  onCardClick={(r) => {
                    setSelectedId(r.id);
                    router.push(routes.cognitiveAgents.details(r.id));
                  }}
                  onOpenEdit={(r) => router.push(`${routes.cognitiveAgents.details(r.id)}?edit=true`)}
                  onOpenDelete={openDeleteFlow}
                  onToggleEnabled={handleToggleEnabled}
                />
              )}
            </div>
          </ConditionalSWRRenderer>
        </BasePage>
      </div>

      <CognitionEngineDialogs
        toggleCeName={toggleTarget?.name}
        toggleCeEnabled={toggleTarget?.enabled}
        toggleStep={toggleStep}
        setToggleStep={setToggleStep}
        onConfirmToggle={handleConfirmToggle}
        isTogglingEnabled={isTogglingEnabled}
        deleteCeName={deleteTarget?.name}
        deleteStep={deleteStep}
        setDeleteStep={setDeleteStep}
        setDisableError={setDisableError}
        setDeleteError={setDeleteError}
        hasDisabled={hasDisabled}
        associatedMas={associatedMas}
        disassociatedIds={disassociatedIds}
        disassociatingIds={disassociatingIds}
        pendingMas={pendingMas}
        onDisassociate={handleDisassociate}
        onDisable={handleDisable}
        onDelete={handleDelete}
        isDisabling={isDisabling}
        isDeleting={isDeleting}
        disableError={disableError}
        deleteError={deleteError}
      />
    </>
  );
}
