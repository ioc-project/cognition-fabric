'use client';

import {useParams, useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {BasePage} from '@/components/ui/base-page';
import {routes, breadcrumbs} from '@/constants/routes';
import {useCurrentWorkspace} from '@/hooks/useCurrentWorkspace';

export default function CreateMas() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.id as string;
  const {workspace} = useCurrentWorkspace();
  const name: string = workspace?.name ?? 'Workspace';

  return (
    <div className="p-8 max-w-3xl mx-auto w-full">
      <BasePage title="Create Multi‑Agent System" useBreadcrumbs breadcrumbs={breadcrumbs.createMAS(workspaceId, name)}>
        <div className="p-4 border rounded-lg bg-card">
          <p className="text-sm text-muted-foreground mb-4">
            This is a placeholder page for creating a MAS in workspace <code className="font-mono">{workspaceId}</code>.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push(routes.workspaces.details(workspaceId))}>
              Back to Overview
            </Button>
            <Button disabled title="Form implementation pending">
              Create (disabled)
            </Button>
          </div>
        </div>
      </BasePage>
    </div>
  );
}
