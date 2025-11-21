'use client';

import Link from 'next/link';
import CiscoLogo from '@/assets/images/cisco-logo.svg';
import {useThemeStore} from '@/store';

export const NavBar = () => {
  const {theme, setTheme} = useThemeStore((store) => ({
    theme: store.theme,
    setTheme: store.setTheme
  }));

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  return (
    <header className="fixed top-0 left-0 right-0 h-14 bg-gray-900 text-white z-50 flex items-center px-4">
      <Link href="/" className="flex items-center gap-2">
        <CiscoLogo className="w-11 h-11 fill-white" />
        <div className="border-l border-gray-600 h-5 mx-2" />
        <span className="text-lg font-medium">Project Name</span>
      </Link>

      <div className="ml-auto flex items-center gap-4">
        <button onClick={toggleTheme} className="px-3 py-1 rounded hover:bg-gray-800" aria-label="Toggle theme">
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
      </div>
    </header>
  );
};
