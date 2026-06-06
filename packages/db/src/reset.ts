import postgres from "postgres";

const connectionString = process.env.DATABASE_URL!;

const client = postgres(connectionString, {
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
  // Suppress per-statement TRUNCATE ... CASCADE NOTICEs; the script already
  // logs each truncated table explicitly.
  onnotice: () => {},
});

async function reset() {
  console.log("Resetting database...");

  const tableNames = [
    "submission_responses",
    "assessment_submissions",
    "assessment_items",
    "assessments",
    "class_memberships",
    "classes",
    "standards",
    "audit_log",
    "users",
    "schools",
    "districts",
  ];

  for (const table of tableNames) {
    await client.unsafe(`TRUNCATE TABLE ${table} CASCADE`);
    console.log(`  Truncated ${table}`);
  }

  console.log("Database reset complete. Run db:seed to repopulate.");
  await client.end();
}

reset().catch((err) => {
  console.error("Reset failed:", err);
  process.exit(1);
});