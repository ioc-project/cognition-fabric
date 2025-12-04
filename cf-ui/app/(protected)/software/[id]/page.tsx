'use client';
import React from 'react';
import {SoftwareTemplateDetails} from '@/components/software/software-template-details';

export default function SoftwareTemplateDetailsPage({params, searchParams}: {params: Promise<{id: string}>; searchParams: Promise<{type?: string}>}) {
  const unwrappedParams = (React as any).use ? (React as any).use(params) : params;
  const unwrappedSearch = (React as any).use ? (React as any).use(searchParams) : searchParams;
  const id: string = unwrappedParams.id;
  const type =
    unwrappedSearch.type === 'KnowledgeAdapterTemplates' || unwrappedSearch.type === 'ReasonerTemplates' ? unwrappedSearch.type : undefined;

  return <SoftwareTemplateDetails id={id} type={type} />;
}
