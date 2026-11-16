// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import {NextResponse} from 'next/server';

function durationSeconds(value: string | undefined, fallback: number): number {
  const seconds = Number(value?.trim() || String(fallback));
  // Browser timers use a signed 32-bit millisecond delay.
  return Number.isSafeInteger(seconds) && seconds >= 0 && seconds <= Math.floor(2_147_483_647 / 1000) ? seconds : fallback;
}

/**
 * Runtime configuration endpoint
 * This allows the client to fetch API URLs at runtime
 */
export function GET() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_CFN_UI_API_BASE_URL || process.env.CFN_UI_API_BASE_URL || '';
  const refreshSeconds = durationSeconds(process.env.CFN_UI_AUDIT_REFRESH_INTERVAL_SECONDS, 30);
  const flashSeconds = durationSeconds(process.env.CFN_UI_AUDIT_FLASH_DURATION_SECONDS, 60);

  const config = {
    apiBaseUrl,
    auditRefreshIntervalMs: refreshSeconds * 1000,
    auditFlashDurationMs: flashSeconds * 1000
  };

  console.log('[Runtime Config] Serving config:', config);

  return NextResponse.json(config, {headers: {'Cache-Control': 'no-store'}});
}
