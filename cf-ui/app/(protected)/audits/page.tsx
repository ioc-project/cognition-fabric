'use client';

import {BasePage} from '@/components/ui/base-page';
import {AuditTable} from '@/components/audits/audit-table';
import {breadcrumbs} from '@/constants/routes';

export default function AuditsPage() {
  return (
    <BasePage title="Audits" description="Browse all audit events across your resources" useBreadcrumbs breadcrumbs={breadcrumbs.auditsList()}>
      <AuditTable />
    </BasePage>
  );
}
