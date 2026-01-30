import {NextAuthOptions} from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import {authApi} from '@/api/endpoints/auth';

const TOKEN_LIFETIME_MS = 60 * 60 * 1000;

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
            id: data.user?.id || credentials.username,
            name: data.user?.name || data.user?.username || credentials.username,
            email: data.user?.email || '',
            username: data.user?.username || credentials.username,
            role: data.user?.role,
            accessToken: data.access_token,
            refreshToken: data.refresh_token
          };
        } catch (error) {
          console.error('Auth error:', error);
          if (error instanceof Error) {
            console.error('Error message:', error.message);
          }
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
          console.error('User object missing required token properties');
          return {...token, error: 'MissingTokens'};
        }
        token.accessToken = userWithTokens.accessToken;
        token.refreshToken = userWithTokens.refreshToken;
        token.username = userWithTokens.username || user.name || '';
        token.role = userWithTokens.role;
        token.id = user.id;
        token.accessTokenExpires = Date.now() + TOKEN_LIFETIME_MS;
        return token;
      }

      const expiresAt = token.accessTokenExpires;
      if (typeof expiresAt === 'number' && Date.now() < expiresAt) {
        return token;
      }

      const refreshToken = token.refreshToken;
      if (typeof refreshToken !== 'string') {
        console.error('Refresh token is not available');
        return {...token, error: 'RefreshTokenMissing'};
      }

      try {
        const refreshedTokens = await authApi.refresh(refreshToken);

        if (!refreshedTokens.access_token) {
          throw new Error('Refresh response missing access token');
        }

        return {
          ...token,
          accessToken: refreshedTokens.access_token,
          accessTokenExpires: Date.now() + TOKEN_LIFETIME_MS
        };
      } catch (error) {
        console.error('Token refresh failed:', error);
        return {
          ...token,
          error: 'RefreshAccessTokenError'
        };
      }
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
