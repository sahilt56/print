// src/global.d.ts
import 'next-auth';

declare module 'next-auth' {
  interface User {
    cafeId?: string;
    role?: string;
  }
  interface Session {
    user: User & {
      id?: string;
      cafeId?: string;
      role?: string;
    };
  }
}