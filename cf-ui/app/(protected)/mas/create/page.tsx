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
