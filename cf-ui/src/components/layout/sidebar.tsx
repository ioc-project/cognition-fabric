'use client';

import React, {useEffect, useMemo} from 'react';
import {Boxes, Brain, Network, Database, type LucideIcon} from 'lucide-react';
import Link from 'next/link';
import {usePathname, useSelectedLayoutSegments, useRouter} from 'next/navigation';
import {routes} from '@/constants/routes';

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const segments = useSelectedLayoutSegments();

  useEffect(() => {
    const hrefs: string[] = [routes.cfn.list, routes.memoryProviders.list, routes.mas.list, routes.cognitiveAgents.list];
    hrefs.forEach((h) => {
      try {
        router.prefetch(h);
      } catch {
        void 0;
      }
    });
  }, [router]);

  const navItems = useMemo(
    () => [
      {
        id: 'cfn',
        href: routes.cfn.list,
        icon: Network,
        label: 'Cognition Fabric Nodes',
        isActive: () => segments[0] === 'cfn'
      },
      {
        id: 'memory-providers',
        href: routes.memoryProviders.list,
        icon: Database,
        label: 'Memory Providers',
        isActive: () => segments[0] === 'memory-providers'
      },
      {
        id: 'mas',
        href: routes.mas.list,
        icon: Boxes,
        label: 'Multi-Agentic Systems',
        isActive: () => segments[0] === 'mas'
      },
      {
        id: 'cognitive-agents',
        href: routes.cognitiveAgents.list,
        icon: Brain,
        label: 'Cognition Engines',
        isActive: () => segments[0] === 'cognitive-agents'
      }
    ],
    [segments, pathname]
  );

  const NavItem = React.memo(function NavItem({href, icon: Icon, label, active}: {href: string; icon: LucideIcon; label: string; active: boolean}) {
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
      </Link>
    );
  });

  return (
    <div className="w-72 bg-[hsl(var(--navbar-background))] border-r border-[hsl(var(--sidebar-border))] flex flex-col">
      <nav className="flex-1 p-4 pt-6">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.id}>
              <NavItem href={item.href} icon={item.icon} label={item.label} active={item.isActive()} />
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
