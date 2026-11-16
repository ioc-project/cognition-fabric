// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {MASList} from '@/components/mas/mas-list';
import {useDefaultWorkspace} from '@/hooks/useDefaultWorkspace';
import {LoaderRelative} from '@/components/ui/loading';

export default function MASListPage() {
  const {defaultWorkspaceId, isLoading} = useDefaultWorkspace();

  if (isLoading || !defaultWorkspaceId) {
    return <LoaderRelative />;
  }

  return <MASList workspaceId={defaultWorkspaceId} />;
}
