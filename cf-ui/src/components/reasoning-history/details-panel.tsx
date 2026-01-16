'use client';

import {Info, Network, Database, TrendingUp} from 'lucide-react';
import type {ReasoningHistoryContent, Concept, Relation} from '@/api/types/reasoning-history';

interface DetailsPanelProps {
  data: ReasoningHistoryContent;
}

export function DetailsPanel({data}: DetailsPanelProps) {
  if (!data) {
    return <div className="flex items-center justify-center h-full text-muted-foreground">No data available</div>;
  }

  const evidence = data.evidence;
  const concepts: Concept[] = evidence?.details?.concepts || [];
  const relations: Relation[] = evidence?.details?.relations || [];
  const domains = new Set(concepts.map((item) => item.attributes?.domain).filter(Boolean));

  return (
    <div className="h-full flex flex-col">
      <div className="sticky top-0 z-10 bg-background border-b border-border pb-3">
        <div className="w-full px-8 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-semibold">Overview</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Network className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="text-xs text-blue-900 dark:text-blue-100">Concepts</span>
              </div>
              <div className="text-2xl font-medium text-blue-900 dark:text-blue-100">{concepts.length}</div>
            </div>

            <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span className="text-xs text-purple-900 dark:text-purple-100">Relations</span>
              </div>
              <div className="text-2xl font-medium text-purple-900 dark:text-purple-100">{relations.length}</div>
            </div>

            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Database className="w-4 h-4 text-green-600 dark:text-green-400" />
                <span className="text-xs text-green-900 dark:text-green-100">Domains</span>
              </div>
              <div className="text-2xl font-medium text-green-900 dark:text-green-100">{domains.size}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="w-full p-8 pt-4">
          {evidence?.entity && (
            <div className="mb-8 p-6 bg-muted/30 rounded-lg border border-border">
              <h3 className="text-lg font-medium mb-3">Query Entity</h3>
              <div className="text-2xl text-foreground">{evidence.entity.name}</div>
            </div>
          )}

          {evidence?.summary && (
            <div className="mb-8 p-6 bg-muted/30 rounded-lg border border-border">
              <h3 className="text-lg font-medium mb-3">Evidence Summary</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Supporting Paths</div>
                  <div className="text-2xl font-medium text-foreground">{evidence.summary.supporting_paths}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Unique Concepts</div>
                  <div className="text-2xl font-medium text-foreground">{evidence.summary.unique_concepts}</div>
                </div>
              </div>
            </div>
          )}

          {/* Metadata */}
          {evidence?.metadata && (
            <div className="mb-8 p-6 bg-muted/30 rounded-lg border border-border">
              <h3 className="text-lg font-medium mb-3">Retrieval Metadata</h3>
              <div className="flex flex-wrap gap-3">
                {evidence.metadata.retrieval_mode && (
                  <div className="px-3 py-2 bg-background rounded-md border border-border">
                    <div className="text-xs text-muted-foreground mb-1">Retrieval Mode</div>
                    <div className="text-sm font-medium text-foreground capitalize">{evidence.metadata.retrieval_mode.replace(/_/g, ' ')}</div>
                  </div>
                )}
                {evidence.metadata.pruning_applied !== undefined && (
                  <div className="px-3 py-2 bg-background rounded-md border border-border">
                    <div className="text-xs text-muted-foreground mb-1">Pruning Applied</div>
                    <div className="text-sm font-medium text-foreground">{evidence.metadata.pruning_applied ? 'Yes' : 'No'}</div>
                  </div>
                )}
                {evidence.metadata.llm_assisted !== undefined && (
                  <div className="px-3 py-2 bg-background rounded-md border border-border">
                    <div className="text-xs text-muted-foreground mb-1">LLM Assisted</div>
                    <div className="text-sm font-medium text-foreground">{evidence.metadata.llm_assisted ? 'Yes' : 'No'}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {evidence?.paths && evidence.paths.length > 0 && (
            <div className="mb-8">
              <h3 className="text-lg font-medium mb-4">Evidence Paths</h3>
              <div className="space-y-3">
                {evidence.paths.map((path, index) => (
                  <div key={path.path_id} className="p-3 bg-muted/30 rounded-lg border border-border hover:border-primary/50 transition-colors">
                    <div className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 bg-primary/10 text-primary rounded-full flex items-center justify-center text-xs font-medium">
                        {index + 1}
                      </span>
                      <code className="flex-1 text-sm font-mono text-muted-foreground break-all">{path.symbolic}</code>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {concepts.length > 0 && (
            <div className="mb-8">
              <h3 className="text-lg font-medium mb-4">Concepts</h3>
              <div className="space-y-4">
                {concepts.map((concept, index) => (
                  <div key={index} className="border-2 border-border rounded-lg p-4 hover:border-primary/50 transition-colors bg-background">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-medium text-foreground">{concept.name}</h4>
                          <span className="text-xs bg-muted px-2 py-1 rounded">{concept.type}</span>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{concept.description}</p>
                        {concept.attributes?.domain && <div className="text-xs text-muted-foreground">Domain: {concept.attributes.domain}</div>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {relations.length > 0 && (
            <div className="mb-8">
              <h3 className="text-lg font-medium mb-4">Relations</h3>
              <div className="space-y-2">
                {relations.map((rel, index) => (
                  <div key={index} className="text-sm bg-muted px-3 py-2 rounded border border-border font-mono">
                    {rel.attributes?.source_name} → <span className="text-primary font-semibold">{rel.relationship}</span> →{' '}
                    {rel.attributes?.target_name}
                  </div>
                ))}
              </div>
            </div>
          )}

          {domains.size > 0 && (
            <div>
              <h3 className="text-lg font-medium mb-4">Domains</h3>
              <div className="flex flex-wrap gap-2">
                {Array.from(domains).map((domain, index) => (
                  <span key={index} className="px-3 py-1 bg-muted text-muted-foreground rounded-full text-sm">
                    {domain}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
