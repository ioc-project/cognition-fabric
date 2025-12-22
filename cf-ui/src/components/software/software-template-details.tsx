'use client';

import React, {useEffect, useState} from 'react';
import {softwareApi} from '@/api/endpoints';
import {TemplateView} from '@/components/software/template-view';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {EmptyState} from '@/components/ui/empty-state';
import {FileCode} from 'lucide-react';
import {BasePage} from '@/components/ui/base-page';
import {breadcrumbs} from '@/constants/routes';
import type {SoftwareTemplate} from '@/api/types/software';
import type {Template} from '@/types/template-config';

function isErrorLike(error: unknown): error is Error {
  return error instanceof Error || (typeof error === 'object' && error !== null && 'message' in error);
}

export function SoftwareTemplateDetails({id, type}: {id: string; type?: 'KnowledgeAdapterTemplates' | 'ReasonerTemplates'}) {
  const [template, setTemplate] = useState<SoftwareTemplate | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        setLoading(true);
        setError(undefined);
        const list = type ? await softwareApi.listByType(type) : await softwareApi.listAll();
        const found = list.find((t) => t.id === id);
        if (isMounted) {
          setTemplate(found);
        }
      } catch (e: unknown) {
        if (isMounted) {
          setError(isErrorLike(e) ? e.message : 'Failed to load template');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      isMounted = false;
    };
  }, [id, type]);

  const pageTitle =
    type === 'KnowledgeAdapterTemplates'
      ? 'Knowledge Template Details'
      : type === 'ReasonerTemplates'
        ? 'Reasoner Template Details'
        : 'Template Details';

  const breadcrumbId: string = template?.id || id;

  return (
    <BasePage title={pageTitle} useBreadcrumbs breadcrumbs={breadcrumbs.softwareDetails(breadcrumbId)}>
      <ConditionalSWRRenderer
        data={template}
        error={error}
        customIsLoading={loading}
        itemName="Template details"
        errorListStateProps={{title: 'Failed to load template'}}
        customEmptyComponent={
          <EmptyState
            icon={FileCode}
            title="Template not found"
            description="The requested template could not be found. Navigate from the list and try again."
          />
        }
      >
        <TemplateView template={template as unknown as Template} />
      </ConditionalSWRRenderer>
    </BasePage>
  );
}
