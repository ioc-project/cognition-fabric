'use client';

import {useState} from 'react';
import {reasonerApi} from '@/api/endpoints';
import type {ReasonerQueryRequest} from '@/api/types/reasoner';
import {Card, CardContent} from '@/components/ui/card';
import {Label} from '@/components/ui/label';
import {Textarea} from '@/components/ui/textarea';
import {Button} from '@/components/ui/button';

interface ReasonerQueryProps {
  workspaceId: string;
  reasonerId: string;
}

export function ReasonerQuery({workspaceId, reasonerId}: ReasonerQueryProps) {
  const [intent, setIntent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<unknown>(null);

  const onSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    setResponse(null);

    try {
      const payload: ReasonerQueryRequest = {intent, records: []};
      const res = await reasonerApi.query(workspaceId, reasonerId, payload);
      setResponse(res);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to run query';
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
            <Label>Run a Query</Label>
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
                }}
                disabled={isSubmitting}
              >
                Clear
              </Button>
              <Button variant="sidebar" onClick={onSubmit} disabled={!intent.trim() || isSubmitting}>
                {isSubmitting ? 'Running…' : 'Run Query'}
              </Button>
            </div>
          </div>

          {error && (
            <div className="text-red-600 text-sm mt-0.5" role="alert">
              {error}
            </div>
          )}

          {response != null && (
            <div className="space-y-2">
              <Label>Response</Label>
              <pre className="bg-muted p-2 rounded-md overflow-auto text-xs">{JSON.stringify(response, null, 2)}</pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
