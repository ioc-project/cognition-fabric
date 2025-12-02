'use client';

import {Package} from 'lucide-react';
import {useSoftwareTemplates} from '@/hooks/useApi';
import {BasePage} from '@/components/ui/base-page';

export default function SoftwareList() {
  const {templates, isLoading, error} = useSoftwareTemplates();

  return (
    <div className="p-8 max-w-5xl mx-auto w-full">
      <BasePage
        title="Software Templates"
        description="Global adapter templates available for instantiation into a workspace."
        titleClassName="page-title-text"
        descriptionClassName="page-title-description"
      >
        {isLoading && <div className="text-sm text-muted-foreground">Loading templates...</div>}
        {error && !isLoading && <div className="text-sm text-red-600 dark:text-red-400">Failed to load templates: {String(error)}</div>}
        {!isLoading && !error && templates.length === 0 && (
          <div className="flex flex-col items-center justify-center border rounded-lg p-12 text-center bg-card/50">
            <Package className="w-12 h-12 text-muted-foreground mb-4" />
            <h2 className="text-lg font-medium mb-2">No templates found</h2>
            <p className="text-sm text-muted-foreground">The control plane did not return any adapter templates.</p>
          </div>
        )}
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((tpl, idx) => {
            const key = Object.keys(tpl)[0];
            const value = tpl[key as keyof typeof tpl];
            return (
              <li key={String(key) + idx} className="border rounded-lg p-4 bg-card flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-muted-foreground" />
                  <span className="font-medium">{key}</span>
                </div>
                <pre className="text-xs overflow-auto max-h-40 bg-muted/50 rounded p-2">{JSON.stringify(value, null, 2)}</pre>
                <div className="flex justify-end">
                  <button
                    disabled
                    className="text-xs px-3 py-1.5 rounded border bg-muted text-muted-foreground cursor-not-allowed"
                    title="Instantiation action will be added once flow is wired"
                  >
                    Instantiate (pending)
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </BasePage>
    </div>
  );
}
