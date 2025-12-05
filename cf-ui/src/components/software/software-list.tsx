'use client';

import {Package} from 'lucide-react';
import {BasePage} from '@/components/ui/base-page';
import {Card} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import {ListShell} from '@/components/ui/list-shell';
import {LoaderRelative} from '@/components/ui/loading';
import {softwareApi} from '@/api/endpoints';
import {useState, useMemo, useEffect} from 'react';
import {useRouter, useSearchParams} from 'next/navigation';
import useSWR from 'swr';
import {routes} from '@/constants/routes';

export function SoftwareList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [templateType, setTemplateType] = useState<'ALL' | 'KnowledgeAdapterTemplates' | 'ReasonerTemplates'>('ALL');

  useEffect(() => {
    const type = searchParams.get('type');
    if (type === 'KnowledgeAdapterTemplates' || type === 'ReasonerTemplates') {
      setTemplateType(type);
    } else {
      setTemplateType('ALL');
    }
  }, [searchParams]);

  const {
    data: templates = [],
    isLoading,
    error
  } = useSWR(['software-templates', templateType], async () => {
    if (templateType === 'ALL') {
      return softwareApi.listAll();
    }
    return softwareApi.listByType(templateType);
  });

  const tabs = useMemo(
    () => [
      {key: 'ALL', title: 'All Templates', link: routes.software.list},
      {key: 'KnowledgeAdapterTemplates', title: 'Knowledge Adapters', link: routes.software.listByType('KnowledgeAdapterTemplates')},
      {key: 'ReasonerTemplates', title: 'Reasoners', link: routes.software.listByType('ReasonerTemplates')}
    ],
    []
  );

  return (
    <div className="px-8 pt-4">
      <BasePage
        title="Software Templates"
        tabs={tabs}
        activeTabKey={templateType === 'ALL' ? undefined : templateType}
        onTabChange={(key) => {
          const k = key as 'ALL' | 'KnowledgeAdapterTemplates' | 'ReasonerTemplates';
          setTemplateType(k);
          if (k === 'ALL') {
            router.push(routes.software.list);
          } else {
            router.push(routes.software.listByType(k));
          }
        }}
      >
        {isLoading && <LoaderRelative className="py-8" />}
        {error && !isLoading && <div className="text-sm text-red-600 dark:text-red-400">Failed to load templates: {String(error)}</div>}
        {!isLoading && !error && templates.length === 0 && (
          <div className="w-full max-w-5xl mx-auto flex items-center justify-center min-h-[calc(100vh-16rem)]">
            <ListShell
              empty={{
                icon: Package,
                title: 'No software templates',
                description:
                  templateType === 'KnowledgeAdapterTemplates'
                    ? 'There are no knowledge adapter templates available.'
                    : templateType === 'ReasonerTemplates'
                      ? 'There are no Reasoner templates available.'
                      : 'There are no software templates available.'
              }}
            />
          </div>
        )}
        {templates.length > 0 && (
          <div className="w-full">
            <div className="list-grid">
              {templates.map((tpl) => (
                <Card key={tpl.id} variant="list" className="transition-shadow duration-200 flex flex-col">
                  {/* Header with Type */}
                  <div className="pb-4 mb-5 border-b border-border/50">
                    <div className="text-sm font-medium text-foreground">
                      {tpl.type === 'KnowledgeAdapterTemplates' ? 'Knowledge Adapter' : tpl.type === 'ReasonerTemplates' ? 'Reasoner' : tpl.type}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Template</div>
                  </div>

                  <div className="mb-6">
                    <div className="text-xs font-medium text-muted-foreground mb-2">Template ID</div>
                    <div className="text-xs text-foreground font-mono break-all leading-relaxed">{tpl.id}</div>
                  </div>

                  <div className="space-y-3 mb-8">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground">Created</span>
                      <span className="text-sm text-foreground">
                        {new Date(tpl.created_at).toLocaleString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false
                        })}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground">Last Updated</span>
                      <span className="text-sm text-foreground">
                        {new Date(tpl.updated_at).toLocaleString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="mt-auto">
                    <Button
                      variant="sidebar"
                      className="w-full"
                      onClick={() => router.push(routes.software.details(tpl.id, tpl.type))}
                    >
                      View Details
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </BasePage>
    </div>
  );
}
