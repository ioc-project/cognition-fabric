// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

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
