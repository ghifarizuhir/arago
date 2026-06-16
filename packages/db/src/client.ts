import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Add it to your .env.local or environment."
  );
}

// Connection pool for regular queries
const queryClient = postgres(process.env.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10
});

// Single connection for migrations (drizzle-kit manages its own)
export const migrationClient = postgres(process.env.DATABASE_URL, {
  max: 1
});

export const db = drizzle(queryClient, {
  schema,
  logger: process.env.NODE_ENV === "development"
});

export type Database = typeof db;
