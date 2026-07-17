# Señal — imagen multi-stage para Raspberry Pi 4B (arm64) y amd64
# Build:  docker build -t senal .
# En la Pi el build nativo produce arm64 automáticamente.

# ── Etapa 1: build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

COPY prisma ./prisma
RUN pnpm prisma:generate

COPY apps ./apps
RUN pnpm --filter web build && pnpm --filter api build

# ── Etapa 2: runtime (solo prod deps + dist) ─────────────────────────────────
FROM node:22-alpine AS runtime
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --prod

COPY prisma ./prisma
RUN pnpm prisma:generate

COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/web/dist apps/web/dist

EXPOSE 3001
# Aplica migraciones pendientes y arranca. El seed corre solo si la BD está vacía
# (BootstrapService). La BD vive en /app/data → montar como volumen.
CMD ["sh", "-c", "pnpm prisma:deploy && node apps/api/dist/main.js"]
