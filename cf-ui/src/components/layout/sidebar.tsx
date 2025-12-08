'use client';

import {useEffect, useMemo, useState} from 'react';
import {
  Boxes,
  Database,
  FolderOpen,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Package,
  Brain,
  History,
  Key,
  Settings,
  type LucideIcon
} from 'lucide-react';
import Link from 'next/link';
import {usePathname, useSelectedLayoutSegments} from 'next/navigation';
import {useWorkspaceNavigation} from '@/hooks/useWorkspaceNavigation';
import {useCurrentWorkspace} from '@/hooks/useCurrentWorkspace';
import {routes, isRouteActive} from '@/constants/routes';

export function Sidebar() {
  const pathname = usePathname();
  const segments = useSelectedLayoutSegments();
  const isWorkspaceRoute = segments[0] === 'workspaces';

  const {currentId: workspaceIdRaw, base: workspaceBasePathRaw} = useWorkspaceNavigation();
  const {workspace: workspaceRaw} = useCurrentWorkspace();
  const workspaceId = isWorkspaceRoute ? workspaceIdRaw : undefined;
  const workspaceBasePath = isWorkspaceRoute ? workspaceBasePathRaw : '';
  const workspace = isWorkspaceRoute ? workspaceRaw : undefined;
  const workspaceName = workspace?.name || (workspaceId ? `Workspace ${workspaceId.slice(0, 8)}` : '');

  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState<boolean>(false);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(true);

  useEffect(() => {
    setIsWorkspaceOpen(isWorkspaceRoute);
  }, [isWorkspaceRoute]);

  const topLevelItems = useMemo(
    () => [
      {
        id: 'workspaces',
        href: routes.workspaces.list,
        icon: FolderOpen,
        label: 'Workspaces',
        isActive: () => segments[0] === 'workspaces' || segments.length === 0
      },
      {
        id: 'software',
        href: routes.software.list,
        icon: Package,
        label: 'Software Templates',
        isActive: () => segments[0] === 'software'
      }
    ],
    [segments]
  );

  const workspaceChildren = useMemo(
    () => [
      {
        id: 'overview',
        href: `${workspaceBasePath}`,
        icon: FolderOpen,
        label: 'Overview',
        isActive: () => segments[0] === 'workspaces' && segments[1] === workspaceId && (segments.length === 2 || segments[2] === 'overview')
      },
      {
        id: 'mas',
        href: `${workspaceBasePath}/mas`,
        icon: Boxes,
        label: 'Multi-Agent Systems',
        isActive: () => segments[0] === 'workspaces' && segments[1] === workspaceId && segments[2] === 'mas'
      },
      {
        id: 'knowledge',
        href: `${workspaceBasePath}/knowledge`,
        icon: Database,
        label: 'Knowledge Adapters',
        isActive: () => segments[0] === 'workspaces' && segments[1] === workspaceId && segments[2] === 'knowledge'
      },
      {
        id: 'reasoners',
        href: `${workspaceBasePath}/reasoners`,
        icon: Brain,
        label: 'Reasoners',
        isActive: () => segments[0] === 'workspaces' && segments[1] === workspaceId && segments[2] === 'reasoners'
      },
      {
        id: 'history',
        href: `${workspaceBasePath}/reasoning-history`,
        icon: History,
        label: 'Reasoning History',
        isActive: () => segments[0] === 'workspaces' && segments[1] === workspaceId && segments[2] === 'reasoning-history'
      },
      {
        id: 'summary',
        href: `${workspaceBasePath}/summary`,
        icon: BarChart3,
        label: 'Summary',
        isActive: () => segments[0] === 'workspaces' && segments[1] === workspaceId && segments[2] === 'summary'
      }
    ],
    [workspaceBasePath, workspaceId, segments]
  );

  const NavItem = ({href, icon: Icon, label, active}: {href: string; icon: LucideIcon; label: string; active: boolean}) => (
    <Link
      href={href}
      className={`group flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors focus-visible:outline-none ${
        active
          ? 'bg-[hsl(var(--sidebar-active))] text-[hsl(var(--sidebar-text-active))]'
          : 'text-[hsl(var(--sidebar-text))] hover:bg-[hsl(var(--sidebar-hover))] hover:text-[hsl(var(--sidebar-text-hover))]'
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

          <li className="mt-1">
            <button
              type="button"
              onClick={() => setSettingsOpen((o) => !o)}
              className="group w-full flex items-center justify-between px-2 py-1.5 rounded-md transition-colors focus-visible:outline-none text-[hsl(var(--sidebar-text))] hover:bg-[hsl(var(--sidebar-hover))] hover:text-[hsl(var(--sidebar-text-hover))]"
            >
              <span className="sidebar-text flex items-center gap-2">
                <Settings className="w-5 h-5 transition-colors text-[hsl(var(--sidebar-icon))] group-hover:text-[hsl(var(--sidebar-icon-active))]" />
                Settings
              </span>
              {settingsOpen ? (
                <ChevronDown className="w-4 h-4 text-[hsl(var(--sidebar-icon))]" />
              ) : (
                <ChevronRight className="w-4 h-4 text-[hsl(var(--sidebar-icon))]" />
              )}
            </button>

            {settingsOpen && (
              <ul className="mt-1 ml-8 space-y-1">
                <li>
                  <NavItem href={routes.settings.apiKeys} icon={Key} label={'API Keys'} active={isRouteActive(pathname, routes.settings.apiKeys)} />
                </li>
              </ul>
            )}
          </li>

          {workspaceId && (
            <li aria-hidden className="my-2">
              <div className="border-t border-[hsl(var(--sidebar-border))]" />
            </li>
          )}

          {workspaceId && (
            <li className="mt-2">
              <button
                type="button"
                onClick={() => setIsWorkspaceOpen((open) => !open)}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-md text-[hsl(var(--sidebar-text))] hover:bg-[hsl(var(--sidebar-hover))] hover:text-[hsl(var(--sidebar-text-hover))]"
              >
                <span className="sidebar-text truncate font-medium mr-2">{workspaceName}</span>
                {isWorkspaceOpen ? (
                  <ChevronDown className="w-4 h-4 text-[hsl(var(--sidebar-icon))]" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-[hsl(var(--sidebar-icon))]" />
                )}
              </button>

              {isWorkspaceOpen && (
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
