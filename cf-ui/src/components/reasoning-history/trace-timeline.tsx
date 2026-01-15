'use client';

import {Check, ChevronUp, ChevronDown, Search, GitBranch, ArrowRight, Target, Sparkles, Network, FileText, CheckCircle2} from 'lucide-react';
import {cn} from '@/lib/utils';
import {useState, useMemo} from 'react';
import {Badge} from '@/components/ui/badge';
import type {Trace, Evidence, SelectedEdge} from '@/api/types/reasoning-history';

interface TraceTimelineProps {
  trace: Trace | null | undefined;
  evidence?: Evidence | null | undefined;
}

interface GroupedIteration {
  iteration: number;
  items: {
    anchor_concept: string;
    selected: SelectedEdge[];
    selected_paths_symbolic: string[];
    judge_reason_for_sufficiency: string;
    index: number;
  }[];
}

export function TraceTimeline({trace, evidence}: TraceTimelineProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['top_similar', 'iteration-1', 'item-1-0']));

  const groupedIterations = useMemo(() => {
    if (!trace?.iterations) {
      return [];
    }

    const groups: Map<number, GroupedIteration> = new Map();

    trace.iterations.forEach((item, index) => {
      const iterNum = item.iteration;
      if (!groups.has(iterNum)) {
        groups.set(iterNum, {iteration: iterNum, items: []});
      }
      groups.get(iterNum)!.items.push({
        anchor_concept: item.anchor_concept,
        selected: item.selected || [],
        selected_paths_symbolic: item.selected_paths_symbolic || [],
        judge_reason_for_sufficiency: item.judge_reason_for_sufficiency || '',
        index
      });
    });

    return Array.from(groups.values()).sort((a, b) => a.iteration - b.iteration);
  }, [trace?.iterations]);

  if (!trace?.iterations) {
    return <div className="flex items-center justify-center h-full text-muted-foreground">No trace or evidence data available</div>;
  }

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const isExpanded = (key: string) => expandedSections.has(key);

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="w-full p-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <GitBranch className="w-6 h-6 text-primary" />
            <h2 className="text-2xl font-semibold">Reasoning Trace</h2>
          </div>

          <div className="flex items-center gap-4 mb-6">
            <div
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg',
                trace.sufficient ? 'bg-green-100 dark:bg-green-900/30' : 'bg-amber-100 dark:bg-amber-900/30'
              )}
            >
              {trace.sufficient ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-green-700 dark:text-green-400" />
                  <span className="text-sm font-medium text-[#373C42] dark:text-foreground">Sufficient Evidence</span>
                </>
              ) : (
                <span className="text-sm font-medium text-[#373C42] dark:text-foreground">Insufficient Evidence</span>
              )}
            </div>
            {evidence?.summary?.supporting_paths !== undefined && (
              <div className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[#373C42] dark:text-foreground border border-border rounded-md bg-background">
                {evidence.summary.supporting_paths} Supporting Paths
              </div>
            )}
            {evidence?.summary?.unique_concepts !== undefined && (
              <div className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[#373C42] dark:text-foreground border border-border rounded-md bg-background">
                {evidence.summary.unique_concepts} Unique Concepts
              </div>
            )}
            <div className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[#373C42] dark:text-foreground border border-border rounded-md bg-background">
              {trace.lanes_count} Lanes
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[#373C42] dark:text-foreground border border-border rounded-md bg-background">
              {trace.llm_calls} LLM Calls
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            Entity: <span className="font-medium text-foreground">{trace.extracted_entity}</span>
          </p>
        </div>

        <div className="relative">
          <div className="absolute left-[11px] top-6 bottom-6 w-0.5 bg-[#E1E4E8] dark:bg-border" />

          {evidence?.paths && evidence.paths.length > 0 && (
            <div className="relative mb-4">
              <div className="flex items-start gap-4">
                <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center z-10 flex-shrink-0">
                  <FileText className="w-3 h-3 text-white" />
                </div>

                <div className="flex-1 min-w-0">
                  <button onClick={() => toggleSection('evidence_paths')} className="flex items-center gap-2 w-full text-left mb-3">
                    {isExpanded('evidence_paths') ? (
                      <ChevronUp className="w-4 h-4 text-[#7E868F]" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-[#7E868F]" />
                    )}
                    <span className="font-semibold text-sm text-[#373C42] dark:text-foreground">Evidence Paths</span>
                    <span className="text-xs text-[#596069] dark:text-muted-foreground">
                      {evidence.paths.length} path{evidence.paths.length !== 1 ? 's' : ''} found
                    </span>
                    {evidence.status === 'sufficient' && <CheckCircle2 className="w-4 h-4 text-green-600 ml-auto" />}
                  </button>

                  {isExpanded('evidence_paths') && (
                    <div className="space-y-3 ml-6">
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
                  )}
                </div>
              </div>
              <div className="mt-6 ml-[34px] border-b border-[#E1E4E8] dark:border-border" />
            </div>
          )}

          {trace.tope_similar_concepts && trace.tope_similar_concepts.length > 0 && (
            <div className="relative mb-4">
              <div className="flex items-start gap-4">
                <div className="w-6 h-6 rounded-full bg-[#1D69CC] flex items-center justify-center z-10 flex-shrink-0">
                  <Search className="w-3 h-3 text-white" />
                </div>

                <div className="flex-1 min-w-0">
                  <button onClick={() => toggleSection('top_similar')} className="flex items-center gap-2 w-full text-left">
                    {isExpanded('top_similar') ? (
                      <ChevronUp className="w-4 h-4 text-[#7E868F]" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-[#7E868F]" />
                    )}
                    <span className="font-semibold text-sm text-[#373C42] dark:text-foreground">1. Similarity Search</span>
                    <span className="text-xs text-[#596069] dark:text-muted-foreground">
                      Found {trace.tope_similar_concepts.length} similar anchor{trace.tope_similar_concepts.length !== 1 ? 's' : ''}
                    </span>
                  </button>

                  {isExpanded('top_similar') && (
                    <div className="mt-3 ml-6 space-y-3">
                      {trace.tope_similar_concepts.map((similar, idx) => (
                        <div key={idx} className="border rounded-lg border-[#E1E4E8] dark:border-border bg-[#FAFAFA] dark:bg-muted/20 p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <Target className="w-3.5 h-3.5 text-[#1D69CC]" />
                            <span className="font-medium text-sm text-[#373C42] dark:text-foreground">{similar.anchor_concept}</span>
                          </div>

                          {similar.firs_neighbour && similar.firs_neighbour.length > 0 && (
                            <div className="ml-5 space-y-1">
                              <span className="text-xs text-[#596069] dark:text-muted-foreground">Connected neighbors:</span>
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                {similar.firs_neighbour.map((neighbor, nIdx) => (
                                  <div
                                    key={nIdx}
                                    className="inline-flex items-center gap-1.5 px-2 py-1 bg-white dark:bg-muted rounded border border-[#E1E4E8] dark:border-border text-xs"
                                  >
                                    <span className="text-[#1D69CC] font-medium">{neighbor.relation}</span>
                                    <ArrowRight className="w-3 h-3 text-[#7E868F]" />
                                    <span className="text-[#373C42] dark:text-foreground">{neighbor.to}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {(!similar.firs_neighbour || similar.firs_neighbour.length === 0) && (
                            <div className="ml-5 text-xs text-[#7E868F] italic">No neighbors found</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-6 ml-[34px] border-b border-[#E1E4E8] dark:border-border" />
            </div>
          )}

          {groupedIterations.map((group, groupIndex) => {
            const iterKey = `iteration-${group.iteration}`;
            const isIterExpanded = isExpanded(iterKey);
            const indentLevel = (group.iteration - 1) * 24;

            return (
              <div key={group.iteration} className="relative mb-4">
                <div className="flex items-start gap-4">
                  <div className="w-6 h-6 rounded-full bg-[#1D69CC] flex items-center justify-center z-10 flex-shrink-0">
                    <GitBranch className="w-3 h-3 text-white" />
                  </div>

                  <div className="flex-1 min-w-0" style={{marginLeft: indentLevel}}>
                    <button onClick={() => toggleSection(iterKey)} className="flex items-center gap-2 w-full text-left">
                      {isIterExpanded ? <ChevronUp className="w-4 h-4 text-[#7E868F]" /> : <ChevronDown className="w-4 h-4 text-[#7E868F]" />}
                      <span className="font-semibold text-sm text-[#373C42] dark:text-foreground">Iteration {group.iteration}</span>
                      <span className="text-xs text-[#596069] dark:text-muted-foreground">
                        {group.items.length} anchor{group.items.length !== 1 ? 's' : ''} explored
                      </span>
                    </button>

                    {isIterExpanded && (
                      <div className="mt-3 ml-6 space-y-3">
                        {group.items.map((itemData, itemIndex) => {
                          const itemKey = `item-${group.iteration}-${itemIndex}`;
                          const isItemExpanded = isExpanded(itemKey);
                          const isWinningAnchor =
                            trace.winning?.anchor_concept === itemData.anchor_concept && groupIndex === groupedIterations.length - 1;

                          return (
                            <div
                              key={itemData.index}
                              className={cn(
                                'border rounded-lg overflow-hidden',
                                isWinningAnchor
                                  ? 'border-green-500 bg-green-50 dark:bg-green-950/20'
                                  : 'border-[#E1E4E8] dark:border-border bg-[#FAFAFA] dark:bg-muted/20'
                              )}
                            >
                              <button onClick={() => toggleSection(itemKey)} className="flex items-center gap-3 p-3 w-full text-left">
                                {isItemExpanded ? (
                                  <ChevronUp className="w-4 h-4 text-[#7E868F] flex-shrink-0" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-[#7E868F] flex-shrink-0" />
                                )}

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-sm text-[#373C42] dark:text-foreground">{itemData.anchor_concept}</span>
                                    {isWinningAnchor && <Badge className="bg-green-600 hover:bg-green-700 text-xs ml-auto">Winner</Badge>}
                                  </div>
                                </div>
                              </button>

                              {isItemExpanded && (
                                <div className="px-3 pb-3 border-t border-[#E1E4E8] dark:border-border bg-white dark:bg-muted/10">
                                  {itemData.selected?.length > 0 && (
                                    <div className="pt-3">
                                      <div className="flex items-center gap-2 mb-2">
                                        <Network className="w-3.5 h-3.5 text-[#1D69CC]" />
                                        <span className="text-xs font-medium text-[#596069] dark:text-muted-foreground uppercase tracking-wide">
                                          Selected Paths ({itemData.selected.length})
                                        </span>
                                      </div>

                                      <div className="space-y-2 ml-5">
                                        {itemData.selected.map((sel: any, selIdx: number) => (
                                          <div
                                            key={selIdx}
                                            className="flex items-center gap-2 flex-wrap p-2 bg-[#F7F7F7] dark:bg-muted/30 rounded border border-[#E1E4E8] dark:border-border"
                                          >
                                            <span className="px-2 py-0.5 bg-white dark:bg-muted rounded text-sm font-medium text-[#373C42] dark:text-foreground border border-[#E1E4E8] dark:border-border">
                                              {sel.from}
                                            </span>
                                            <div className="flex items-center gap-1">
                                              <div className="w-4 h-0.5 bg-[#1D69CC]" />
                                              <span className="px-1.5 py-0.5 bg-[#1D69CC]/10 text-[#1D69CC] text-xs font-semibold rounded">
                                                {sel.relation}
                                              </span>
                                              <ArrowRight className="w-4 h-4 text-[#1D69CC]" />
                                            </div>
                                            <span className="px-2 py-0.5 bg-white dark:bg-muted rounded text-sm font-medium text-[#373C42] dark:text-foreground border border-[#E1E4E8] dark:border-border">
                                              {sel.to}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {itemData.selected_paths_symbolic?.length > 0 && (
                                    <div className="pt-3">
                                      <div className="flex items-center gap-2 mb-2">
                                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                                        <span className="text-xs font-medium text-[#596069] dark:text-muted-foreground uppercase tracking-wide">
                                          Symbolic Paths
                                        </span>
                                      </div>

                                      <div className="ml-5 space-y-1">
                                        {itemData.selected_paths_symbolic.map((path: string, pathIdx: number) => (
                                          <div
                                            key={pathIdx}
                                            className="font-mono text-xs text-[#596069] dark:text-muted-foreground bg-[#F7F7F7] dark:bg-muted/30 px-2 py-1.5 rounded border border-[#E1E4E8] dark:border-border"
                                          >
                                            {path}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {itemData.judge_reason_for_sufficiency && (
                                    <div className="pt-3">
                                      <div className="flex items-start gap-2">
                                        <div className="w-1 h-full bg-amber-400 rounded-full flex-shrink-0 self-stretch min-h-[20px]" />
                                        <div>
                                          <span className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wide block mb-1">
                                            Judge Assessment
                                          </span>
                                          <p className="text-sm text-[#596069] dark:text-muted-foreground italic">
                                            &ldquo;{itemData.judge_reason_for_sufficiency}&rdquo;
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-6 ml-[34px] border-b border-[#E1E4E8] dark:border-border" />
              </div>
            );
          })}

          {trace.winning && (
            <div className="relative mb-4">
              <div className="flex items-start gap-4">
                <div className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center z-10 flex-shrink-0">
                  <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold text-sm text-green-800 dark:text-green-200">Conclusion</span>
                      <Badge className="bg-green-600 hover:bg-green-700 text-xs text-white">{trace.winning.anchor_concept}</Badge>
                    </div>
                    <p className="text-sm text-green-700 dark:text-green-300">{trace.winning.reason_for_sufficiency}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
