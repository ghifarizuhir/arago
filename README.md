# Arago

AI-Powered Assessment Platform for Teachers.

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL 16+

### Setup

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
# Edit .env.local with your database URL and API keys
pnpm db:push
pnpm dev
```

### Development

```bash
pnpm dev          # Start all services
pnpm build        # Build all packages
pnpm lint         # Lint all packages
pnpm typecheck    # Type-check all packages
pnpm test         # Run unit/integration tests
```

## Architecture

See [Phase 0 Plan](docs/) for ADRs and detailed architecture decisions.

- **Monorepo** managed by Turborepo + pnpm workspaces
- **Next.js 15** (App Router) for frontend + API
- **PostgreSQL 16** with **Drizzle ORM** for type-safe data access
- **NextAuth v5** for authentication with role-based access
- **Vercel AI SDK** for provider-agnostic LLM integration
- **TypeScript strict** + **Zod** for runtime validation

## FERPA/COPPA Compliance

- UUIDs for all primary keys (no count leakage)
- Row-level security scoped to school/district boundaries
- Soft-delete pattern on educational records
- Server-side sessions for audit compliance
- All AI-generated content requires teacher review before student visibility

## License

Proprietary — KarsaLabs