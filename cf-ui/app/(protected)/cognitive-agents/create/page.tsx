'use client';

import {CreateCognitiveAgentForm} from '@/components/cognitive-agents/create-cognitive-agent-form';
import {useDefaultWorkspace} from '@/hooks/useDefaultWorkspace';
import {LoaderRelative} from '@/components/ui/loading';

export default function CreateCognitiveAgentPage() {
  const {defaultWorkspaceId, isLoading} = useDefaultWorkspace();

  if (isLoading || !defaultWorkspaceId) {
    return <LoaderRelative />;
  }

  return <CreateCognitiveAgentForm workspaceId={defaultWorkspaceId} />;
}
