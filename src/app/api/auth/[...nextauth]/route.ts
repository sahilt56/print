import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "User ID", type: "text", placeholder: "cafe-owner-id" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        const username = credentials.username.trim().toLowerCase();
        const superAdminId = process.env.SUPER_ADMIN_USER_ID?.trim().toLowerCase();
        const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD;

        if (superAdminId && superAdminPassword && username === superAdminId) {
          const received = Buffer.from(credentials.password, 'utf8');
          const expected = Buffer.from(superAdminPassword, 'utf8');
          if (received.length === expected.length && crypto.timingSafeEqual(received, expected)) {
            return { id: 'super-admin', name: 'System Admin', cafeId: '', role: 'super-admin' };
          }
          return null;
        }

        const cafe = await prisma.cafe.findUnique({
          where: { loginId: username }
        });

        if (!cafe) {
          return null;
        }
        if (!cafe.password) {
          return null;
        }

        const isPasswordValid = await bcrypt.compare(credentials.password, cafe.password);
        if (!isPasswordValid) {
          return null;
        }

        return {
          id: cafe.id,
          email: cafe.loginId,
          name: cafe.ownerName,
          cafeId: cafe.qrCode, // passing qrCode as the cafe identifier
          role: 'cafe',
        };
      }
    })
  ],
  session: {
    strategy: "jwt"
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.cafeId = user.cafeId;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        if (session.user && token.id && token.cafeId !== undefined && token.role) {
          session.user.id = token.id;
          session.user.cafeId = token.cafeId;
          session.user.role = token.role;
        }
      }
      return session;
    }
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
