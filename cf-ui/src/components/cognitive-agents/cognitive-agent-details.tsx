'use client';

import {useEffect} from 'react';
import {useParams, useRouter} from 'next/navigation';
import {BasePage} from '@/components/ui/base-page';
import {Card, CardContent} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Textarea} from '@/components/ui/textarea';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {routes} from '@/constants/routes';
import {DATE_TIME_FORMAT_OPTIONS} from '@/lib/utils';
import {useCognitionEngine} from '@/hooks/useCognitionEngines';

export default function CognitiveAgentDetailsPage() {
  const router = useRouter();
  const params = useParams();

  const rawCognitiveAgentId = (params as Record<string, string | string[] | undefined>)?.cognitiveAgentId;
  const cognitiveAgentId = Array.isArray(rawCognitiveAgentId) ? rawCognitiveAgentId[0] : rawCognitiveAgentId;

  const {cognitionEngine: cognitiveAgent, error, isLoading} = useCognitionEngine(cognitiveAgentId as string);

  useEffect(() => {
    if (!cognitiveAgentId) {
      router.replace('/not-found');
    }
  }, [cognitiveAgentId, router]);

  const crumbs = cognitiveAgent
    ? [
        {link: routes.cognitiveAgents.list, text: 'Cognition Engines'},
        {link: '', text: cognitiveAgent.cognitive_engine_name, active: true}
      ]
    : undefined;

  return (
    <>
      <BasePage
        title={cognitiveAgent?.cognitive_engine_name || 'Cognition Engine'}
        description="View details about your cognition engine"
        useBreadcrumbs
        breadcrumbs={crumbs}
      >
        <ConditionalSWRRenderer
          data={cognitiveAgent}
          error={error}
          customIsLoading={isLoading}
          itemName="Cognition Engine details"
          errorListStateProps={{title: 'Failed to load Cognition Engine details'}}
          emptyListStateProps={{title: 'No details found'}}
        >
          <div className="flex justify-center py-4">
            <Card variant="list" className="w-full max-w-4xl">
              <CardContent className="p-8">
                <div className="space-y-8">
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Engine Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label>Engine ID</Label>
                        <Input value={cognitiveAgent?.cognitive_engine_id || ''} disabled readOnly className="font-mono text-xs" />
                      </div>
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input value={cognitiveAgent?.cognitive_engine_name || ''} disabled readOnly />
                      </div>
                      <div className="space-y-2">
                        <Label>Status</Label>
                        <Input value={cognitiveAgent?.enabled ? 'Enabled' : 'Disabled'} disabled readOnly />
                      </div>
                      <div className="space-y-2">
                        <Label>Workspace ID</Label>
                        <Input value={cognitiveAgent?.workspace_id || ''} disabled readOnly className="font-mono text-xs" />
                      </div>
                    </div>
                  </div>

                  {/* Configuration */}
                  {cognitiveAgent?.config && Object.keys(cognitiveAgent.config).length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold mb-4">Configuration</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {Object.entries(cognitiveAgent.config).map(([key, value]) => {
                          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                            return (
                              <div key={key} className="space-y-2 md:col-span-2">
                                <Label className="capitalize">{key.replace(/_/g, ' ')}</Label>
                                <Textarea
                                  value={JSON.stringify(value, null, 2)}
                                  disabled
                                  readOnly
                                  className="font-mono text-sm min-h-[100px] resize-none"
                                />
                              </div>
                            );
                          }

                          return (
                            <div key={key} className="space-y-2">
                              <Label className="capitalize">{key.replace(/_/g, ' ')}</Label>
                              <Input
                                value={typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
                                disabled
                                readOnly
                                className={typeof value === 'string' && value.length > 50 ? 'font-mono text-xs' : ''}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label>Created At</Label>
                        <Input
                          value={
                            cognitiveAgent?.created_at
                              ? new Date(cognitiveAgent.created_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS)
                              : 'Unknown'
                          }
                          disabled
                          readOnly
                        />
                      </div>
                      {/* <div className="space-y-2">
                        <Label>Updated At</Label>
                        <Input
                          value={
                            cognitiveAgent?.updated_at
                              ? new Date(cognitiveAgent.updated_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS)
                              : 'Unknown'
                          }
                          disabled
                          readOnly
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Created By</Label>
                        <Input value={cognitiveAgent?.created_by || ''} disabled readOnly className="font-mono text-xs" />
                      </div>
                      <div className="space-y-2">
                        <Label>Updated By</Label>
                        <Input value={cognitiveAgent?.updated_by || 'N/A'} disabled readOnly className="font-mono text-xs" />
                      </div> */}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </ConditionalSWRRenderer>
      </BasePage>
    </>
  );
}
