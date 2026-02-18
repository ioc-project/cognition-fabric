'use client';

import {ChevronDown, FolderOpen} from 'lucide-react';
import {useMemo, useState} from 'react';
import type {Workspace} from '@/api/types';
import {useWorkspaces} from '@/hooks/useWorkspaces';
import {Button} from '@/components/ui/button';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {useWorkspaceNavigation} from '@/hooks/useWorkspaceNavigation';

export function WorkspaceSwitcher() {
  const {workspaces} = useWorkspaces();
  const {currentId, goToWorkspace} = useWorkspaceNavigation();

  const normalizedCurrentId: string | undefined = Array.isArray(currentId) ? currentId[0] : currentId;
  const current = workspaces.find((w: Workspace) => w.id === normalizedCurrentId);

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return workspaces;
    }
    return workspaces.filter((w: Workspace) => w.name.toLowerCase().includes(q));
  }, [query, workspaces]);

  const handleSelect = (id: string) => {
    setOpen(false);
    goToWorkspace(id);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2 h-8 px-4">
          <span className="font-semibold text-sm truncate max-w-[200px]">{current ? current.name : 'Select workspace'}</span>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-0 text-popover-foreground border" onCloseAutoFocus={(e) => e.preventDefault()}>
        <div className="px-3 pt-3 pb-2">
          <div className="text-xs font-medium text-muted-foreground mb-2">Workspaces</div>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                e.preventDefault();
                const first = filtered[0];
                if (first) {
                  handleSelect(first.id);
                }
              }
            }}
            placeholder="Search workspaces..."
            className="w-full h-8 px-3 text-sm rounded-md bg-popover text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="max-h-72 overflow-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">No matching workspaces</div>
          ) : (
            filtered.map((w: Workspace) => (
              <DropdownMenuItem
                key={w.id}
                onClick={() => handleSelect(w.id)}
                className={`${normalizedCurrentId === w.id ? 'bg-[hsl(var(--sidebar-active))]' : ''} px-3`}
              >
                <span className="truncate">{w.name}</span>
              </DropdownMenuItem>
            ))
          )}
        </div>

        <div className="border-t border-border my-1" />

        <DropdownMenuItem onClick={() => normalizedCurrentId && goToWorkspace(normalizedCurrentId)} className="gap-2 px-3">
          <FolderOpen className="w-4 h-4 text-muted-foreground" />
          <span>View current workspace</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default WorkspaceSwitcher;
