import {NextAuthOptions} from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import {authApi} from '@/api/endpoints/auth';

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
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        try {
          const data = await authApi.login(credentials.username, credentials.password);

          return {
            id: (data.user?.id as string) || credentials.username,
            name: (data.user?.name as string) || (data.user?.username as string) || credentials.username,
            email: (data.user?.email as string) || '',
            username: (data.user?.username as string) || credentials.username,
            role: data.user?.role as string,
            accessToken: data.access_token,
            refreshToken: data.refresh_token
          };
        } catch {
          return null;
        }
      }
    })
  ],
  pages: {
    signIn: '/login'
  },
  callbacks: {
    async jwt({token, user}) {
      // Initial sign in
      if (user) {
        const userWithTokens = user as {accessToken?: string; refreshToken?: string; username?: string; role?: string};
        if (!userWithTokens.accessToken || !userWithTokens.refreshToken) {
          return {...token, error: 'MissingTokens'};
        }
        token.accessToken = userWithTokens.accessToken;
        token.refreshToken = userWithTokens.refreshToken;
        token.username = userWithTokens.username || user.name || '';
        token.role = userWithTokens.role;
        token.id = user.id;
        return token;
      }

      // Return existing token without refresh (backend doesn't support /api/auth/refresh)
      return token;
    },
    session({session, token}) {
      if (session.user && typeof token.accessToken === 'string') {
        const sessionWithTokens = session as {accessToken?: string; refreshToken?: string};
        sessionWithTokens.accessToken = token.accessToken;
        if (typeof token.refreshToken === 'string') {
          sessionWithTokens.refreshToken = token.refreshToken;
        }
        const userWithMeta = session.user as {username?: string; role?: string; id?: string};
        if (typeof token.username === 'string') {
          userWithMeta.username = token.username;
        }
        if (typeof token.role === 'string') {
          userWithMeta.role = token.role;
        }
        if (typeof token.id === 'string') {
          userWithMeta.id = token.id;
        }
      }
      return session;
    }
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60
  }
};
