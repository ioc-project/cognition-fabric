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
import {useCfn} from '@/hooks/useCfn';
import {parseError} from '@/lib/utils';
import {toast} from 'sonner';
import {routes} from '@/constants/routes';

export function CfnList() {
  const router = useRouter();
  const {cfns = [], isLoading: loading, error: swrError, deleteCfn, enableCfn, disableCfn} = useCfn();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [disableError, setDisableError] = useState<string | null>(null);
  const deleteDialog = useConfirmDialog<{cfn_id: string; cfn_name: string; enabled: boolean}>();
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDisabling, setIsDisabling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [hasDisabled, setHasDisabled] = useState(false);

  const handleEnable = async (payload: {cfn_id: string; cfn_name: string}) => {
    try {
      await enableCfn(payload.cfn_id);
      toast.success(`Cognitive Fabric Node "${payload.cfn_name}" enabled successfully`);
    } catch (err) {
      const errorMessage = parseError(err);
      toast.error(errorMessage);
    }
  };

  const handleDisable = async (payload: {cfn_id: string; cfn_name: string}) => {
    try {
      await disableCfn(payload.cfn_id);
      toast.success(`Cognitive Fabric Node "${payload.cfn_name}" disabled successfully`);
    } catch (err) {
      const errorMessage = parseError(err);
      toast.error(errorMessage);
    }
  };

  const handleDisableInModal = async () => {
    if (!deleteDialog.data) {
      return;
    }

    setIsDisabling(true);
    setDisableError(null);
    try {
      await disableCfn(deleteDialog.data.cfn_id);
      setHasDisabled(true);
      toast.success(`Cognitive Fabric Node "${deleteDialog.data.cfn_name}" disabled successfully`);
    } catch (err) {
      const errorMessage = parseError(err);
      setDisableError(errorMessage);
    } finally {
      setIsDisabling(false);
    }
  };

  const handleDeleteInModal = async () => {
    if (!deleteDialog.data) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteCfn(deleteDialog.data.cfn_id);
      toast.success(`Cognitive Fabric Node "${deleteDialog.data.cfn_name}" deleted successfully`);
      deleteDialog.close();
      setHasDisabled(false);
      setDisableError(null);
    } catch (err) {
      const errorMessage = parseError(err);
      setDeleteError(errorMessage);
    } finally {
      setIsDeleting(false);
    }
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
                <Link href={routes.cfn.create}>
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
                    title: 'No Cognitive Fabric Nodes exist.',
                    description: 'Create a Cognitive Fabric Node to start managing your distributed memory plane.',
                    actionLabel: 'Create Cognitive Fabric Node',
                    href: routes.cfn.create
                  }}
                />
              </div>
            }
          >
            {viewMode === 'table' ? (
              <CfnTableList
                cfns={cfns}
                selectedId={selectedId}
                onRowClick={(cfn) => {
                  setSelectedId(cfn.cfn_id);
                  router.push(routes.cfn.details(cfn.cfn_id));
                }}
                onOpenDelete={(payload) => {
                  setHasDisabled(false);
                  setDisableError(null);
                  setDeleteError(null);
                  deleteDialog.open(payload);
                }}
                onOpenEdit={(cfn) => router.push(`${routes.cfn.details(cfn.cfn_id)}?edit=true`)}
                onEnable={handleEnable}
                onDisable={handleDisable}
              />
            ) : (
              <CfnCardList
                cfns={cfns}
                selectedId={selectedId}
                onCardClick={(cfn) => {
                  setSelectedId(cfn.cfn_id);
                  router.push(routes.cfn.details(cfn.cfn_id));
                }}
                onOpenDelete={(payload) => {
                  setHasDisabled(false);
                  setDisableError(null);
                  setDeleteError(null);
                  deleteDialog.open(payload);
                }}
                onOpenEdit={(cfn) => router.push(`${routes.cfn.details(cfn.cfn_id)}?edit=true`)}
                onEnable={handleEnable}
                onDisable={handleDisable}
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
            setDisableError(null);
            setHasDisabled(false);
            deleteDialog.close();
          }
        }}
        onConfirm={deleteDialog.data?.enabled && !hasDisabled ? handleDisableInModal : handleDeleteInModal}
        title={
          deleteDialog.data?.enabled && !hasDisabled
            ? `Disable ${deleteDialog.data?.cfn_name || 'Cognitive Fabric Node'}`
            : `Delete ${deleteDialog.data?.cfn_name || 'Cognitive Fabric Node'}`
        }
        description={
          deleteError ||
          disableError ||
          (deleteDialog.data?.enabled && !hasDisabled
            ? `To proceed with deletion, "${deleteDialog.data?.cfn_name}" must first be disabled. This will disconnect the node and stop all heartbeats. You can re-enable it later to restore connectivity.`
            : hasDisabled
              ? `"${deleteDialog.data?.cfn_name}" has been disabled successfully. Click "Delete" below to permanently remove this node from the workspace. Warning: This action is irreversible and the node cannot be recovered after deletion.`
              : `Are you sure you want to permanently delete "${deleteDialog.data?.cfn_name}"? This action is irreversible and cannot be undone.`)
        }
        confirmText={deleteDialog.data?.enabled && !hasDisabled ? 'Disable' : 'Delete'}
        loading={deleteDialog.data?.enabled && !hasDisabled ? isDisabling : isDeleting}
        variant="destructive"
        closeOnConfirmSuccess={false}
      />
    </>
  );
}
