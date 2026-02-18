'use client';

import {Button} from '@/components/ui/button';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {ResourceTable} from '@/components/ui/resource-table';
import {DATE_TIME_FORMAT_OPTIONS} from '@/lib/utils';
import {MoreVertical, Unplug, Edit, Trash2} from 'lucide-react';
import type {Cfn} from '@/api/types/cfn';

export interface CfnTableListProps {
  cfns: Cfn[];
  workspaceId: string;
  selectedId: string | null;
  onRowClick: (cfn: Cfn) => void;
  onOpenDelete: (payload: {cfn_id: string; cfn_name: string; enabled: boolean}) => void;
  onOpenEdit: (cfn: Cfn) => void;
  onEnable: (payload: {cfn_id: string; cfn_name: string}) => void;
  onDisable: (payload: {cfn_id: string; cfn_name: string}) => void;
}

export function CfnTableList({
  cfns,
  workspaceId: _workspaceId,
  selectedId,
  onRowClick,
  onOpenDelete,
  onOpenEdit,
  onEnable,
  onDisable
}: CfnTableListProps) {
  return (
    <ResourceTable
      items={cfns}
      headers={[
        {content: 'Name'},
        {content: 'Status'},
        {content: 'Enabled'},
        {content: 'Last Seen'},
        {content: 'Created'},
        {content: 'Actions', className: 'text-right'}
      ]}
      rowKey={(cfn) => cfn.cfn_id}
      isSelected={(cfn) => selectedId === cfn.cfn_id}
      onRowClick={(cfn) => onRowClick(cfn)}
      renderRow={(cfn) => [
        {content: cfn.cfn_name, className: 'font-medium'},
        {
          content: (
            <span
              className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                cfn.status === 'online'
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                  : cfn.status === 'offline'
                    ? 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
                    : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
              }`}
            >
              {cfn.status}
            </span>
          )
        },
        {
          content: <span className="text-xs text-foreground">{cfn.enabled ? 'Yes' : 'No'}</span>
        },
        {
          content: cfn.last_seen ? new Date(cfn.last_seen).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS) : '-',
          className: 'text-muted-foreground'
        },
        {content: cfn.created_at ? new Date(cfn.created_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS) : 'Unknown'},
        {
          content: (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenEdit(cfn);
                  }}
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                {cfn.enabled ? (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onDisable({cfn_id: cfn.cfn_id, cfn_name: cfn.cfn_name});
                    }}
                  >
                    <Unplug className="w-4 h-4 mr-2" />
                    Disable
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onEnable({cfn_id: cfn.cfn_id, cfn_name: cfn.cfn_name});
                    }}
                  >
                    <Unplug className="w-4 h-4 mr-2" />
                    Enable
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="text-red-600 dark:text-red-400"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDelete({cfn_id: cfn.cfn_id, cfn_name: cfn.cfn_name, enabled: cfn.enabled});
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ),
          className: 'text-right'
        }
      ]}
    />
  );
}
