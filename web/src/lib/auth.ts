import type { NextAuthOptions } from 'next-auth';
import CognitoProvider from 'next-auth/providers/cognito';

export const authOptions: NextAuthOptions = {
  providers: [
    CognitoProvider({
      clientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!,
      clientSecret: '',  // PKCE flow, no secret
      issuer: process.env.COGNITO_ISSUER!,
      idToken: true,
      checks: ['pkce', 'state'],
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.sub = (profile as { sub?: string })?.sub ?? account.providerAccountId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
  },
};
