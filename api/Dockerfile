# dw-lite: tsx в контейнере → tsc build (для фикстуры компиляция не окупается)
FROM node:22-alpine
WORKDIR /app

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# Слой зависимостей: postinstall (prisma generate) нужна только schema.prisma —
# миграции копируются ниже, чтобы новая миграция не гнала pnpm install заново
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma/schema.prisma ./prisma/
RUN pnpm install --frozen-lockfile

# COPY мержит поверх: src/generated/prisma из postinstall выживает
# (в контексте его нет — .dockerignore)
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src

EXPOSE 3000
# migrate deploy перед стартом: контейнер сам доводит схему БД (идемпотентно)
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && exec pnpm exec tsx src/index.ts"]
