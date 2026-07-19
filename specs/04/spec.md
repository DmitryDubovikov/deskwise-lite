# Итерация 04 — Prisma-цикл

> 🎯 Тот же инженерный стандарт, другой рантайм. Existence-gate, не accuracy-gate.

## Цель
Ввести Postgres + Prisma как слой хранения: схема, миграция, генерённый клиент,
graceful shutdown. Заменить in-memory `Map` в тикет-роутах на реальную БД.

## 🧵 Красная нить (резюме)
Prisma в стек-строке.

## Питоний аналог
SQLAlchemy + Alembic: `schema.prisma` = декларативная модель + источник миграций;
`prisma migrate dev` = `alembic revision --autogenerate` + `alembic upgrade head`;
генерённый `PrismaClient` = типизированная сессия вместо `Session`/`Query`.

## Новая концепция (и минимальный объём)
- **Prisma-цикл** — `schema.prisma` с enum'ами `TicketStatus`/`TicketPriority` и моделью
  `Ticket` (поля 1:1 с `TicketSchema`); одна миграция (`prisma migrate dev`), файлы
  коммитятся; `PrismaClient` передаётся в `buildApp(deps)` декоратором через
  fastify-plugin-обёртку (замена `ticket-store.ts`), с `onClose`-хуком на `$disconnect()`.
  По умолчанию (без явного `deps.prisma`) `buildApp` лениво строит клиент из
  `loadConfig().databaseUrl` (правило 6: env только в config.ts) — так `openapi:emit` не
  требует поднятой БД, а `src/index.ts` не меняется. Postgres поднимается
  `docker-compose.yml` в корне репо (сервис `db`, без api/web-сервисов — те придут в
  iter 6).

## Done-gate (по факту существования)
- `docker compose up -d db` поднимает Postgres с healthcheck.
- `api/prisma/schema.prisma` содержит enum'ы и модель `Ticket`; `prisma migrate dev`
  применяет миграцию к чистой БД без ошибок; файлы миграции закоммичены.
- `PrismaClient` виден в тикет-скоупе через декоратор (`app.prisma`), невидим на корне
  приложения (тест на инкапсуляцию, как и было с `ticketStore`); `onClose` вызывает
  `$disconnect()`.
- Существующие три роута (`POST /tickets`, `GET /tickets`, `GET /tickets/:id`) читают/пишут
  реальную БД вместо `Map` — это и есть «живой CRUD-роут поверх реальной БД» (роуты не
  расширяются: фильтры/пагинация/transition — iter 5).
- `pnpm test` (при поднятой `db`) зелёный; тесты чистят таблицу `Ticket` перед каждым
  тестом (idempotent-требование: повторный прогон не плодит дубли и не зависит от
  порядка тестов).
- `openapi:emit` даёт пустой diff (контракт роутов не менялся).
- Ревью-пайплайн чист (CRITICAL/BUG = 0).

## Шаги
1. `docker-compose.yml`: сервис `db` (postgres, healthcheck, именованный volume);
   `.env.example` + `config.ts`: `DW_DATABASE_URL`.
2. `api/prisma/schema.prisma` (datasource из `DW_DATABASE_URL`, enum'ы, модель `Ticket`);
   `prisma migrate dev --name init`; `postinstall: prisma generate`.
3. `src/plugins/prisma.ts` (замена `ticket-store.ts`): декоратор `app.prisma`, `onClose`
   graceful shutdown; `buildApp(deps)` принимает `prisma?: PrismaClient`, по умолчанию
   строит клиент из `loadConfig()` (ленивое подключение — `openapi:emit` не требует
   поднятой БД).
4. `routes/tickets.ts`: три роута переведены на `app.prisma.ticket.*`; удалить
   `TicketStore`/`ticket-store.ts` и связанный тест на инкапсуляцию — переписать под
   `prisma`.
5. Тесты: общий `PrismaClient` в `test-setup.ts` (`beforeEach` чистит таблицу), тесты на
   реальной БД передают его явно как `deps.prisma` — не по одному pg-пулу на `buildApp()`;
   Makefile — цели `db-up`/`db-down`/`migrate`.
6. Ревью-пайплайн (general-reviewer + constitution-reviewer → аудитор → фиксы) + `/simplify`.

## Вне scope
Фильтры/пагинация/transition-эндпоинт, seed, domain state machine (iter 5); api/web в
compose и nginx-маршрутизация (iter 6); CI postgres service container (iter 7).
