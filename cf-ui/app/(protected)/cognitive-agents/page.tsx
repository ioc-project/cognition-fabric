'use client';

import {CognitiveAgentList} from '@/components/cognitive-agents/cognitive-agent-list';
import {useDefaultWorkspace} from '@/hooks/useDefaultWorkspace';
import {LoaderRelative} from '@/components/ui/loading';

export default function CognitiveAgentsListPage() {
  const {defaultWorkspaceId, isLoading} = useDefaultWorkspace();

  if (isLoading || !defaultWorkspaceId) {
    return <LoaderRelative />;
  }

  return <CognitiveAgentList workspaceId={defaultWorkspaceId} />;
}
