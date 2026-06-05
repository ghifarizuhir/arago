import { DefaultSession } from "next-auth";
import { UserRole } from "@arago/validators";

declare module "next-auth" {
  interface Session {
    user: {
      role: UserRole;
      schoolId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    role: UserRole;
    schoolId: string | null;
  }
}

declare module "@auth/drizzle-adapter" {
  interface AdapterUser {
    role: UserRole;
    schoolId: string | null;
  }
}