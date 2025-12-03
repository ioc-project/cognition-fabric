'use client';

import {Package} from 'lucide-react';
import {BasePage} from '@/components/ui/base-page';
import {Card} from '@/components/ui/card';
import {ListShell} from '@/components/ui/list-shell';
import {softwareApi} from '@/api/endpoints';
import {useState, useMemo, useEffect} from 'react';
import {useRouter, useSearchParams} from 'next/navigation';
import useSWR from 'swr';

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      {key: 'ALL', title: 'All Templates', link: '/software'},
      {key: 'KnowledgeAdapterTemplates', title: 'Knowledge Adapters', link: '/software?type=KnowledgeAdapterTemplates'},
      {key: 'ReasonerTemplates', title: 'Reasoners', link: '/software?type=ReasonerTemplates'}
    ],
    []
  );

  return (
    <div className="px-8 pt-4">
      <BasePage
        title="Software Templates"
        description="Knowledge Adapter and Reasoner templates."
        tabs={tabs}
        activeTabKey={templateType === 'ALL' ? undefined : templateType}
        onTabChange={(key) => {
          const k = key as 'ALL' | 'KnowledgeAdapterTemplates' | 'ReasonerTemplates';
          setTemplateType(k);
          if (k === 'ALL') {
            router.push('/software');
          } else {
            const qp = new URLSearchParams({type: k}).toString();
            router.push(`/software?${qp}`);
          }
        }}
      >
        {isLoading && <div className="text-sm text-muted-foreground">Loading templates...</div>}
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
                <Card key={tpl.id} variant="list" className="transition-shadow duration-200">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="rounded-lg bg-[hsl(var(--accent))] w-12 h-12 flex items-center justify-center mb-4">
                        <Package className="w-5 h-5 text-card-foreground" />
                      </div>
                      <h4 className="card-title truncate pr-12">
                        {tpl.type === 'KnowledgeAdapterTemplates' ? 'Knowledge Adapter Template' : tpl.type === 'ReasonerTemplates' ? 'Reasoner Template' : tpl.type}
                      </h4>
                      <div className="mt-3 text-sm text-card-foreground space-y-1">
                        <div>ID: {tpl.id}</div>
                        <div>Created: {new Date(tpl.created_at).toISOString().slice(0, 10)}</div>
                        <div>Updated: {new Date(tpl.updated_at).toISOString().slice(0, 10)}</div>
                      </div>
                    </div>
                    <div className="flex items-start">
                      <a
                        className="text-sm font-medium text-[hsl(var(--sidebar-text-active))] hover:underline"
                        href={`/software/${tpl.id}?type=${encodeURIComponent(tpl.type)}`}
                      >
                        View Details
                      </a>
                    </div>
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
