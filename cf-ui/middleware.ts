import {withAuth} from 'next-auth/middleware';
import {NextResponse} from 'next/server';
import crypto from 'crypto';

// Ensure NEXTAUTH_SECRET is set before middleware runs
if (!process.env.NEXTAUTH_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('NEXTAUTH_SECRET must be set in production');
  }
  console.warn('NEXTAUTH_SECRET not set - auto-generating for development ');
  process.env.NEXTAUTH_SECRET = crypto.randomBytes(32).toString('base64');
}

export default withAuth(
  function middleware(req) {
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({token}) => !!token
    },
    pages: {
      signIn: '/login'
    }
  }
);

export const config = {
  matcher: ['/((?!login|api|_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.svg|.*\\.ico).*)']
};
