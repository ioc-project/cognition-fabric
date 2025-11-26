'use client';

import {Home, Boxes, Database, Package} from 'lucide-react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';

export function Sidebar() {
  const pathname = usePathname();

  const menuItems = [
    {id: 'home', href: '/', icon: Home, label: 'Home'},
    {id: 'workspaces', href: '/workspaces', icon: Boxes, label: 'Workspaces'},
    {id: 'data-sources', href: '/data-sources', icon: Database, label: 'Data Sources'},
    {id: 'software', href: '/software', icon: Package, label: 'Software'}
  ];

  return (
    <div className="w-72 bg-card border-r border-[hsl(var(--sidebar-border))] flex flex-col">
      <nav className="flex-1 p-4 pt-6">
        <ul className="space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-[hsl(var(--sidebar-active))] text-foreground'
                      : 'text-muted-foreground hover:bg-[hsl(var(--sidebar-hover))] hover:text-foreground'
                  }`}
                >
                  <Icon className="w-5 h-5" />
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
