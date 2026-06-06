# @arago/db

Database layer for Arago: Drizzle ORM schema, migrations, client, and seed/reset tooling for PostgreSQL.

## Layout

| Path                     | Purpose                                                        |
| ------------------------ | ------------------------------------------------------------- |
| `src/schema/index.ts`    | Drizzle table definitions (source of truth for the schema).   |
| `src/client.ts`          | Pooled runtime `db` client (exported via `@arago/db`).        |
| `src/migrate.ts`         | Applies pending migrations from `drizzle/`.                   |
| `src/seed.ts`            | Populates a fresh dev database with sample data.              |
| `src/reset.ts`           | Truncates all data (schema preserved); run `db:seed` after.  |
| `drizzle/`               | Generated SQL migrations + snapshot metadata (committed).     |
| `drizzle.config.ts`      | drizzle-kit config (dialect, schema path, output dir).        |

## Prerequisites

All scripts read the connection string from `DATABASE_URL`:

```bash
export DATABASE_URL="postgres://user:pass@host:5432/arago"
```

## Scripts

| Command            | What it does                                                              |
| ------------------ | ------------------------------------------------------------------------- |
| `pnpm db:generate` | Diff the schema and emit a new SQL migration into `drizzle/`.             |
| `pnpm db:migrate`  | Apply all pending migrations. Idempotent — safe to re-run.               |
| `pnpm db:push`     | Push the schema directly without a migration (dev convenience only).     |
| `pnpm db:seed`     | Insert sample dev data (district, school, users, class, standards, …).   |
| `pnpm db:reset`    | Truncate every table (cascade). Follow with `pnpm db:seed`.              |

## Typical dev workflow

```bash
# 1. Point at a Postgres instance
export DATABASE_URL="postgres://postgres:postgres@localhost:5432/arago"

# 2. Apply migrations to a fresh DB
pnpm db:migrate

# 3. Load sample data
pnpm db:seed

# 4. Wipe + reload data without dropping the schema
pnpm db:reset && pnpm db:seed
```

## Changing the schema

1. Edit `src/schema/index.ts`.
2. Run `pnpm db:generate` to produce a new migration in `drizzle/`.
3. Review the generated SQL, commit it alongside the schema change.
4. Run `pnpm db:migrate` to apply.

Migrations are tracked in the `drizzle.__drizzle_migrations` table, so `db:migrate`
only ever applies what is pending. Never hand-edit a migration that has already been
applied to a shared environment — generate a new one instead.

## Seed data

`db:seed` creates a self-contained dev fixture:

- **District / school:** Springfield Public Schools → Springfield Elementary
- **Users:** a teacher, a student, and an admin (`*@springfield.edu`)
- **Class:** "4th Grade Math" with the student enrolled
- **Standards:** a sample of Grade 4 Common Core math standards
- **Assessment:** a draft quiz with one multiple-choice and one short-answer item,
  a student submission, graded responses, and an audit-log entry

Password hashes in the seed are placeholders — they are **not** valid credentials.
