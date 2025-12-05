import React from 'react';
import {SoftwareTemplateDetails} from '@/components/software/software-template-details';

export default async function SoftwareTemplateDetailsPage({
  params,
  searchParams
}: {
  params: Promise<{id: string}>;
  searchParams: Promise<{type?: string}>;
}) {
  const unwrappedParams = await params;
  const unwrappedSearch = await searchParams;
  const id: string = unwrappedParams.id;
  const type =
    unwrappedSearch.type === 'KnowledgeAdapterTemplates' || unwrappedSearch.type === 'ReasonerTemplates' ? unwrappedSearch.type : undefined;

  return <SoftwareTemplateDetails id={id} type={type} />;
}
