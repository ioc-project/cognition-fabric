'use client';

export default function ReasoningHistoryPage() {
  return (
    <div className="px-12 pt-4">
      <div className="flex flex-col justify-center items-start gap-1 mb-6">
        <h1 className="page-title-text">Reasoning History</h1>
        <p className="page-title-description">Filter and inspect reasoning and evidence events across MAS and components</p>
      </div>
      {/* TODO: Filters: MAS, Adapter, Reasoner, time range; timeline */}
    </div>
  );
}
