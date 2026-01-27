'use client';

import {useState} from 'react';
import {KeyRound} from 'lucide-react';
import {ListShell} from '@/components/ui/list-shell';
import {LoaderRelative} from '@/components/ui/loading';
import {CreateApiKeyDialog} from './create-api-key-dialog';
import {useApiKeys} from '@/hooks/useApi';

export function ApiKeysList() {
  const {isLoading} = useApiKeys();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="p-6">
          <LoaderRelative />
        </div>
      );
    }

    return (
      <ListShell
        empty={{
          icon: KeyRound,
          title: 'No API keys',
          description: 'Create an API key to authenticate requests across Cognitive Agents.',
          actionLabel: 'Create Your First API Key',
          onAction: () => setIsCreateDialogOpen(true)
        }}
      />
    );
  };

  return (
    <>
      <div className="fixed inset-0 left-64 top-16 flex items-center justify-center px-8">{renderContent()}</div>

      {isCreateDialogOpen && (
        <CreateApiKeyDialog
          open={isCreateDialogOpen}
          onOpenChange={setIsCreateDialogOpen}
          onSuccess={() => {
            // No list to refresh yet; close dialog after success
            setIsCreateDialogOpen(false);
          }}
        />
      )}
    </>
  );
}
