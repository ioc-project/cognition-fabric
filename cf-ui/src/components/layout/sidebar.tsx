'use client';

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Boxes, FolderOpen, BarChart3, ChevronDown, ChevronRight, Brain, History, Key, Users, type LucideIcon} from 'lucide-react';
import Link from 'next/link';
import {usePathname, useSelectedLayoutSegments, useRouter} from 'next/navigation';
import {Badge} from '@/components/ui/badge';
import {useWorkspaceNavigation} from '@/hooks/useWorkspaceNavigation';
import {useCurrentWorkspace} from '@/hooks/useCurrentWorkspace';
import {routes} from '@/constants/routes';

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const segments = useSelectedLayoutSegments();
  const isWorkspaceRoute = segments[0] === 'workspaces';

  const {currentId: workspaceIdRaw, base: workspaceBasePathRaw} = useWorkspaceNavigation();
  const {workspace: workspaceRaw} = useCurrentWorkspace();
  const workspaceId = isWorkspaceRoute ? workspaceIdRaw : undefined;
  const workspaceBasePath = isWorkspaceRoute ? workspaceBasePathRaw : '';
  const workspace = isWorkspaceRoute ? workspaceRaw : undefined;
  const workspaceName: string = String(workspace?.name ?? (workspaceId ? `Workspace ${workspaceId.slice(0, 8)}` : 'Workspace'));

  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);

  useEffect(() => {
    setIsWorkspaceOpen(isWorkspaceRoute);
  }, [isWorkspaceRoute]);

  useEffect(() => {
    const hrefs: string[] = [];
    hrefs.push(routes.workspaces.list);
    if (workspaceBasePath) {
      hrefs.push(
        `${workspaceBasePath}`,
        `${workspaceBasePath}/mas`,
        `${workspaceBasePath}/cognitive-agents`,
        `${workspaceBasePath}/reasoning-history`,
        `${workspaceBasePath}/summary`
      );
    }
    hrefs.forEach((h) => {
      try {
        router.prefetch(h);
      } catch {
        void 0;
      }
    });
  }, [router, workspaceBasePath]);

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
        id: 'api-keys',
        href: routes.apiKeys,
        icon: Key,
        label: 'API Keys',
        isActive: () => pathname === routes.apiKeys
      }
      // Software Templates hidden - may be reused later
      // {
      //   id: 'software',
      //   href: routes.software.list,
      //   icon: Package,
      //   label: 'Software Templates',
      //   isActive: () => segments[0] === 'software'
      // }
    ],
    [segments, pathname]
  );

  const isWorkspaceSection = useCallback(
    (section?: string) => {
      if (segments[0] !== 'workspaces' || segments[1] !== workspaceId) {
        return false;
      }
      if (!section) {
        return segments.length === 2 || segments[2] === 'overview';
      }
      return segments[2] === section;
    },
    [segments, workspaceId]
  );

  const workspaceChildren = useMemo(
    () => [
      {
        id: 'overview',
        href: `${workspaceBasePath}`,
        icon: FolderOpen,
        label: 'Overview',
        isActive: () => isWorkspaceSection()
      },
      {
        id: 'mas',
        href: `${workspaceBasePath}/mas`,
        icon: Boxes,
        label: 'Multi-Agentic Systems',
        isActive: () => isWorkspaceSection('mas')
      },
      {
        id: 'cognitive-agents',
        href: `${workspaceBasePath}/cognitive-agents`,
        icon: Brain,
        label: 'Cognitive Agents',
        isActive: () => isWorkspaceSection('cognitive-agents')
      },
      {
        id: 'history',
        href: `${workspaceBasePath}/reasoning-history`,
        icon: History,
        label: 'Reasoning History',
        isActive: () => isWorkspaceSection('reasoning-history')
      },
      {
        id: 'summary',
        href: `${workspaceBasePath}/summary`,
        icon: BarChart3,
        label: 'Summary',
        isActive: () => isWorkspaceSection('summary')
      },
      {
        id: 'members',
        href: `${workspaceBasePath}/members`,
        icon: Users,
        label: 'Members',
        isActive: () => isWorkspaceSection('members')
      }
    ],
    [workspaceBasePath, isWorkspaceSection]
  );

  const NavItem = React.memo(function NavItem({
    href,
    icon: Icon,
    label,
    active,
    badge
  }: {
    href: string;
    icon: LucideIcon;
    label: string;
    active: boolean;
    badge?: number;
  }) {
    return (
      <Link
        href={href}
        className={`group flex items-center justify-between gap-2 px-2 py-1.5 rounded-md transition-colors focus-visible:outline-none ${
          active
            ? 'bg-[hsl(var(--sidebar-active))] text-[hsl(var(--sidebar-text-active))]'
            : 'text-[hsl(var(--sidebar-text))] hover:bg-[hsl(var(--sidebar-hover))] hover:text-[hsl(var(--sidebar-text-hover))]'
        }`}
      >
        <div className="flex items-center gap-2">
          <Icon
            className={`w-5 h-5 transition-colors ${
              active ? 'text-[hsl(var(--sidebar-icon-active))]' : 'text-[hsl(var(--sidebar-icon))] group-hover:text-[hsl(var(--sidebar-icon-active))]'
            }`}
          />
          <span className="sidebar-text">{label}</span>
        </div>
        {badge !== undefined && badge > 0 && (
          <Badge
            variant="destructive"
            className="h-5 min-w-5 flex items-center justify-center px-1 tbadge={'badge' in item ? item.badge : undefined} ext-xs"
          >
            {badge}
          </Badge>
        )}
      </Link>
    );
  });

  return (
    <div className="w-72 bg-[hsl(var(--navbar-background))] border-r border-[hsl(var(--sidebar-border))] flex flex-col">
      <nav className="flex-1 p-4 pt-6">
        <ul className="space-y-1">
          {topLevelItems.map((item) => (
            <li key={item.id}>
              <NavItem href={item.href} icon={item.icon} label={item.label} active={item.isActive()} />
            </li>
          ))}

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
