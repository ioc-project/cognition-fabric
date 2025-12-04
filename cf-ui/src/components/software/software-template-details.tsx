'use client';

import React, {useEffect, useState} from 'react';
import {softwareApi} from '@/api/endpoints';
import {TemplateView} from '@/components/software/template-view';
import {Loading} from '@/components/ui/loading';
import {EmptyState} from '@/components/ui/empty-state';
import {Alert, AlertDescription} from '@/components/ui/alert';
import {AlertCircle, FileCode} from 'lucide-react';
import {BasePage} from '@/components/ui/base-page';

export function SoftwareTemplateDetails({id, type}: {id: string; type?: 'KnowledgeAdapterTemplates' | 'ReasonerTemplates'}) {
  const [template, setTemplate] = useState<any | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(true);
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
          setError((e as Error)?.message || 'Failed to load template');
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

  if (loading) {
    return <Loading />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!template) {
    return (
      <EmptyState
        icon={FileCode}
        title="Template not found"
        description="The requested template could not be found. Navigate from the list and try again."
      />
    );
  }

  const pageTitle =
    type === 'KnowledgeAdapterTemplates'
      ? 'Knowledge Template Details'
      : type === 'ReasonerTemplates'
        ? 'Reasoner Template Details'
        : 'Template Details';

  return (
    <BasePage title={pageTitle}>
      <TemplateView template={template} />
    </BasePage>
  );
}
