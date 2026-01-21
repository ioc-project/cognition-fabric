'use client';

import {useState} from 'react';
import {cognitiveAgentApi} from '@/api/endpoints';
import type {CognitiveAgentQueryRequest} from '@/api/types/cognitive-agent';
import {Card, CardContent} from '@/components/ui/card';
import {Label} from '@/components/ui/label';
import {Textarea} from '@/components/ui/textarea';
import {Button} from '@/components/ui/button';
import {ChevronDown, ChevronUp} from 'lucide-react';

interface CognitiveAgentQueryProps {
  workspaceId: string;
  cognitiveAgentId: string;
}

export function CognitiveAgentQuery({workspaceId, cognitiveAgentId}: CognitiveAgentQueryProps) {
  const [intent, setIntent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<unknown>(null);
  const [isResponseExpanded, setIsResponseExpanded] = useState(false);

  const onSubmit = async () => {
    if (!intent.trim() || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setResponse(null);

    try {
      const payload: CognitiveAgentQueryRequest = {intent, records: []};
      const res = await cognitiveAgentApi.query(workspaceId, cognitiveAgentId, payload);
      setResponse(res);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to gather evidence';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex justify-center py-1">
      <Card variant="list" className="w-full max-w-4xl">
        <CardContent className="p-3 space-y-2">
          <div className="space-y-2">
            <Label>Gather evidence</Label>
            <Textarea
              placeholder="Type your intent"
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (intent.trim() && !isSubmitting) {
                    void onSubmit();
                  }
                }
              }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
              }}
              className="min-h-[40px] resize-none"
            />
            <div className="flex w-full items-center justify-between mt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIntent('');
                  setResponse(null);
                  setError(null);
                  setIsResponseExpanded(false);
                }}
                disabled={isSubmitting}
              >
                Clear
              </Button>
              <Button variant="sidebar" onClick={onSubmit} disabled={isSubmitting}>
                {isSubmitting ? 'Gathering…' : 'Gather evidence'}
              </Button>
            </div>
          </div>

          {error && (
            <div className="text-red-600 text-sm mt-0.5" role="alert">
              {error}
            </div>
          )}

          {response != null && (
            <div className="space-y-3 mt-6">
              <div className="sticky top-0 z-10 bg-background pb-2">
                <Button
                  variant="sidebar"
                  onClick={() => setIsResponseExpanded(!isResponseExpanded)}
                  className="w-full flex items-center justify-between"
                >
                  <span>View Response</span>
                  {isResponseExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
              {isResponseExpanded && (
                <pre className="bg-muted p-4 rounded-md overflow-auto text-xs max-h-96 border border-border">{JSON.stringify(response, null, 2)}</pre>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
