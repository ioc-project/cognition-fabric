import {NextResponse} from 'next/server';

/**
 * Runtime configuration endpoint
 * This allows the client to fetch API URLs at runtime
 */
export function GET() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_CFN_UI_API_BASE_URL || process.env.CFN_UI_API_BASE_URL || '';

  const config = {
    apiBaseUrl
  };

  console.log('[Runtime Config] Serving config:', config);

  return NextResponse.json(config);
}
