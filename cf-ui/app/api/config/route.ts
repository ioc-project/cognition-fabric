import {NextResponse} from 'next/server';

/**
 * Runtime configuration endpoint
 * This allows the client to fetch API URLs at runtime instead of having them baked in at build time
 */
export async function GET() {
  const config = {
    apiBaseUrl: process.env.NEXT_PUBLIC_CFN_UI_API_BASE_URL || process.env.CFN_UI_API_BASE_URL || ''
  };

  return NextResponse.json(config);
}
