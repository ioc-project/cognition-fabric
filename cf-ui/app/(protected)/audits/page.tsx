// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {BasePage} from '@/components/ui/base-page';
import {AuditTable} from '@/components/audits/audit-table';

export default function AuditsPage() {
  return (
    <div className="space-y-8">
      <BasePage title="Audits" description="Browse all audit events across your resources">
        <AuditTable />
      </BasePage>
    </div>
  );
}
