import NextAuth, { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import dbConnect from '@/lib/dbConnect';
import Cafe from '@/models/Cafe';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: 'User ID', type: 'text', placeholder: 'cafe-owner-id' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        const username = credentials.username.trim().toLowerCase();
        const superAdminId = process.env.SUPER_ADMIN_USER_ID?.trim().toLowerCase();
        const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD;

        // 1. Super Admin Authentication Check
        if (superAdminId && superAdminPassword && username === superAdminId) {
          const received = Buffer.from(credentials.password, 'utf8');
          const expected = Buffer.from(superAdminPassword, 'utf8');

          if (
            received.length === expected.length &&
            crypto.timingSafeEqual(received, expected)
          ) {
            return {
              id: 'super-admin-id',
              name: 'System Admin',
              cafeId: '',
              role: 'super-admin',
            };
          }
          return null;
        }

        // 2. Connect MongoDB & Fetch Cafe Admin
        await dbConnect();

        const cafe = await Cafe.findOne({
          $or: [
            { loginId: username },
            { qrCode: username },
          ],
        });

        if (!cafe || !cafe.password) {
          return null;
        }

        // 3. Password Verification via bcryptjs
        const isPasswordValid = await bcrypt.compare(credentials.password, cafe.password);
        if (!isPasswordValid) {
          return null;
        }

        // Return Authenticated User Object
        return {
          id: cafe._id.toString(),
          name: cafe.ownerName || cafe.name,
          email: cafe.loginId,
          cafeId: cafe.qrCode,
          role: 'cafe',
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.cafeId = (user as any).cafeId;
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        (session.user as any).id = token.id;
        (session.user as any).cafeId = token.cafeId;
        (session.user as any).role = token.role;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };