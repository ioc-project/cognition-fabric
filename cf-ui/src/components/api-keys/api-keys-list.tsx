'use client';

import {useState} from 'react';
import {Plus, KeyRound, AlertCircle} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {ListShell} from '@/components/ui/list-shell';
import {Loading} from '@/components/ui/loading';
import {Alert, AlertDescription} from '@/components/ui/alert';
import {CreateApiKeyDialog} from './create-api-key-dialog';
import {useApiKeys} from '@/hooks/useApi';
import {parseError} from '@/lib/utils';

export function ApiKeysList() {
  const {isLoading, error} = useApiKeys();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  if (isLoading) {
    return <Loading />;
  }

  return (
    <>
      <div className="fixed inset-0 left-64 top-16 flex items-center justify-center px-8">
        <ListShell
          empty={{
            icon: KeyRound,
            title: 'No API keys',
            description: 'Create an API key to authenticate requests across MAS, KEPs, and Reasoners.',
            actionLabel: 'Create Your First API Key',
            onAction: () => setIsCreateDialogOpen(true)
          }}
        />
      </div>

      <CreateApiKeyDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSuccess={() => {
          // No list to refresh yet; close dialog after success
          setIsCreateDialogOpen(false);
        }}
      />
    </>
  );
}
