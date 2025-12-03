import {notFound} from 'next/navigation';
import {softwareApi} from '@/api/endpoints';

export default async function SoftwareTemplateDetailsPage({params, searchParams}: {params: {id: string}; searchParams: {type?: string}}) {
  const id = params.id;
  const type = searchParams.type === 'KnowledgeAdapterTemplates' || searchParams.type === 'ReasonerTemplates' ? searchParams.type : undefined;

  let template: any | undefined;
  try {
    const list = type ? await softwareApi.listByType(type) : await softwareApi.listAll();
    template = list.find((t: any) => t.id === id);
  } catch (e) {
    template = undefined;
  }

  if (!template) {
    notFound();
  }

  return (
    <div className="px-8 pt-4">
      <div className="w-full max-w-5xl mx-auto">
        <h1 className="page-title mb-1">Template Details</h1>
        <p className="page-description mb-6">Read-only view of the selected template.</p>
        <div className="list-card">
          <pre className="text-xs overflow-auto max-h-[70vh] bg-muted/50 rounded p-4">{JSON.stringify(template, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}
