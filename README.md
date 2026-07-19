# deskwise-lite

Учебный pet-проект: full-stack **Node.js/TypeScript** (Fastify + React/Vite за nginx) с
schema-first API — Zod-схемы на роутах порождают валидацию, типы и OpenAPI, из которого
Orval генерит типизированный react-query-клиент. Плюс OpenAI-фичи: типизированный
summarize и SSE-стриминг suggest-reply.

Шестой сиблинг семьи *-lite: «тот же инженерный стандарт, другой рантайм».

- Конституция — [CLAUDE.md](CLAUDE.md)
- План итераций — [ROADMAP.md](ROADMAP.md)

## Quickstart (по состоянию на iter 4 — Prisma + PostgreSQL)

Нужны установленные `pnpm` (проект собирался на pnpm v11, Node v22) и Docker. Один раз
поставь зависимости и env, подними Postgres и примени миграции — дальше цели из корневого
`Makefile`:

```bash
cd api && pnpm install && cp .env.example .env && cd ..

make db-up    # Postgres 17 из docker-compose.yml (сервис db, healthcheck, том db-data)
make migrate  # prisma migrate dev: применяет миграции из api/prisma/migrations/
make dev      # tsx-watch поднимает Fastify на :3000  →  curl localhost:3000/health → {"status":"ok"}
make stop     # погасить dev-сервер, поднятый make dev
make db-down  # погасить compose-стек (данные остаются в томе db-data)
make test     # vitest: inject()-тесты роутов на реальной БД (нужен make db-up; сети/LLM — нет)
make check    # Biome (линт+формат) + tsc --noEmit (strict) + vitest — общий гейт качества
make openapi  # эмит api/openapi.json из Zod-схем роутов (файл коммитится, руками не правится)
```

API тикетов (iter 1): `POST /tickets`, `GET /tickets?status=`, `GET /tickets/:id` — каждый
роут описан Zod-схемой, которая даёт валидацию (400 автоматом), типы хендлера и OpenAPI.

Эксплуатационная поверхность (iter 3): все ошибки — в едином envelope
`{"error":{"code","message"}}`, описанном в спеке на кодах 400/404/500; каждый запрос
пишет JSON-строку pino-лога с `reqId`; интерактивная документация — на
`http://localhost:3000/docs/`. Env (`DW_PORT`, `DW_LOG_LEVEL`) читается только в
`api/src/config.ts`, дефолты — в `api/.env.example`.

Хранилище (iter 4): тикеты живут в PostgreSQL — модель и enum'ы описаны в
`api/prisma/schema.prisma`, SQL-миграции закоммичены в `api/prisma/migrations/`,
типизированный `PrismaClient` генерится при `pnpm install` (хук `postinstall`) и входит в
приложение декоратором `app.prisma` через `buildApp(deps)`. Строка подключения —
`DW_DATABASE_URL` (см. `api/.env.example`).

Подробности итераций — [docs/iterations/](docs/iterations/).

Showcase-README соберётся в iter 10.
