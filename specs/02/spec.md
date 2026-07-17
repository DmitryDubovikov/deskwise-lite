# Итерация 02 — Plugin system: дерево плагинов + `buildApp(deps)`

> 🎯 Тот же инженерный стандарт, другой рантайм. Existence-gate, не accuracy-gate.

## Цель
Пересобрать монолитный `buildServer()` в дерево плагинов Fastify с фабрикой
`buildApp(deps)` как composition root (правило 6). Освоить кластер
register/инкапсуляция/декораторы — штатную замену DI-контейнера в Fastify.

## 🧵 Красная нить (резюме)
**«Fastify-архитектура (замена DI — плагины)»** — из ROADMAP, строка iter 2; north star №5:
«plugin system, инкапсуляция, декораторы как замена DI-контейнера, composition root =
дерево плагинов + фабрика `buildApp(deps)`».

## Питоний аналог
Django apps / FastAPI `APIRouter` + `Depends`: плагин ≈ router-модуль, декоратор ≈
зависимость из `Depends`, `buildApp(deps)` ≈ фабрика `create_app()` с подменой зависимостей
в тестах (аналог `dependency_overrides` FastAPI).

## Новая концепция (и минимальный объём)
- **Plugin system:** `register()` создаёт инкапсулированный контекст; `decorate()` кладёт
  зависимость в контекст; обычный плагин не протекает вверх, `fastify-plugin` осознанно
  хоистит ровно на один уровень. Демонстрация на реальном коде: `ticketStore` регистрируется
  fp-плагином **внутри** tickets-скоупа → виден роутам-сиблингам, невидим из корня.
- Структура: `src/app.ts` (composition root, `buildApp(deps)`),
  `src/plugins/ticket-store.ts`, `src/routes/health.ts`, `src/routes/tickets.ts`;
  `buildServer()` умирает.
- `deps = { ticketStore?: Map<string, Ticket> }` — in-memory стенд-ин Prisma-клиента
  (iter 4); дефолт — пустая Map, тесты передают фейковый pre-seeded store.

## Done-gate (по факту существования)
- Приложение — дерево плагинов; `index.ts` и `openapi:emit` работают через `buildApp`;
  тесты iter 1 зелёные после пересборки.
- **Тест инкапсуляции:** в корне `app.hasDecorator("ticketStore") === false`, при этом
  роуты внутри скоупа работают.
- **Тест фейковых deps:** app, собранный с pre-seeded store, отдаёт тикет без POST.
- `pnpm openapi:emit` → **пустой diff** (рефакторинг не меняет контракт; повторный прогон
  идемпотентен).
- Ревью-пайплайн чист (CRITICAL/BUG = 0).

## Шаги
1. Зависимость `fastify-plugin`; плагин `ticket-store` (decorate + module augmentation типа).
2. Разнести роуты на плагины (`FastifyPluginAsyncZod`), собрать дерево в `buildApp(deps)`.
3. Переключить `index.ts` и `scripts/emit-openapi.ts` на `buildApp`, удалить `server.ts`.
4. Тесты: инкапсуляция, фейковый store; обновить существующие на `buildApp`.
5. Ревью-пайплайн (general + constitution → аудитор → фиксы → `/simplify`).

## Вне scope
Config-модуль и `DW_PORT` (env появляется с iter 3–4; сейчас env не читается вовсе) ·
error envelope / `setErrorHandler` (iter 3) · Prisma и `onClose` graceful shutdown (iter 4;
у Map закрывать нечего) · CRUD/transition/пагинация №5/seed (iter 5) · Swagger-UI.
