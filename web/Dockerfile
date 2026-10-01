# Build a partir da pasta web/ (raiz do monorepo):
#   docker build -t faturacao-web .
#
# Mesma abordagem do financial: imagem com o node_modules completo do build
# (sem `output: "standalone"` nem `pnpm deploy`, que falham a levar o motor
# do Prisma e os packages do workspace num monorepo pnpm).

FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @faturacao/db build
RUN pnpm --filter @faturacao/web build

FROM node:22-bookworm-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
ENV NODE_ENV=production
WORKDIR /app

RUN groupadd --system --gid 1001 faturacao \
  && useradd --system --create-home --uid 1001 --gid faturacao faturacao

COPY --from=build --chown=faturacao:faturacao /app /app

USER faturacao
WORKDIR /app/apps/web
EXPOSE 3002

# `pnpm exec next start` (não `pnpm start -- …`) — ver Dockerfile do financial.
CMD ["pnpm", "exec", "next", "start", "-p", "3002", "-H", "0.0.0.0"]
