'use client';

import {MoreVertical, User, Settings, LogOut, HelpCircle, Sun, Moon} from 'lucide-react';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {useThemeStore} from '@/store';
import {signOut} from 'next-auth/react';
import Image from 'next/image';
import {useCallback} from 'react';
import WorkspaceSwitcher from '@/components/workspaces/workspace-switcher';

export function NavBar() {
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  const handleLogout = async () => {
    await signOut({callbackUrl: '/login'});
  };

  return (
    <div className="h-[52px] bg-[hsl(var(--navbar-background))] border-b border-[hsl(var(--navbar-border))] flex items-center justify-between px-4 gap-2 relative z-[100]">
      <div className="flex items-center gap-3 px-2 sm:px-4">
        <div className="relative h-[45px] w-32 sm:w-40 ml-2 sm:ml-4">
          <Image
            src={theme === 'dark' ? '/outshift-logo.png' : '/outshift-logo-light.png'}
            alt="Outshift"
            fill
            sizes="(min-width: 640px) 160px, 128px"
            className="object-contain"
            priority
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <WorkspaceSwitcher />

        <button
          onClick={toggleTheme}
          className="p-2 hover:bg-accent rounded-lg transition-colors"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun className="w-5 h-5 text-muted-foreground" /> : <Moon className="w-5 h-5 text-muted-foreground" />}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-2 hover:bg-accent rounded-lg transition-colors">
              <MoreVertical className="w-5 h-5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem>
              <User className="w-4 h-4 mr-2" />
              <span></span>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings className="w-4 h-4 mr-2" />
              <span></span>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <HelpCircle className="w-4 h-4 mr-2" />
              <span>Help</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="text-red-600" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              <span>Logout</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
