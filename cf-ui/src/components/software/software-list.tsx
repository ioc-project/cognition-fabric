'use client';

import {Plus, Package} from 'lucide-react';
import {ListShell} from '@/components/ui/list-shell';
import {useSoftware} from '@/hooks/useApi';

interface SoftwareListProps {
  workspaceId: string;
}

export function SoftwareList({workspaceId}: SoftwareListProps) {
  const {software} = useSoftware(workspaceId);

  return (
    <ListShell
      title="Software"
      description="Manage software integrations for this workspace"
      actionLabel="Add Software"
      onAction={() => {}}
      empty={{
        icon: Package,
        title: 'No software configured',
        description: 'Add software integrations to this workspace.',
        actionLabel: 'Add Software',
        onAction: () => {}
      }}
    ></ListShell>
  );
}
