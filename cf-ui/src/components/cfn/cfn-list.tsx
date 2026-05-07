'use client';

import {Network, Plus} from 'lucide-react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {ListShell} from '@/components/ui/list-shell';
import {BasePage} from '@/components/ui/base-page';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {useState} from 'react';
import {CfnTableList} from './cfn-table-list';
import {CfnCardList} from './cfn-card-list';
import {useCfn} from '@/hooks/useCfn';
import {routes} from '@/constants/routes';

export function CfnList() {
  const router = useRouter();
  const {cfns = [], isLoading: loading, error: swrError} = useCfn();
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <>
      <div className="space-y-8">
        <BasePage
          title="Cognition Fabric Nodes"
          description="View and manage Cognition Fabric Nodes"
          callToAction={
            cfns.length > 0 ? (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setViewMode(viewMode === 'table' ? 'card' : 'table')}>
                  {viewMode === 'table' ? 'Card View' : 'Table View'}
                </Button>
                <Button asChild variant="sidebar" className="gap-2">
                  <Link href={routes.cfn.create}>
                    <Plus className="w-4 h-4" />
                    Register Cognition Fabric Node
                  </Link>
                </Button>
              </div>
            ) : undefined
          }
        >
          <ConditionalSWRRenderer
            data={cfns}
            error={swrError}
            itemName="Cognition Fabric Nodes"
            customIsLoading={loading}
            customEmptyComponent={
              <div className="flex items-center justify-center min-h-[50vh]">
                <ListShell
                  empty={{
                    icon: Network,
                    title: 'No Cognition Fabric Nodes exist.',
                    description: 'Register a Cognition Fabric Node to start managing your distributed memory plane.',
                    actionLabel: 'Register Node',
                    href: routes.cfn.create
                  }}
                />
              </div>
            }
          >
            {viewMode === 'table' ? (
              <CfnTableList
                cfns={cfns}
                selectedId={selectedId}
                onRowClick={(cfn) => {
                  setSelectedId(cfn.id);
                  router.push(routes.cfn.details(cfn.id));
                }}
                onOpenEdit={(cfn) => router.push(`${routes.cfn.details(cfn.id)}?edit=true`)}
              />
            ) : (
              <CfnCardList
                cfns={cfns}
                selectedId={selectedId}
                onCardClick={(cfn) => {
                  setSelectedId(cfn.id);
                  router.push(routes.cfn.details(cfn.id));
                }}
                onOpenEdit={(cfn) => router.push(`${routes.cfn.details(cfn.id)}?edit=true`)}
              />
            )}
          </ConditionalSWRRenderer>
        </BasePage>
      </div>
    </>
  );
}
