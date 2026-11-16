// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import React, {useEffect, useMemo} from 'react';
import {BrainCircuit, Network, Workflow, type LucideIcon} from 'lucide-react';
import Link from 'next/link';
import {usePathname, useSelectedLayoutSegments, useRouter} from 'next/navigation';
import {routes} from '@/constants/routes';

const NavItem = React.memo(function NavItem({href, icon: Icon, label, active}: {href: string; icon: LucideIcon; label: string; active: boolean}) {
  return (
    <Link
      href={href}
      className={`group flex items-center pl-3 h-9 gap-3 rounded-lg transition-colors focus-visible:outline-none ${
        active
          ? 'bg-[hsl(var(--sidebar-active))] text-[hsl(var(--sidebar-text-active))]'
          : 'text-[hsl(var(--sidebar-text))] hover:bg-[hsl(var(--sidebar-hover))] hover:text-[hsl(var(--sidebar-text-hover))]'
      }`}
    >
      <Icon
        strokeWidth={1.33}
        className={`w-4 h-4 transition-colors flex-shrink-0 ${
          active ? 'text-[hsl(var(--sidebar-icon-active))]' : 'text-[hsl(var(--sidebar-icon))] group-hover:text-[hsl(var(--sidebar-icon-active))]'
        }`}
      />
      <span className="sidebar-text">{label}</span>
    </Link>
  );
});

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const segments = useSelectedLayoutSegments();

  useEffect(() => {
    const hrefs: string[] = [routes.cfn.list, routes.mas.list, routes.cognitiveAgents.list];
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
        label: 'Cognition Fabric',
        isActive: () => segments[0] === 'fabric'
      },
      {
        id: 'mas',
        href: routes.mas.list,
        icon: Workflow,
        label: 'Multi-Agentic Systems',
        isActive: () => segments[0] === 'mas'
      },
      {
        id: 'cognitive-agents',
        href: routes.cognitiveAgents.list,
        icon: BrainCircuit,
        label: 'Cognition Engines',
        isActive: () => segments[0] === 'cognitive-agents'
      }
    ],
    [segments, pathname]
  );

  return (
    <div className="w-72 bg-[hsl(var(--navbar-background))] border-r border-[hsl(var(--sidebar-border))] flex flex-col">
      <nav className="flex-1 p-4 pt-6">
        <ul className="space-y-2">
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
