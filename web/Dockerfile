# Стадия сборки: tsc --noEmit + vite build (типы — часть сборки: рассинхрон
# с контрактом валит образ, это и есть герой-свойство)
FROM node:22-alpine AS build
WORKDIR /app

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# orval.config.ts не нужен: генерация — dev-time, сгенерённый клиент приходит в src/
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
RUN pnpm build

# Рантайм: nginx — единая точка входа (контракт №6)
FROM nginx:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
