'use client';

import {useParams, useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {BasePage} from '@/components/ui/base-page';

export default function CreateMas() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.id as string;

  return (
    <div className="p-8 max-w-3xl mx-auto w-full">
      <BasePage title="Create Multi‑Agent System" description="Stub page for navigation testing. Form wiring will be added later.">
        <div className="p-4 border rounded-lg bg-card">
          <p className="text-sm text-muted-foreground mb-4">
            This is a placeholder page for creating a MAS in workspace <code className="font-mono">{workspaceId}</code>.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push(`/workspaces/${workspaceId}`)}>
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
