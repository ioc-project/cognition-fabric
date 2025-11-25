import {ReactNode} from 'react';
import {Button} from './button';
import {LucideIcon} from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({icon: Icon, title, description, actionLabel, onAction}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center p-6 pb-12 gap-4 bg-[#F5F8FD] dark:bg-muted shadow-[0px_4px_4px_rgba(200,213,245,0.33)] rounded-lg">
      <div className="flex flex-col justify-center items-center pb-2 gap-3 max-w-4xl">
        <div className="relative w-56 h-56 flex items-center justify-center">
          <div className="absolute left-2 top-20 w-7 h-30 bg-purple-100 dark:bg-purple-900/40 opacity-40 rounded-[30px] rotate-[25deg]" />
          <div className="absolute left-8 top-2 w-7 h-22 bg-purple-100 dark:bg-purple-900/40 opacity-20 rounded-[30px] rotate-[25deg]" />
          <div className="absolute right-7 bottom-14 w-7 h-12 bg-purple-100 dark:bg-purple-900/40 opacity-30 rounded-[30px] rotate-[25deg]" />

          <div className="relative w-42 h-42 flex items-center justify-center">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500 via-purple-400 to-cyan-400 rounded-full opacity-90" />
            {Icon && (
              <div className="relative z-10 flex items-center justify-center">
                <Icon className="w-24 h-24 text-white" strokeWidth={1.5} />
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col items-center gap-4 w-full">
          <div className="flex flex-col items-start gap-2 w-full">
            <h6 className="empty-state-title w-full text-gray-800 dark:text-gray-200">{title}</h6>
            <p className="w-full text-base font-normal leading-6 text-center tracking-[0.5px] text-gray-800 dark:text-gray-300">{description}</p>
          </div>

          {actionLabel && onAction && (
            <Button onClick={onAction} className="empty-state-button px-4 py-1.5 h-8 bg-[#187ADC] hover:bg-[#1565C0] text-white rounded">
              {actionLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
