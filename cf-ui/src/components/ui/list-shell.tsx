import {Card, CardContent, CardHeader} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import {EmptyState} from '@/components/ui/empty-state';
import type {LucideIcon} from 'lucide-react';

interface ListShellProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  headerRight?: React.ReactNode;
  empty?: {
    icon?: LucideIcon;
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
    href?: string;
  };
  children?: React.ReactNode;
}

export function ListShell({title, description, actionLabel, onAction, headerRight, empty, children}: ListShellProps) {
  const hasContent = !!children;
  const showHeaderAction = hasContent && !!actionLabel && !!onAction;
  const hasHeader = !!title || !!description || showHeaderAction || !!headerRight;

  return (
    <Card className="w-full max-w-5xl mx-auto mb-0">
      {hasHeader ? (
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              {title ? <h2 className="text-sm text-gray-600 dark:text-white leading-none">{title}</h2> : null}
              {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
            </div>
            <div className="flex items-center gap-2">
              {showHeaderAction ? (
                <Button variant="outline" className="gap-2 border-2" onClick={onAction}>
                  {actionLabel}
                </Button>
              ) : null}
              {headerRight}
            </div>
          </div>
        </CardHeader>
      ) : null}
      <CardContent className={!hasContent && empty ? 'flex items-center justify-center min-h-[60vh]' : undefined}>
        {hasContent ? (
          children
        ) : empty ? (
          <EmptyState
            icon={empty.icon}
            title={empty.title}
            description={empty.description}
            actionLabel={empty.actionLabel}
            onAction={empty.onAction}
            href={empty.href}
            variant="inset"
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
