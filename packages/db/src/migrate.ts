import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const migrationClient = postgres(process.env.DATABASE_URL, { max: 1 });

async function runMigrations(): Promise<void> {
  console.log("Running migrations...");
  const db = drizzle(migrationClient);
  await migrate(db, {
    migrationsFolder: path.join(__dirname, "../drizzle")
  });
  console.log("Migrations complete.");
  await migrationClient.end();
}

runMigrations().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
