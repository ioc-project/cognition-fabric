'use client';
import React, {use} from 'react';
import {SoftwareTemplateDetails} from '@/components/software/software-template-details';

export default function SoftwareTemplateDetailsPage({params, searchParams}: {params: Promise<{id: string}>; searchParams: Promise<{type?: string}>}) {
  const unwrappedParams = use(params);
  const unwrappedSearch = use(searchParams);
  const id: string = unwrappedParams.id;
  const type =
    unwrappedSearch.type === 'KnowledgeAdapterTemplates' || unwrappedSearch.type === 'ReasonerTemplates' ? unwrappedSearch.type : undefined;

  return <SoftwareTemplateDetails id={id} type={type} />;
}
