'use client';

import {useParams, useRouter} from 'next/navigation';
import {ArrowLeft, AlertCircle} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs';
import {Loading} from '@/components/ui/loading';
import {Alert, AlertDescription} from '@/components/ui/alert';
import {UsersList} from '@/components/users/users-list';
import {ApiKeysList} from '@/components/api-keys/api-keys-list';
import {SoftwareList} from '@/components/software/software-list';
import {useWorkspace, useUsers, useApiKeys} from '@/hooks/useApi';

export function WorkspaceDetails() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.id as string;

  const {workspace, isLoading: workspaceLoading} = useWorkspace(workspaceId);
  const {isLoading: usersLoading, error: usersError} = useUsers(workspaceId);
  const {isLoading: keysLoading, error: keysError} = useApiKeys(workspaceId);

  const loading = workspaceLoading || usersLoading || keysLoading;
  const error = usersError || keysError;

  if (loading) {
    return <Loading />;
  }

  if (!workspace) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="text-gray-600 dark:text-gray-400 mb-4">Workspace not found</div>
        <Button onClick={() => router.push('/workspaces')}>Back to Workspaces</Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-row justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white" style={{fontFamily: 'Sharp Sans', fontSize: '24px', lineHeight: '32px'}}>
            {workspace.name}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2 border border-[#187ADC] rounded text-[#3C4551] px-4 py-1.5 h-8">
            <span className="font-semibold text-sm"> {workspace.id.slice(0, 8)}...</span>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-gray-600">
              <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="users" className="space-y-0">
        <TabsList className="bg-transparent border-b border-gray-200 dark:border-gray-700 rounded-none h-auto p-0 w-full justify-start mb-6">
          <TabsTrigger
            value="users"
            className="data-[state=active]:border-b-2 data-[state=active]:border-[#0051AF] data-[state=active]:text-[#0051AF] data-[state=inactive]:text-gray-900 dark:data-[state=inactive]:text-gray-300 rounded-none pb-2 px-6 font-medium text-base tracking-[0.15px] bg-transparent"
            style={{fontFamily: 'Inter', fontWeight: 500, fontSize: '16px', lineHeight: '24px', letterSpacing: '0.15px'}}
          >
            Users
          </TabsTrigger>
          <TabsTrigger
            value="software"
            className="data-[state=active]:border-b-2 data-[state=active]:border-[#0051AF] data-[state=active]:text-[#0051AF] data-[state=inactive]:text-gray-900 dark:data-[state=inactive]:text-gray-300 rounded-none pb-2 px-6 font-medium text-base tracking-[0.15px] bg-transparent"
            style={{fontFamily: 'Inter', fontWeight: 500, fontSize: '16px', lineHeight: '24px', letterSpacing: '0.15px'}}
          >
            Software
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-0 flex justify-center">
          <UsersList workspaceId={workspaceId} />
        </TabsContent>

        <TabsContent value="software" className="mt-0 flex justify-center">
          <SoftwareList workspaceId={workspaceId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
