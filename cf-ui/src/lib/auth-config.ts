import {NextAuthOptions} from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

if (!process.env.NEXTAUTH_SECRET && process.env.NODE_ENV !== 'production') {
  console.warn('NEXTAUTH_SECRET is not set. Using a temporary secret for build.');
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: {label: 'Username', type: 'text'},
        password: {label: 'Password', type: 'password'}
      },
      authorize(credentials) {
        if (credentials?.username === 'admin' && credentials?.password === 'admin') {
          return {
            id: '1',
            name: 'Admin User',
            email: 'admin@example.com',
            username: credentials.username
          };
        }
        return null;
      }
    })
  ],
  pages: {
    signIn: '/login'
  },
  callbacks: {
    jwt({token, user}) {
      if (user && typeof (user as {username?: string}).username === 'string') {
        token.username = (user as {username?: string}).username;
      }
      return token;
    },
    session({session, token}) {
      if (session.user && token.username) {
        (session.user as {username?: string}).username = token.username;
      }
      return session;
    }
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60
  }
};
