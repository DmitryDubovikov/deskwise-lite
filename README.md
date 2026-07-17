# deskwise-lite

Учебный pet-проект: full-stack **Node.js/TypeScript** (Fastify + React/Vite за nginx) с
schema-first API — Zod-схемы на роутах порождают валидацию, типы и OpenAPI, из которого
Orval генерит типизированный react-query-клиент. Плюс OpenAI-фичи: типизированный
summarize и SSE-стриминг suggest-reply.

Шестой сиблинг семьи *-lite: «тот же инженерный стандарт, другой рантайм».

- Конституция — [CLAUDE.md](CLAUDE.md)
- План итераций — [ROADMAP.md](ROADMAP.md)

## Quickstart (по состоянию на iter 0 — каркас)

Нужен установленный `pnpm` (проект собирался на pnpm v11, Node v22). Один раз поставь
зависимости, дальше — цели из корневого `Makefile`:

```bash
cd api && pnpm install && cd ..

make dev     # tsx-watch поднимает Fastify на :3000  →  curl localhost:3000/health → {"status":"ok"}
make test    # vitest: смок-тест роута через fastify.inject() (без сети)
make check   # Biome (линт+формат) + tsc --noEmit (strict) + vitest — общий гейт качества
```

Подробности итерации — [docs/iterations/00/](docs/iterations/00/).

Showcase-README соберётся в iter 10.
