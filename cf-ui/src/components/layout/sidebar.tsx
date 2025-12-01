'use client';

import {Home, Boxes, Database, FolderOpen, BarChart3} from 'lucide-react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';

export function Sidebar() {
  const pathname = usePathname();

  const match = pathname.match(/\/workspaces\/([^/]+)/);
  const wsId = match?.[1];
  const wsBase = wsId ? `/workspaces/${wsId}` : '/workspaces';

  const menuItems = [
    {
      id: 'overview',
      href: wsId ? `${wsBase}/overview` : '/',
      icon: Home,
      label: 'Overview',
      isActive: (p: string) => (wsId ? p.startsWith(`${wsBase}/overview`) : p === '/')
    },
    {
      id: 'workspace',
      href: wsBase,
      icon: FolderOpen,
      label: 'Workspace',
      isActive: (p: string) => (wsId ? p === wsBase : p === '/workspaces')
    },
    {
      id: 'mas',
      href: wsId ? `${wsBase}/mas` : wsBase,
      icon: Boxes,
      label: 'Multi-Agent Systems (MAS)',
      isActive: (p: string) => (wsId ? p.startsWith(`${wsBase}/mas`) : false)
    },
    {
      id: 'knowledge',
      href: wsId ? `${wsBase}/knowledge` : wsBase,
      icon: Database,
      label: 'Knowledge Adapters',
      isActive: (p: string) => (wsId ? p.startsWith(`${wsBase}/knowledge`) : false)
    },
    {
      id: 'summary',
      href: wsId ? `${wsBase}/summary` : wsBase,
      icon: BarChart3,
      label: 'Summary',
      isActive: (p: string) => (wsId ? p.startsWith(`${wsBase}/summary`) : false)
    }
  ];

  return (
    <div className="w-72 bg-[hsl(var(--navbar-background))] border-r border-[hsl(var(--sidebar-border))] flex flex-col">
      <nav className="flex-1 p-4 pt-6">
        <ul className="space-y-1">
          {(wsId ? menuItems : menuItems.filter((m) => m.id === 'workspace')).map((item) => {
            const Icon = item.icon;
            const isActive = 'isActive' in item && typeof item.isActive === 'function' ? item.isActive(pathname) : pathname === item.href;

            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className={`group flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors focus-visible:outline-none ${
                    isActive
                      ? 'bg-[hsl(var(--sidebar-active))] text-[hsl(var(--sidebar-text-active))] border-[0.5px] border-[hsl(var(--sidebar-border))] custom-border-org'
                      : 'text-[hsl(var(--sidebar-text))] hover:bg-[hsl(var(--sidebar-hover))] hover:text-[hsl(var(--sidebar-text-hover))] hover:border hover:border-[hsl(var(--sidebar-border))] focus-visible:border focus-visible:border-[hsl(var(--sidebar-border))]'
                  }`}
                >
                  <Icon
                    className={`w-5 h-5 transition-colors ${
                      isActive
                        ? 'text-[hsl(var(--sidebar-icon-active))]'
                        : 'text-[hsl(var(--sidebar-icon))] group-hover:text-[hsl(var(--sidebar-icon-active))]'
                    }`}
                  />
                  <span className="sidebar-text">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
