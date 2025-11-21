import {NextRequest, NextResponse} from 'next/server';

export function middleware(request: NextRequest) {
  const {pathname} = request.nextUrl;

  const publicRoutes = ['/login'];

  if (publicRoutes.includes(pathname)) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|api|favicon.ico|.*\\.).*)']
};
