# deskwise-lite

Учебный pet-проект: full-stack **Node.js/TypeScript** (Fastify + React/Vite за nginx) с
schema-first API — Zod-схемы на роутах порождают валидацию, типы и OpenAPI, из которого
Orval генерит типизированный react-query-клиент. Плюс OpenAI-фичи: типизированный
summarize и SSE-стриминг suggest-reply.

Шестой сиблинг семьи *-lite: «тот же инженерный стандарт, другой рантайм».

- Конституция — [CLAUDE.md](CLAUDE.md)
- План итераций — [ROADMAP.md](ROADMAP.md)

## Quickstart (по состоянию на iter 6 — full-stack: SPA за nginx + typed-клиент из спеки)

Нужны установленные `pnpm` (проект собирался на pnpm v11, Node v22) и Docker. Самый быстрый
путь — весь стек в контейнерах:

```bash
make up       # docker compose up --build: nginx :8080 (SPA + прокси /api/) + api + Postgres
make seed     # идемпотентный seed ~30 тикетов Fernwood Supplies (фиксированные id + upsert)
# открой http://localhost:8080 — список тикетов, деталь, переходы статусов
```

Для разработки — зависимости, env и цели из корневого `Makefile`:

```bash
cd api && pnpm install && cp .env.example .env && cd ..
cd web && pnpm install && cd ..

make db-up    # Postgres 17 из docker-compose.yml (сервис db, healthcheck, том db-data)
make migrate  # prisma migrate dev: применяет миграции из api/prisma/migrations/
make dev      # tsx-watch поднимает Fastify на :3000  →  curl localhost:3000/health → {"status":"ok"}
make web-dev  # Vite dev-сервер :5173 с прокси /api → :3000 (нужен make dev рядом)
make stop     # погасить dev-сервер, поднятый make dev
make db-down  # погасить compose-стек (данные остаются в томе db-data)
make test     # vitest: inject()-тесты роутов на реальной БД (нужен make db-up; сети/LLM — нет)
make check    # Biome (линт+формат) + tsc --noEmit (strict, api и web) + vitest — общий гейт
make openapi  # эмит api/openapi.json из Zod-схем роутов (файл коммитится, руками не правится)
make generate # контракт-пайплайн целиком: openapi.json → Orval → web/src/generated/
```

API тикетов (iter 1, дособран в iter 5): полный REST-домен — `POST /tickets`,
`GET /tickets?status=&page=&limit=` (offset-пагинация `{items,total,page,limit}`),
`GET/PATCH/DELETE /tickets/:id` и переход статуса `POST /tickets/:id/transition` (state
machine `open → in_progress → resolved → closed` + reopen — чистая domain-функция,
недопустимый переход → 409, `status` в PATCH → 400). Каждый роут описан Zod-схемой,
которая даёт валидацию (400 автоматом), типы хендлера и OpenAPI. Домен заморожен.

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

Фронт (iter 6): независимый пакет `web/` (Vite + React + TanStack Query) — типы и
react-query-хуки генерит Orval из закоммиченного `api/openapi.json` (`make generate`),
руками DTO-типы не пишутся; правка Zod-схемы на бэке валит `tsc --noEmit` в `web/`
(end-to-end type safety). UI — список тикетов с фильтром и пагинацией, деталь и кнопки
переходов (недопустимый переход показывает 409 из envelope). В полном стеке (`make up`)
nginx на `:8080` раздаёт статику и проксирует `/api/` → `api:3000`.

Подробности итераций — [docs/iterations/](docs/iterations/).

Showcase-README соберётся в iter 10.
