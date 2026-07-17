# Итерация 03 — Эксплуатационная поверхность: pino, setErrorHandler, /docs

> 🎯 Тот же инженерный стандарт, другой рантайм. Existence-gate, не accuracy-gate.

## Цель

Ввести эксплуатационную поверхность сервиса: структурные JSON-логи с request-id (pino,
встроенный в Fastify) и единый формат ошибок (`setErrorHandler` + envelope контракта №2),
причём схемы ошибок — часть OpenAPI-контракта. Бонус решения 2026-07-17: `@fastify/swagger-ui`
на `/docs` — интерактивная страница из той же спеки.

## 🧵 Красная нить (резюме)

> **Typed errors в контракте + structured logging** (ROADMAP, строка 3): pino пишет
> структурный JSON (request-id в каждой строке); `setErrorHandler` — все ошибки в envelope №2;
> схемы ошибок видны в `openapi.json` на каждый код; 404/500 — единого формата;
> `@fastify/swagger-ui` на `/docs`.

Продвигает пункты north-star «Schema-first Node API» (ошибки тоже schema-first) и
стек-строку (pino).

## Питоний аналог

structlog (JSON-логгер с контекстом запроса) + FastAPI exception handlers
(`@app.exception_handler` → единый envelope) + автостраница `/docs` FastAPI.
Config-модуль — аналог pydantic `Settings` (env читается в одном месте, префикс `DW_`).

## Новая концепция (и минимальный объём)

- **Эксплуатационная поверхность Fastify** — pino не ставится отдельно: это встроенный
  логгер Fastify, включается опцией `logger` при создании инстанса; request-id (`reqId`)
  Fastify кладёт в каждую строку запросного лога сам. `setErrorHandler` +
  `setNotFoundHandler` на корне приложения переводят **все** ошибки (Zod-валидация → 400,
  неизвестный роут → 404, необработанное исключение → 500) в envelope
  `{"error": {"code", "message"}}`; 500 не течёт внутренностями наружу (детали — только в лог).
  Схема envelope — одна Zod-схема (`schemas/error.ts`), навешивается на коды ответов роутов
  → попадает в `openapi.json`. Env (`DW_PORT`, `DW_LOG_LEVEL`) читается только в
  `src/config.ts` (контракт №4).

## Done-gate (по факту существования)

- `make dev` (или `pnpm dev`) пишет JSON-строки логов; у запросных строк есть `reqId`.
- Невалидный body → 400 `{"error":{"code":"VALIDATION_ERROR",...}}`; неизвестный роут и
  несуществующий тикет → 404 envelope; брошенное в хендлере исключение → 500 envelope с
  generic-месседжем (тест через фейковый store, кидающий из `get`).
- `pnpm openapi:emit` → в `api/openapi.json` схема ошибки видна на кодах 400/404/500;
  повторный прогон — пустой diff (идемпотентно).
- `GET /docs` отдаёт интерактивную страницу swagger-ui из той же спеки.
- Ревью-пайплайн чист (CRITICAL/BUG = 0).

## Шаги

1. `src/config.ts` — config-модуль (`DW_PORT`, `DW_LOG_LEVEL`, дефолты), `index.ts` читает
   только его; `.env.example` в git.
2. Логгер: `buildApp` принимает опцию `logger` (тесты — без логов, dev — JSON, тест логов —
   in-memory stream с проверкой `reqId`).
3. `schemas/error.ts` (envelope №2) + `setErrorHandler`/`setNotFoundHandler` в `app.ts`;
   роут `GET /tickets/:id` переводится на envelope, схемы ошибок — на кодах ответов роутов;
   регенерация `openapi.json`.
4. `@fastify/swagger-ui` на `/docs`.
5. Тесты (vitest + `inject()`) на все пункты done-gate; ревью-пайплайн + `/simplify`.

## Вне scope

- 409/переходы статусов (state machine — iter 5; envelope просто готов к этому коду).
- Пагинация списка (контракт №5 — iter 5), Prisma (iter 4), любой фронт.
- pino-pretty/транспорты, ротация логов, метрики/трейсинг — не тащим.
- RFC 9457 problem+json (`# dw-lite: envelope → RFC 9457` — зафиксированный не-апгрейд).
