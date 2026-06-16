import type { DefaultSession } from 'next-auth';
import type { SessionUser } from '@/lib/auth/types';

declare module 'next-auth' {
  interface Session {
    user: SessionUser & DefaultSession['user'];
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface User extends SessionUser {}
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    email: string;
    name: string;
  }
}
