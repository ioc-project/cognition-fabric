'use client';

import {useParams} from 'next/navigation';
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs';
import {SoftwareList} from '@/components/software/software-list';

export default function WorkspaceKnowledgePage() {
  const params = useParams();
  const workspaceId = params.id as string;
  return (
    <div className="px-12 pt-4">
      <div className="flex flex-col justify-center items-start gap-1 mb-6">
        <h1 className="page-title-text">Knowledge</h1>
        <p className="page-title-description">Adapters and Reasoners bound to this workspace</p>
      </div>

      <Tabs defaultValue="adapters" className="space-y-0">
        <TabsList className="bg-transparent border-b border-border rounded-none h-auto p-0 w-full justify-start mb-6">
          <TabsTrigger
            value="adapters"
            className="data-[state=active]:border-b-2 data-[state=active]:border-[#0051AF] data-[state=active]:text-[#0051AF] rounded-none pb-2 px-6 font-medium text-base bg-transparent"
          >
            Adapters
          </TabsTrigger>
          <TabsTrigger
            value="reasoners"
            className="data-[state=active]:border-b-2 data-[state=active]:border-[#0051AF] data-[state=active]:text-[#0051AF] rounded-none pb-2 px-6 font-medium text-base bg-transparent"
          >
            Reasoners
          </TabsTrigger>
        </TabsList>

        <TabsContent value="adapters" className="mt-0 flex justify-center">
          <SoftwareList workspaceId={workspaceId} />
        </TabsContent>

        <TabsContent value="reasoners" className="mt-0">
          <div className="card-info text-muted-foreground">Reasoners list.</div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
