import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@arago/db/client";
import { authenticateUser } from "@/lib/auth/password";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db),
  session: { strategy: "database" },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }
        const user = await authenticateUser(
          credentials.email as string,
          credentials.password as string
        );
        return user;
      },
    }),
  ],
  callbacks: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async session({ session, user }: any) {
      if (session.user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).role = user.role;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).schoolId = user.schoolId;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
});