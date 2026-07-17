# Итерация 01 — Schema-first: Zod + type provider + OpenAPI

> 🎯 Тот же инженерный стандарт, другой рантайм. Existence-gate, не accuracy-gate.

## Цель
Ввести schema-first-кластер: Zod-схема на роуте становится единым источником для
рантайм-валидации, статических типов хендлера и OpenAPI-спеки. Это фундамент
герой-пайплайна (Orval-клиент в iter 6, drift-gate в iter 7).

## 🧵 Красная нить (резюме)
**Schema-first Node API (фундамент героя)** — из ROADMAP, строка iter 1:
«Zod-схема на роуте = рантайм-валидация + статические типы хендлера + OpenAPI,
из одного источника».

## Питоний аналог
FastAPI + Pydantic: схема на эндпоинте = валидация + типы + автоспека. Zod ≈ Pydantic,
`fastify-type-provider-zod` ≈ то, что FastAPI делает из коробки, `@fastify/swagger` ≈
встроенный `/openapi.json` FastAPI — только спеку мы эмитим скриптом в файл (контракт №3).

## Новая концепция (и минимальный объём)
- **Zod v4 + type provider + swagger** — `fastify-type-provider-zod`
  (validatorCompiler/serializerCompiler + `jsonSchemaTransform`), `@fastify/swagger`;
  DTO-схемы тикета руками (правило 5), enum'ы status/priority — из замороженного домена.
- Демо-роуты поверх **in-memory Map** (БД — iter 4): `POST /tickets` (body),
  `GET /tickets` (query `?status=`), `GET /tickets/:id` (params, 404). Покрывают все
  четыре вида схем: body / query / params / response.
- Скрипт **`openapi:emit`**: `buildServer()` → `app.ready()` → `app.swagger()` →
  `api/openapi.json` (без слушающего сервера, файл коммитится, руками не правится).

## Done-gate (по факту существования)
- Невалидный body/params → **400 автоматом** (тест `inject()`), валидный путь работает.
- Типы хендлера выводятся из схемы — демо: переименование поля в Zod-схеме →
  `pnpm typecheck` красный (фиксируется в demo-доке, не в тесте).
- `pnpm openapi:emit` пишет `api/openapi.json` без слушающего сервера; повторный прогон —
  **пустой diff** (идемпотентность).
- Ревью-пайплайн чист (CRITICAL/BUG = 0).

## Шаги
1. Зависимости: `zod`, `fastify-type-provider-zod`, `@fastify/swagger`; сетап компиляторов
   и swagger c `jsonSchemaTransform` в `buildServer()`.
2. DTO-схемы тикета (`src/schemas/ticket.ts`) + демо-роуты на in-memory Map.
3. Скрипт `scripts/emit-openapi.ts` + npm-скрипт `openapi:emit`, закоммиченный
   `api/openapi.json`, make-цель.
4. `inject()`-тесты: 400 на невалидном body, 200/404 happy/sad path, смок на emit.
5. Ревью-пайплайн (general + constitution → аудитор → фиксы → `/simplify`).

## Вне scope
Плагины/`buildApp(deps)` (iter 2) · error envelope и setErrorHandler (iter 3; в этой
итерации 400 — дефолтный формат Fastify) · Prisma/Postgres (iter 4) · полный CRUD,
transition, пагинация №5, seed (iter 5) · Swagger-UI (спека нужна файлом, не страницей).
