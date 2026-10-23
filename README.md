# AnySchool

A multi-tenant school management platform built with a dynamic, zero-default architecture.

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