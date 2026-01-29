'use client';

import {useState} from 'react';
import {Copy, Check, AlertTriangle} from 'lucide-react';
import {Modal} from '@/components/ui/modal';
import {Button} from '@/components/ui/button';
import {Alert, AlertDescription} from '@/components/ui/alert';

interface ShowApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiKey: string;
  keyId?: string;
}

export function ShowApiKeyDialog({open, onOpenChange, apiKey}: ShowApiKeyDialogProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="API Key Created"
      description="Copy your API key now. You won't be able to see it again."
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={() => onOpenChange(false)} variant="sidebar">
            Done
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Alert variant="default" className="bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-900">
          <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
          <AlertDescription className="text-yellow-800 dark:text-yellow-200">
            Make sure to copy your API key now. For security reasons, you won't be able to see it again.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">API Key</label>
          <div className="flex gap-2">
            <div className="flex-1 px-3 py-2 bg-muted rounded-md border border-border font-mono text-sm break-all">{apiKey}</div>
            <Button onClick={handleCopy} variant="outline" size="icon" className="shrink-0">
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
