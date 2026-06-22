import * as React from 'react';
import {cn} from '@/lib/utils';
import {
  Table as BaseTable,
  TableBody as BaseBody,
  TableFooter as BaseFooter,
  TableHead as BaseHead,
  TableRow as BaseRow,
  TableCell as BaseCell,
  TableCaption as BaseCaption,
  TableHeader as BaseHeader
} from '@/components/ui/table';

export {
  BaseTable as Table,
  BaseBody as TableBody,
  BaseFooter as TableFooter,
  BaseHead as TableHead,
  BaseRow as TableRow,
  BaseCell as TableCell,
  BaseCaption as TableCaption
};

export const ResourceTableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({className, ...props}, ref) => (
    <BaseHeader
      ref={ref}
      className={cn('sticky top-0 z-10', className)}
      {...props}
    />
  )
);
ResourceTableHeader.displayName = 'ResourceTableHeader';

export interface ResourceTableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  selected?: boolean;
}

export const ResourceTableRow = React.forwardRef<HTMLTableRowElement, ResourceTableRowProps>(({className, selected, ...props}, ref) => {
  const base = selected ? 'bg-[hsl(var(--sidebar-active))] text-[hsl(var(--sidebar-text-active))]' : 'hover:bg-[hsl(var(--sidebar-hover))]';
  return <BaseRow ref={ref} className={cn('cursor-pointer', base, className)} {...props} />;
});
ResourceTableRow.displayName = 'ResourceTableRow';

export type ResourceHeaderCell = {
  content: React.ReactNode;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLTableCellElement>;
  title?: string;
};

export type ResourceBodyCell = {
  content: React.ReactNode;
  className?: string;
  colSpan?: number;
};

export interface ResourceTableProps<T> {
  items: T[];
  headers: ResourceHeaderCell[];
  rowKey: (item: T, index: number) => React.Key;
  renderRow: (item: T, index: number) => ResourceBodyCell[];
  isSelected?: (item: T) => boolean;
  onRowClick?: (item: T) => void;
  showHeader?: boolean;
  emptyMessage?: string;
}

export function ResourceTable<T>({
  items,
  headers,
  rowKey,
  renderRow,
  isSelected,
  onRowClick,
  showHeader = true,
  emptyMessage = 'No results.'
}: ResourceTableProps<T>) {
  return (
    <BaseTable>
      {showHeader && (
        <ResourceTableHeader>
          <BaseRow>
            {headers.map((h, i) => (
              <BaseHead key={i} className={h.className} onClick={h.onClick} title={h.title}>
                {h.content}
              </BaseHead>
            ))}
          </BaseRow>
        </ResourceTableHeader>
      )}
      <BaseBody>
        {items.length ? (
          items.map((item, idx) => (
            <ResourceTableRow
              key={rowKey(item, idx)}
              selected={isSelected ? isSelected(item) : false}
              onClick={onRowClick ? () => onRowClick(item) : undefined}
            >
              {renderRow(item, idx).map((c, ci) => (
                <BaseCell key={ci} className={c.className} colSpan={c.colSpan}>
                  {c.content}
                </BaseCell>
              ))}
            </ResourceTableRow>
          ))
        ) : (
          <BaseRow>
            <BaseCell colSpan={headers.length} className="h-24 text-center">
              {emptyMessage}
            </BaseCell>
          </BaseRow>
        )}
      </BaseBody>
    </BaseTable>
  );
}
