'use client';

import {Plus, Zap, Users, Database, ArrowRight} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Loading} from '@/components/ui/loading';
import {StatCard} from '@/components/ui/stat-card';
import {useRouter} from 'next/navigation';
import {useEffect, useState} from 'react';
import {workspaceApi} from '@/api';
import type {Workspace} from '@/api/types';

export function Home() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchWorkspaces = async () => {
      try {
        const response = await workspaceApi.list();
        setWorkspaces(response.workspaces);
        setError(null);
      } catch (error) {
        console.error('Error fetching workspaces:', error);
        setError('Unable to load workspaces. Showing empty state.');
        setWorkspaces([]);
      } finally {
        setLoading(false);
      }
    };

    fetchWorkspaces();
  }, []);

  const handleCreateWorkspace = () => {
    router.push('/workspaces?create=true');
  };

  const handleNavigateToWorkspaces = () => {
    router.push('/workspaces');
  };

  if (loading) {
    return <Loading />;
  }

  const hasWorkspaces = workspaces.length > 0;

  if (!hasWorkspaces) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="mb-4 dark:text-white">Welcome to CSP UI</h1>
          <p className="text-gray-600 dark:text-gray-400 text-lg">
            Cognitive State Protocol - Manage workspaces, knowledge graphs, and multi-agent systems
          </p>
        </div>

        <Card className="mb-8 border-2 border-blue-100 dark:border-blue-900 bg-gradient-to-br from-blue-50 to-white dark:from-blue-950 dark:to-gray-800">
          <CardContent className="p-8">
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mb-6">
                <Zap className="w-10 h-10 text-blue-600 dark:text-blue-400" />
              </div>
              <h2 className="mb-3 dark:text-white">Get Started with Your First Workspace</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-xl">
                Workspaces help you organize your team, manage API keys, and configure data sources for your knowledge graphs and agent systems.
              </p>
              <Button size="lg" onClick={handleCreateWorkspace} className="gap-2">
                <Plus className="w-5 h-5" />
                Create Your First Workspace
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center mb-3">
                <Users className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
              <CardTitle className="text-lg dark:text-white">Team Collaboration</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Add team members to workspaces and manage permissions for collaborative work.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center mb-3">
                <Database className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <CardTitle className="text-lg dark:text-white">Data Sources</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Connect and configure data sources to power your knowledge graphs and agents.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900 rounded-lg flex items-center justify-center mb-3">
                <Zap className="w-6 h-6 text-orange-600 dark:text-orange-400" />
              </div>
              <CardTitle className="text-lg dark:text-white">API Keys</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 dark:text-gray-400 text-sm">Generate and manage API keys for secure access to your workspace resources.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const recentWorkspaces = workspaces.slice(0, 3);

  return (
    <div>
      <div className="mb-8">
        <h1 className="mb-2 dark:text-white">Welcome back</h1>
        <p className="text-gray-600 dark:text-gray-400">Here&apos;s what&apos;s happening with your workspaces</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-gray-600">Total Workspaces</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl">{workspaces.length}</div>
            <p className="text-sm text-green-600 mt-1">Active</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-gray-600">Active Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl">{workspaces.reduce((acc, w) => acc + (w.users?.length || 0), 0)}</div>
            <p className="text-sm text-gray-600 mt-1">Across all workspaces</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-gray-600">API Keys</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl">{workspaces.reduce((acc, w) => acc + (w.api_keys?.length || 0), 0)}</div>
            <p className="text-sm text-gray-600 mt-1">Total keys</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <Card className="border-2 hover:border-blue-300 transition-colors cursor-pointer" onClick={handleCreateWorkspace}>
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Plus className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="mb-1">Create New Workspace</h3>
                <p className="text-gray-600 text-sm">Set up a new workspace for your team</p>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 hover:border-blue-300 transition-colors cursor-pointer" onClick={handleNavigateToWorkspaces}>
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Database className="w-6 h-6 text-purple-600" />
              </div>
              <div className="flex-1">
                <h3 className="mb-1">Manage Workspaces</h3>
                <p className="text-gray-600 text-sm">View and configure all workspaces</p>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Workspaces</CardTitle>
              <CardDescription>Your recently accessed workspaces</CardDescription>
            </div>
            <Button variant="outline" onClick={handleNavigateToWorkspaces}>
              View All
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentWorkspaces.map((workspace) => (
              <div
                key={workspace.id}
                className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors cursor-pointer"
                onClick={() => router.push(`/workspaces/${workspace.id}`)}
              >
                <div>
                  <h3 className="mb-1">{workspace.name}</h3>
                  <p className="text-sm text-gray-600">Created {new Date(workspace.created_at).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <div className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    <span>{workspace.users?.length || 0}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Database className="w-4 h-4" />
                    <span>{workspace.api_keys?.length || 0}</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
