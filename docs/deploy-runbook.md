# Deploy Runbook

Arago is deployed via the `Deploy` GitHub Actions workflow (`.github/workflows/deploy.yml`).
Every push to `main` triggers a production deploy.

---

## Deploy flow

```
pnpm install → vercel build → pnpm db:migrate → vercel deploy --prebuilt
  → smoke test → vercel promote (alias to prod domain)
```

The production alias is **only updated after the smoke test passes**.
A failing smoke test leaves the previous deployment live with no manual intervention needed.

---

## Rollback procedures

### Application rollback (no migration problem)

If only the application code needs to be rolled back:

```bash
# Option A — Vercel CLI
vercel rollback <previous-deployment-url> --token=$VERCEL_TOKEN

# Option B — Vercel Dashboard
# Go to: Vercel Dashboard → Project → Deployments
# Find the last good deployment, click the ⋯ menu → Promote to Production
```

The prior deployment URL is visible in the GitHub Actions run log under the
"Deploy preview (pre-promote)" step.

---

### Database rollback (bad migration)

> **CONFIRM BEFORE FIRST PROD DEPLOY**: This runbook assumes Supabase as the
> production Postgres provider with PITR enabled. Verify that the
> `PRODUCTION_DATABASE_URL` secret points to a Supabase project on the **Pro**
> plan (or higher) before the first production deploy runs. Update this section
> if a different provider is used.

**Provider**: Supabase  
**PITR retention window**: 7 days (Pro plan default)  
**Estimated recovery time**: 10–20 minutes depending on database size

#### Steps

1. **Stop traffic immediately** — in the Vercel Dashboard, roll back the
   application to the previous deployment (see Application rollback above).
   This prevents the new code from writing against the already-migrated schema.

2. **Note the rollback timestamp** — open the GitHub Actions run that caused
   the problem and record the exact start time of the "Apply DB migrations"
   step. You want to restore to a point *just before* that timestamp.

3. **Initiate PITR restore in Supabase**:
   - Open [Supabase Dashboard](https://supabase.com/dashboard) → select the
     production project.
   - Navigate to **Database → Backups**.
   - Click **Point-in-Time Recovery**.
   - Enter a timestamp 1–2 minutes before the migration step started
     (use UTC; the GitHub Actions log shows UTC times).
   - Click **Start Recovery** and confirm.
   - Wait for the restore to complete (watch the Supabase Dashboard status).

4. **Verify the database** — once restored, check that the schema matches the
   previous migration state:
   ```bash
   # Connect to the restored DB and verify the latest migration
   DATABASE_URL="<prod url>" pnpm db:migrate
   # Should print "Migrations complete." with no new migrations applied.
   ```

5. **Re-deploy the last good revision** — in GitHub Actions, navigate to the
   last successful deploy workflow run → click **Re-run all jobs**.

6. **Notify the team** — post an incident summary in the team channel with:
   - Timestamp of the bad deploy
   - Timestamp of the restore point used
   - Which migration was rolled back
   - Any data loss window (time between restore point and bad deploy)

---

## Escalation

| Situation | Owner | Action |
|-----------|-------|--------|
| Smoke test fails | On-call engineer | Check Vercel deployment logs; the prior prod deployment remains live |
| Migration fails | Backend engineer | Fix migration, push a new commit; PITR restore only if data was corrupted |
| PITR restore fails | CTO + Supabase support | Open a Supabase support ticket immediately; contact `support@supabase.io` |
| Data loss suspected | CTO | Initiate incident response; notify affected users per FERPA/COPPA obligations |

---

## Secrets required for production

| Secret | Purpose |
|--------|---------|
| `VERCEL_TOKEN` | Vercel CLI authentication |
| `VERCEL_ORG_ID` | Vercel organisation scope |
| `VERCEL_PROJECT_ID` | Vercel project to deploy to |
| `DATABASE_URL` | Production Postgres connection string (Supabase) |

None of these are configured yet. They must be added to the `production`
GitHub environment before the first production deploy.
