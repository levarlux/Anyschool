# syntax=docker/dockerfile:1
# AnySchool API — multi-stage production image.
# Built by Coolify on the OCI Ampere (ARM64) instance; node:22-alpine is
# multi-arch and every dependency here is pure JS, so no cross-compile needed.

# ---------- builder ---------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Workspace manifests first — layer-cache npm ci against source-only changes.
# (web/ must stay in the manifest set: the root lockfile covers all workspaces.)
COPY package.json package-lock.json ./
COPY api/package.json ./api/
COPY web/package.json ./web/
COPY shared/package.json ./shared/
COPY drizzle/package.json ./drizzle/
RUN npm ci

# Source. api/src imports ../../drizzle/schema and ../../shared directly,
# so both workspaces are part of the build.
COPY drizzle ./drizzle
COPY shared ./shared
COPY api ./api

# Single-file ESM bundle — resolves extensionless/workspace imports that plain
# `tsc` output cannot run under Node ESM, and keeps the runtime image slim.
RUN npm run build:prod --workspace api

# ---------- runtime ---------------------------------------------------------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app/api

# api's own production dependencies only (no workspaces, no devDependencies).
COPY api/package.json ./
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund

COPY --from=build /app/api/dist ./dist

# Unprivileged — the app never binds a port <1024 or writes inside the image.
USER node
EXPOSE 3000

# /health is public and DB-independent, so a Neon hiccup never flaps health.
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/health" || exit 1

# PORT is injected by Coolify when the port is overridden; default matches EXPOSE.
CMD ["node", "dist/index.js"]
