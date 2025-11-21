'use client';

import {Home, Boxes, Database, Bot} from 'lucide-react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';

export function Sidebar() {
  const pathname = usePathname();

  const menuItems = [
    {id: 'home', href: '/', icon: Home},
    {id: 'workspaces', href: '/workspaces', icon: Boxes},
    {id: 'data-sources', href: '/data-sources', icon: Database},
    {id: 'mas', href: '/mas', icon: Bot}
  ];

  return (
    <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-semibold">C</span>
          </div>
          <span className="text-gray-900 dark:text-white font-semibold"></span>
        </div>
      </div>

      <nav className="flex-1 p-4">
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
                      ? 'bg-blue-50 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span></span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
