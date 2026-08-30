import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id: string;
      cafeId: string;
      role: 'cafe' | 'super-admin';
    };
  }

  interface User {
    cafeId: string;
    role: 'cafe' | 'super-admin';
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    cafeId?: string;
    role?: 'cafe' | 'super-admin';
  }
}
