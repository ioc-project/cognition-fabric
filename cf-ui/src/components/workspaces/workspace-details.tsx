'use client';

import {useParams, useRouter} from 'next/navigation';
import {useEffect, useState} from 'react';
import {ArrowLeft, Users as UsersIcon, Key, Calendar, Plus, Mail, Trash2, Copy, AlertCircle, Package} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs';
import {EmptyState} from '@/components/ui/empty-state';
import {Loading} from '@/components/ui/loading';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {AddUserDialog} from './add-user-dialog';
import {workspaceApi, userApi, apiKeyApi} from '@/api';
import type {Workspace, User, ApiKey} from '@/api/types';

export function WorkspaceDetails() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.id as string;

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);

  const [isAddUserDialogOpen, setIsAddUserDialogOpen] = useState(false);
  const [isGenerateKeyDialogOpen, setIsGenerateKeyDialogOpen] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchWorkspaceData();
  }, [workspaceId]);

  const fetchWorkspaceData = async () => {
    try {
      const [workspaceData, usersData, keysData] = await Promise.all([
        workspaceApi.get(workspaceId),
        userApi.list(workspaceId).catch(() => []),
        apiKeyApi.list(workspaceId).catch(() => ({api_keys: [], total: 0}))
      ]);

      setWorkspace(workspaceData);
      setUsers(Array.isArray(usersData) ? usersData : []);
      setApiKeys(keysData.api_keys || []);
    } catch (error) {
      console.error('Error fetching workspace data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (data: {name: string; email: string}) => {
    await userApi.create(workspaceId, {name: data.name, email: data.email});
    await fetchWorkspaceData();
  };

  const handleGenerateKey = async () => {
    setCreating(true);
    try {
      const response = await apiKeyApi.create(workspaceId);
      setNewApiKey(response.key);
      await fetchWorkspaceData();
    } catch (error) {
      console.error('Error generating API key:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      await userApi.delete(workspaceId, userId);
      await fetchWorkspaceData();
    } catch (error) {
      console.error('Error deleting user:', error);
    }
  };

  const handleDeleteApiKey = async (keyId: string) => {
    try {
      await apiKeyApi.delete(workspaceId, keyId);
      await fetchWorkspaceData();
    } catch (error) {
      console.error('Error deleting API key:', error);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

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
          <Card className="w-full max-w-5xl">
            <CardHeader>
              <div className="flex items-center justify-end">
                <Button onClick={() => setIsAddUserDialogOpen(true)} variant="outline" className="gap-2 border-2">
                  <Plus className="w-4 h-4" />
                  Add User
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex items-center justify-center min-h-[500px]">
              {users.length === 0 ? (
                <div className="flex items-center justify-center w-full">
                  <EmptyState
                    icon={UsersIcon}
                    title="No users yet"
                    description="Add users to this workspace."
                    actionLabel="Add User"
                    onAction={() => setIsAddUserDialogOpen(true)}
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Added</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                              <span className="text-sm text-blue-600 dark:text-blue-400">{user.name.charAt(0)}</span>
                            </div>
                            <span className="dark:text-white">{user.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                            <Mail className="w-4 h-4" />
                            {user.email}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                            <Calendar className="w-4 h-4" />
                            {new Date(user.created_at).toLocaleDateString()}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" className="text-red-600 dark:text-red-400" onClick={() => handleDeleteUser(user.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="software" className="mt-0 flex justify-center">
          <Card className="w-full max-w-5xl">
            <CardHeader>
              <div className="flex items-center justify-end">
                <Button variant="outline" className="gap-2 border-2">
                  <Plus className="w-4 h-4" />
                  Add Software
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <EmptyState
                icon={Package}
                title="No software configured"
                description="Add software integrations to this workspace."
                actionLabel="Add Software"
                onAction={() => {}}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AddUserDialog open={isAddUserDialogOpen} onOpenChange={setIsAddUserDialogOpen} onSuccess={handleAddUser} />

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
    </div>
  );
}
