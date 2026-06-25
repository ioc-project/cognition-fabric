// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import {withAuth} from 'next-auth/middleware';
import {NextResponse} from 'next/server';

export default withAuth(
  function middleware(req) {
    if (req.nextauth.token && (req.nextUrl.pathname === '/login' || req.nextUrl.pathname === '/signup')) {
      return NextResponse.redirect(new URL('/', req.url));
    }
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({token, req}) => {
        if (req.nextUrl.pathname === '/login' || req.nextUrl.pathname === '/signup') {
          return true;
        }
        return !!token;
      }
    },
    pages: {
      signIn: '/login'
    }
  }
);

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.svg|.*\\.ico).*)']
};
