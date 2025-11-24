'use client';

import {useState} from 'react';
import {Plus, Key, Copy, Trash2, Calendar, AlertCircle, Package} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardHeader} from '@/components/ui/card';
import {EmptyState} from '@/components/ui/empty-state';
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {ConfirmDialog} from '@/components/ui/confirm-dialog';
import {useApiKeys} from '@/hooks/useApi';

interface ApiKeysListProps {
  workspaceId: string;
}

export function ApiKeysList({workspaceId}: ApiKeysListProps) {
  const {apiKeys, generateApiKey, deleteApiKey} = useApiKeys(workspaceId);
  const [isGenerateKeyDialogOpen, setIsGenerateKeyDialogOpen] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteKeyConfirm, setDeleteKeyConfirm] = useState<{open: boolean; keyId: string | null}>({open: false, keyId: null});
  const [deleting, setDeleting] = useState(false);

  const handleGenerateKey = async () => {
    setCreating(true);
    const result = await generateApiKey();
    if (result.success && result.data) {
      setNewApiKey(result.data.key);
    }
    setCreating(false);
  };

  const handleDeleteApiKey = async () => {
    if (!deleteKeyConfirm.keyId) return;

    setDeleting(true);
    await deleteApiKey(deleteKeyConfirm.keyId);
    setDeleteKeyConfirm({open: false, keyId: null});
    setDeleting(false);
  };

  const openDeleteKeyConfirm = (keyId: string) => {
    setDeleteKeyConfirm({open: true, keyId});
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <>
      <Card className="w-full max-w-5xl">
        <CardHeader>
          <div className="flex items-center justify-end">
            <Button onClick={() => setIsGenerateKeyDialogOpen(true)} variant="outline" className="gap-2 border-2">
              <Plus className="w-4 h-4" />
              Generate Key
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Key}
            title="No API keys"
            description="Generate API keys to access this workspace."
            actionLabel="Generate Key"
            onAction={() => setIsGenerateKeyDialogOpen(true)}
          />
        </CardContent>
      </Card>

      <Dialog open={isGenerateKeyDialogOpen} onOpenChange={setIsGenerateKeyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate API Key</DialogTitle>
            <DialogDescription>{newApiKey ? 'Your API key has been generated' : 'Generate a new API key for this workspace'}</DialogDescription>
          </DialogHeader>
          {newApiKey ? (
            <div className="py-4">
              <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center justify-between gap-2">
                  <code className="text-sm font-mono break-all dark:text-white">{newApiKey}</code>
                  <Button size="sm" variant="outline" onClick={() => handleCopy(newApiKey)}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <p className="text-sm text-red-600 dark:text-red-400 mt-4 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                Make sure to copy your API key now. You won&apos;t be able to see it again!
              </p>
            </div>
          ) : (
            <div className="py-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                This will generate a new API key that can be used to access your workspace resources.
              </p>
            </div>
          )}
          <DialogFooter>
            {newApiKey ? (
              <Button
                onClick={() => {
                  setIsGenerateKeyDialogOpen(false);
                  setNewApiKey(null);
                }}
              >
                Done
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setIsGenerateKeyDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleGenerateKey} disabled={creating}>
                  {creating ? 'Generating...' : 'Generate Key'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteKeyConfirm.open}
        onOpenChange={(open) => setDeleteKeyConfirm({open, keyId: null})}
        onConfirm={handleDeleteApiKey}
        title="Delete API Key"
        description="Are you sure you want to delete this API key? Any applications using this key will lose access immediately. This action cannot be undone."
        confirmText="Delete Key"
        variant="destructive"
        loading={deleting}
      />
    </>
  );
}
