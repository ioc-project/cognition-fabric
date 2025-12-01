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
  };
  children?: React.ReactNode;
}

export function ListShell({title, description, actionLabel, onAction, headerRight, empty, children}: ListShellProps) {
  const hasContent = !!children;

  return (
    <Card className="w-full max-w-5xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            {title ? <h2 className="card-title">{title}</h2> : null}
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          </div>
          <div className="flex items-center gap-2">
            {actionLabel && onAction ? (
              <Button variant="outline" className="gap-2 border-2" onClick={onAction}>
                {actionLabel}
              </Button>
            ) : null}
            {headerRight}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {hasContent ? (
          children
        ) : empty ? (
          <EmptyState
            icon={empty.icon}
            title={empty.title}
            description={empty.description}
            actionLabel={empty.actionLabel}
            onAction={empty.onAction}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
