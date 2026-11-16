// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {CreateMASForm} from '@/components/mas/create-mas-form';
import {useDefaultWorkspace} from '@/hooks/useDefaultWorkspace';
import {LoaderRelative} from '@/components/ui/loading';

export default function CreateMas() {
  const {defaultWorkspaceId, isLoading} = useDefaultWorkspace();

  if (isLoading || !defaultWorkspaceId) {
    return <LoaderRelative />;
  }

  return <CreateMASForm workspaceId={defaultWorkspaceId} />;
}
