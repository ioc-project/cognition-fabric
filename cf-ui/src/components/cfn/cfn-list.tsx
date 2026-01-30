'use client';

import {useState} from 'react';
import {Network, Plus} from 'lucide-react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {ListShell} from '@/components/ui/list-shell';
import {BasePage} from '@/components/ui/base-page';
import {ConfirmDialog} from '@/components/ui/confirm-dialog';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {CfnTableList} from './cfn-table-list';
import {CfnCardList} from './cfn-card-list';
import {useConfirmDialog} from '@/hooks/useConfirmDialog';
import {useCfn} from '@/hooks/useApi';
import {parseError} from '@/lib/utils';
import {toast} from 'sonner';
import {routes} from '@/constants/routes';
import type {Cfn} from '@/api/types';

interface CfnListProps {
  workspaceId: string;
}

export function CfnList({workspaceId}: CfnListProps) {
  const router = useRouter();
  const {cfns = [], isLoading: loading, error: swrError, deleteCfn, mutate} = useCfn(workspaceId);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteDialog = useConfirmDialog<{cfn_id: string; cfn_name: string}>();
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleDelete = async () => {
    await deleteDialog.confirm(async (data) => {
      try {
        await deleteCfn(data.cfn_id);
        toast.success(`Cognitive Fabric Node "${data.cfn_name}" deleted successfully`);
      } catch (err) {
        const errorMessage = parseError(err);
        setDeleteError(errorMessage);
        throw err;
      }
    });
  };

  return (
    <>
      <div className="space-y-8">
        <BasePage
          title="Cognitive Fabric Nodes"
          description="View and manage Cognitive Fabric Nodes"
          callToAction={
            <div className="flex gap-2">
              {cfns.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => setViewMode(viewMode === 'table' ? 'card' : 'table')}>
                  {viewMode === 'table' ? 'Card View' : 'Table View'}
                </Button>
              )}
              <Button asChild variant="sidebar" className="gap-2">
                <Link href={routes.workspaces.cfn.create(workspaceId)}>
                  <Plus className="w-4 h-4" />
                  Create CFN
                </Link>
              </Button>
            </div>
          }
        >
          <ConditionalSWRRenderer
            data={cfns}
            error={swrError}
            itemName="Cognitive Fabric Nodes"
            customIsLoading={loading}
            customEmptyComponent={
              <div className="flex items-center justify-center min-h-[50vh]">
                <ListShell
                  empty={{
                    icon: Network,
                    title: 'No Cognitive Fabric Nodes exist in this workspace.',
                    description: 'Create a Cognitive Fabric Node to start managing your distributed memory plane.',
                    actionLabel: 'Create Cognitive Fabric Node',
                    href: routes.workspaces.cfn.create(workspaceId)
                  }}
                />
              </div>
            }
          >
            {viewMode === 'table' ? (
              <CfnTableList
                cfns={cfns}
                workspaceId={workspaceId}
                selectedId={selectedId}
                onRowClick={(cfn) => {
                  setSelectedId(cfn.cfn_id);
                  router.push(routes.workspaces.cfn.details(workspaceId, cfn.cfn_id));
                }}
                onOpenDelete={(payload) => deleteDialog.open(payload)}
                onOpenEdit={(cfn) => router.push(`${routes.workspaces.cfn.details(workspaceId, cfn.cfn_id)}?edit=true`)}
              />
            ) : (
              <CfnCardList
                cfns={cfns}
                workspaceId={workspaceId}
                selectedId={selectedId}
                onCardClick={(cfn) => {
                  setSelectedId(cfn.cfn_id);
                  router.push(routes.workspaces.cfn.details(workspaceId, cfn.cfn_id));
                }}
                onOpenDelete={(payload) => deleteDialog.open(payload)}
                onOpenEdit={(cfn) => router.push(`${routes.workspaces.cfn.details(workspaceId, cfn.cfn_id)}?edit=true`)}
              />
            )}
          </ConditionalSWRRenderer>
        </BasePage>
      </div>

      <ConfirmDialog
        open={deleteDialog.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteError(null);
            deleteDialog.close();
          }
        }}
        onConfirm={handleDelete}
        title={`Delete ${deleteDialog.data?.cfn_name || 'Cognitive Fabric Node'}`}
        description={deleteError ?? `Delete "${deleteDialog.data?.cfn_name}"? This action is permanent and cannot be undone.`}
        confirmText="Delete"
        loading={deleteDialog.isLoading}
        variant="destructive"
      />
    </>
  );
}
