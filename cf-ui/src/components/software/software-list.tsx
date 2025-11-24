'use client';

import {Plus, Package} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardHeader} from '@/components/ui/card';
import {EmptyState} from '@/components/ui/empty-state';
import {useSoftware} from '@/hooks/useApi';

interface SoftwareListProps {
  workspaceId: string;
}

export function SoftwareList({workspaceId}: SoftwareListProps) {
  const {software} = useSoftware(workspaceId);

  return (
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
  );
}
