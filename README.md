# AnySchool

**v2.0** — a multi-tenant school management platform built with a dynamic, zero-default architecture.

## The 1.0 → 2.0 overhaul rewrite

AnySchool 2.0 is a **complete overhaul rewrite** of our 1.0 platform — not a refactor,
not a version bump, and not a port of the old codebase. The 2.0 codebase starts from a
single fresh root commit (`first rewrite overhaul`) and re-implements the application
from the ground up.

### Why we rewrote instead of refactoring

1.0 got the product working, but it accreted organically: its final stretch was spent
chasing platform plumbing — browser-based Clerk auth bridged into the Tauri desktop
shell through deep links and an API relay fallback, popup fixes, and handoff documents
patching over the seams. Each fix made the next one harder. Rather than keep layering
band-aids on an architecture we had outgrown, we rebooted the codebase and rebuilt the
platform around the design we actually wanted.

### What changed in 2.0

- **Clean-slate history** — one fresh root commit instead of a continuation of the 1.0
  graph; the default branch now carries only the 2.0 rewrite.
- **Restructured workspace layout** — the app is organized as explicit npm workspaces
  (`api`, `web`, `shared`, `drizzle`) with a thin root `package.json` that orchestrates
  dev, build, and migration scripts.
- **Dynamic, zero-default architecture** — schema-driven, multi-tenant data model where
  nothing is assumed per tenant and fields are configured rather than hard-coded.
- **Rebuilt integration layer** — auth, data access, and the desktop shell were
  re-implemented as part of the new structure rather than patched into the old one.

### What carries over

The proven stack survived the rewrite: Neon PostgreSQL with Drizzle ORM, a Hono API
server, a React + Vite frontend, the Tauri desktop shell, and Clerk for authentication.
2.0 keeps the tools that worked and discards the scaffolding that didn't.

## Tech Stack

- **Database:** Neon PostgreSQL
- **ORM:** Drizzle ORM
- **API:** Hono
- **Frontend:** React + Vite
- **Desktop:** Tauri
- **Auth:** Clerk

## Project Structure

```
AnySchool-app/
├── api/           # Hono API server
├── web/           # React + Vite frontend
├── shared/        # Shared types and utilities
├── drizzle/       # Database schema and migrations
└── package.json   # Root package.json with scripts
```

## Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables (see `.env.example` files)
4. Run the development servers: `npm run dev`

## Documentation

See the `../` directory for detailed specification documents (00-12).
