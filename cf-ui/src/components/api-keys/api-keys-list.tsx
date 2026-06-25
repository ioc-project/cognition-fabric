// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {useState} from 'react';
import {KeyRound, Plus, MoreVertical, Trash2, AlertCircle} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import {ListShell} from '@/components/ui/list-shell';
import {LoaderRelative} from '@/components/ui/loading';
import {BasePage} from '@/components/ui/base-page';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {Alert, AlertDescription} from '@/components/ui/alert';
import {ConfirmDialog} from '@/components/ui/confirm-dialog';
import {CreateApiKeyDialog} from './create-api-key-dialog';
import {ShowApiKeyDialog} from './show-api-key-dialog';
import {useApiKeys} from '@/hooks/useApiKeys';
import {useConfirmDialog} from '@/hooks/useConfirmDialog';
import {parseError, DATE_TIME_FORMAT_OPTIONS} from '@/lib/utils';
import {breadcrumbs} from '@/constants/routes';
import type {ApiKey} from '@/api/types';

export function ApiKeysList() {
  const {apiKeys, isLoading, error: swrError, deleteApiKey, mutate} = useApiKeys();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [showKeyDialog, setShowKeyDialog] = useState<{open: boolean; apiKey: string; keyId: string}>({
    open: false,
    apiKey: '',
    keyId: ''
  });
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteDialog = useConfirmDialog<{id: string; preview: string}>();

  const handleApiKeyCreated = (result: {id: string; apiKey: string}) => {
    setIsCreateDialogOpen(false);
    setShowKeyDialog({
      open: true,
      apiKey: result.apiKey,
      keyId: result.id
    });
    void mutate();
  };

  const handleDeleteApiKey = async () => {
    await deleteDialog.confirm(async (data) => {
      try {
        await deleteApiKey(data.id);
        setDeleteError(null);
      } catch (err) {
        const msg = parseError(err);
        setDeleteError(msg);
        throw err;
      }
    });
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="py-12">
          <LoaderRelative />
        </div>
      );
    }

    if (apiKeys.length === 0) {
      return (
        <div className="flex items-center justify-center min-h-[50vh]">
          <ListShell
            empty={{
              icon: KeyRound,
              title: 'No API keys',
              description: 'Create an API key to authenticate requests across your ',
              actionLabel: 'Create Your First API Key',
              onAction: () => setIsCreateDialogOpen(true)
            }}
          />
        </div>
      );
    }

    return (
      <>
        {(deleteError || swrError) && (
          <Alert variant="destructive" dismissible onDismiss={() => setDeleteError(null)}>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{deleteError || swrError}</AlertDescription>
          </Alert>
        )}

        <div className="list-grid">
          {apiKeys.map((apiKey: ApiKey) => (
            <Card key={apiKey.id} variant="list" className="transition-shadow duration-200">
              <div className="flex items-start justify-between mb-6">
                <div className="flex-1">
                  <div className="rounded-lg bg-[hsl(var(--accent))] w-12 h-12 flex items-center justify-center mb-4">
                    <KeyRound className="w-5 h-5 text-card-foreground" />
                  </div>
                  <h4 className="card-title truncate mb-2">{apiKey.name}</h4>
                  <div className="text-xs font-medium text-muted-foreground mb-1">Key Preview</div>
                  <div className="font-mono text-xs text-muted-foreground break-all">{apiKey.key_preview}</div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => {
                        deleteDialog.open({id: apiKey.id, preview: apiKey.name || apiKey.key_name});
                      }}
                      className="text-destructive"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="space-y-3">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">Created</span>
                  <span className="text-sm text-foreground">{new Date(apiKey.created_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS)}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </>
    );
  };

  return (
    <>
      <div className="space-y-8 px-8 pt-4 relative z-0">
        <BasePage
          title="API Keys"
          description="Manage API keys for authenticating requests"
          useBreadcrumbs={true}
          breadcrumbs={breadcrumbs.apiKeysList()}
          callToAction={
            apiKeys.length > 0 ? (
              <Button onClick={() => setIsCreateDialogOpen(true)} variant="sidebar" className="gap-2" size="default">
                <Plus className="w-4 h-4" />
                Create API Key
              </Button>
            ) : undefined
          }
        >
          {renderContent()}
        </BasePage>
      </div>

      {isCreateDialogOpen && <CreateApiKeyDialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen} onSuccess={handleApiKeyCreated} />}

      {showKeyDialog.open && (
        <ShowApiKeyDialog
          open={showKeyDialog.open}
          onOpenChange={(open) => setShowKeyDialog({...showKeyDialog, open})}
          apiKey={showKeyDialog.apiKey}
          keyId={showKeyDialog.keyId}
        />
      )}

      <ConfirmDialog
        open={deleteDialog.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteError(null);
            deleteDialog.close();
          }
        }}
        onConfirm={handleDeleteApiKey}
        title="Delete API Key"
        description={`Delete API key "${deleteDialog.data?.preview}"? This action is permanent and cannot be undone.`}
        confirmText="Delete API Key"
        variant="destructive"
        loading={deleteDialog.isLoading}
      />
    </>
  );
}
