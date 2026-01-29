import {DefaultSession} from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      username?: string;
    } & DefaultSession['user'];
    accessToken?: string;
    refreshToken?: string;
    error?: string;
  }

  interface User {
    username?: string;
    accessToken?: string;
    refreshToken?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    username?: string;
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    error?: string;
  }
}
