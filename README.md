# deskwise-lite

Учебный pet-проект: full-stack **Node.js/TypeScript** (Fastify + React/Vite за nginx) с
schema-first API — Zod-схемы на роутах порождают валидацию, типы и OpenAPI, из которого
Orval генерит типизированный react-query-клиент. Плюс OpenAI-фичи: типизированный
summarize и SSE-стриминг suggest-reply.

Шестой сиблинг семьи *-lite: «тот же инженерный стандарт, другой рантайм».

- Конституция — [CLAUDE.md](CLAUDE.md)
- План итераций — [ROADMAP.md](ROADMAP.md)

## Quickstart (по состоянию на iter 3 — pino, envelope ошибок, `/docs`)

Нужен установленный `pnpm` (проект собирался на pnpm v11, Node v22). Один раз поставь
зависимости, дальше — цели из корневого `Makefile`:

```bash
cd api && pnpm install && cd ..

make dev      # tsx-watch поднимает Fastify на :3000  →  curl localhost:3000/health → {"status":"ok"}
make stop     # погасить dev-сервер, поднятый make dev
make test     # vitest: inject()-тесты роутов (без сети)
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

Подробности итераций — [docs/iterations/](docs/iterations/).

Showcase-README соберётся в iter 10.
