import {Button} from './button';
import {LucideIcon} from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  variant?: 'standalone' | 'inset';
}

export function EmptyState({icon: Icon, title, description, actionLabel, onAction, variant = 'standalone'}: EmptyStateProps) {
  const containerClassName =
    variant === 'inset'
      ? 'flex flex-col items-center p-10 py-12 gap-6 rounded-lg min-h-[300px]'
      : 'flex flex-col items-center p-10 py-12 gap-6 bg-card soft-card shadow-[0px_4px_4px_rgba(0,0,0,0.1)] dark:shadow-[0px_4px_4px_rgba(0,0,0,0.35)] rounded-lg min-h-[340px] mx-auto max-w-2xl';

  const content = (
    <div className={containerClassName}>
      <div className="flex flex-col justify-center items-center pb-2 gap-4 max-w-4xl">
        {Icon ? (
          <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center">
            <Icon className="w-10 h-10 text-accent-foreground" strokeWidth={1.5} />
          </div>
        ) : null}

        <div className="flex flex-col items-center gap-4 w-full">
          <div className="flex flex-col items-start gap-2 w-full">
            <h3 className="text-base font-medium text-card-foreground leading-none w-full text-center">{title}</h3>
            <p className="w-full max-w-md text-sm text-muted-foreground text-center">{description}</p>
          </div>

          {actionLabel && onAction && (
            <Button onClick={onAction} variant="sidebar" size="xs" className="empty-state-button">
              {actionLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  if (variant === 'standalone') {
    return <div className="flex items-center justify-center min-h-[60vh]">{content}</div>;
  }

  return content;
}
