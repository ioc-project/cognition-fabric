'use client';

import {useMemo, useState} from 'react';
import {Boxes, Database, FolderOpen, BarChart3, ChevronDown, ChevronRight, Package, Brain, History} from 'lucide-react';
import Link from 'next/link';
import {usePathname, useSelectedLayoutSegments} from 'next/navigation';
import {useWorkspaceNavigation} from '@/hooks/useWorkspaceNavigation';
import {useCurrentWorkspace} from '@/hooks/useCurrentWorkspace';

export function Sidebar() {
  const pathname = usePathname();
  const segments = useSelectedLayoutSegments();
  const {currentId: wsId, base: wsBase} = useWorkspaceNavigation();

  const {workspace} = useCurrentWorkspace();
  const workspaceName = workspace?.name || (wsId ? `Workspace ${wsId.slice(0, 8)}` : '');

  const [wsOpen, setWsOpen] = useState<boolean>(true);

  const topLevelItems = useMemo(
    () => [
      {
        id: 'workspaces',
        href: '/workspaces',
        icon: FolderOpen,
        label: 'Workspaces',
        isActive: () => segments[0] === 'workspaces' || segments.length === 0
      },
      {
        id: 'software',
        href: '/software',
        icon: Package,
        label: 'Software',
        isActive: () => segments[0] === 'software'
      }
    ],
    [wsId]
  );

  const workspaceChildren = useMemo(
    () => [
      {
        id: 'overview',
        href: `${wsBase}`,
        icon: FolderOpen,
        label: 'Overview',
        isActive: () => segments[0] === 'workspaces' && segments[1] === wsId && (segments.length === 2 || segments[2] === 'overview')
      },
      {
        id: 'mas',
        href: `${wsBase}/mas`,
        icon: Boxes,
        label: 'Multi-Agent Systems',
        isActive: () => segments[0] === 'workspaces' && segments[1] === wsId && segments[2] === 'mas'
      },
      {
        id: 'knowledge',
        href: `${wsBase}/knowledge`,
        icon: Database,
        label: 'Knowledge Adapters',
        isActive: () => segments[0] === 'workspaces' && segments[1] === wsId && segments[2] === 'knowledge'
      },
      {
        id: 'reasoners',
        href: `${wsBase}/reasoners`,
        icon: Brain,
        label: 'Reasoners',
        isActive: () => segments[0] === 'workspaces' && segments[1] === wsId && segments[2] === 'reasoners'
      },
      {
        id: 'history',
        href: `${wsBase}/reasoning-history`,
        icon: History,
        label: 'Reasoning History',
        isActive: () => segments[0] === 'workspaces' && segments[1] === wsId && segments[2] === 'reasoning-history'
      },
      {
        id: 'summary',
        href: `${wsBase}/summary`,
        icon: BarChart3,
        label: 'Summary',
        isActive: () => segments[0] === 'workspaces' && segments[1] === wsId && segments[2] === 'summary'
      }
    ],
    [wsBase]
  );

  const NavItem = ({href, icon: Icon, label, active}: {href: string; icon: any; label: string; active: boolean}) => (
    <Link
      href={href}
      className={`group flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors focus-visible:outline-none ${
        active
          ? 'bg-[hsl(var(--sidebar-active))] text-[hsl(var(--sidebar-text-active))] border-[0.5px] border-[hsl(var(--sidebar-border))] custom-border-org'
          : 'text-[hsl(var(--sidebar-text))] hover:bg-[hsl(var(--sidebar-hover))] hover:text-[hsl(var(--sidebar-text-hover))] hover:border hover:border-[hsl(var(--sidebar-border))] focus-visible:border focus-visible:border-[hsl(var(--sidebar-border))]'
      }`}
    >
      <Icon
        className={`w-5 h-5 transition-colors ${
          active ? 'text-[hsl(var(--sidebar-icon-active))]' : 'text-[hsl(var(--sidebar-icon))] group-hover:text-[hsl(var(--sidebar-icon-active))]'
        }`}
      />
      <span className="sidebar-text">{label}</span>
    </Link>
  );

  return (
    <div className="w-72 bg-[hsl(var(--navbar-background))] border-r border-[hsl(var(--sidebar-border))] flex flex-col">
      <nav className="flex-1 p-4 pt-6">
        <ul className="space-y-1">
          {topLevelItems.map((item) => (
            <li key={item.id}>
              <NavItem href={item.href} icon={item.icon} label={item.label} active={item.isActive()} />
            </li>
          ))}

          {wsId && (
            <li aria-hidden className="my-2">
              <div className="border-t border-[hsl(var(--sidebar-border))]" />
            </li>
          )}

          {wsId && (
            <li className="mt-2">
              <button
                type="button"
                onClick={() => setWsOpen((o) => !o)}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-md text-[hsl(var(--sidebar-text))] hover:bg-[hsl(var(--sidebar-hover))] hover:text-[hsl(var(--sidebar-text-hover))] hover:border hover:border-[hsl(var(--sidebar-border))] focus-visible:border focus-visible:border-[hsl(var(--sidebar-border))]"
              >
                <span className="sidebar-text truncate font-medium mr-2">{workspaceName}</span>
                {wsOpen ? (
                  <ChevronDown className="w-4 h-4 text-[hsl(var(--sidebar-icon))]" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-[hsl(var(--sidebar-icon))]" />
                )}
              </button>

              {wsOpen && (
                <ul className="mt-1 ml-8 space-y-1">
                  {workspaceChildren.map((item) => (
                    <li key={item.id}>
                      <NavItem href={item.href} icon={item.icon} label={item.label} active={item.isActive()} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )}
        </ul>
      </nav>
    </div>
  );
}
