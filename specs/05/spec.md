# Итерация 05 — REST-сборка

> 🎯 Тот же инженерный стандарт, другой рантайм. Existence-gate, не accuracy-gate.

## Цель
Собрать из выученного (Zod-схемы, плагины, Prisma) полный REST-домен тикетов:
CRUD + state machine переходов + пагинация + seed. Новой учёбы почти ноль — итерация
завершает домен и замораживает его.

## 🧵 Красная нить (резюме)
**Домен готов кормить героя-пайплайн** — после этой итерации `openapi.json` содержит
весь контракт, из которого iter 6 сгенерит typed-клиент, а iter 8–9 добавят AI-эндпоинты.

## Питоний аналог
DRF/FastAPI CRUD — делали десять раз: ViewSet/роутер + сериализаторы + переходной
экшен + offset-пагинация + фикстуры (`loaddata` ≈ seed-скрипт).

## Новая концепция (и минимальный объём)
Незнакомого нет — сборка. Микро-новое: `z.strictObject` для PATCH-DTO (явный 400 при
попытке патчить `status` вместо тихого стрипа — защита state machine, контракт №1).

## Состав
- **Domain state machine** (контракт №1): `src/domain/ticket-status.ts` — статусы и
  матрица `open → in_progress → resolved → closed` + reopen `resolved → in_progress`,
  чистая функция `canTransition(from, to)` без импортов Fastify/Prisma;
  `schemas/ticket.ts` берёт enum статусов из domain (схема зависит от домена, не наоборот).
- **`POST /tickets/:id/transition {to}`**: 200 + тикет; недопустимый переход →
  **409 `CONFLICT`** (новый код в словаре `ErrorCode`), неизвестный id → 404.
- **CRUD добор**: `PATCH /tickets/:id` (subject/body/priority, все опциональны,
  `strictObject` — `status` в body → 400), `DELETE /tickets/:id` → 204.
- **Пагинация** (контракт №5): `GET /tickets?page=&limit=&status=` →
  `{items, total, page, limit}`; `orderBy id` для стабильности страниц.
- **Seed ~30 тикетов**: `prisma/seed.ts` + `prisma db seed` (конфиг в
  `prisma.config.ts`), фиксированные id + `upsert` — **идемпотентно** (повторный прогон
  возвращает канон, дублей нет); English, осмысленные тела (материал для AI-итераций),
  разброс статусов/приоритетов; Makefile-цель `seed`.

## Done-gate (по факту существования)
- Недопустимый переход (`open → closed`, любой из `closed`) → 409 envelope `CONFLICT`;
  допустимая цепочка и reopen проходят (inject-тесты).
- `GET /tickets` отвечает `{items, total, page, limit}`; фильтр `?status=` работает
  вместе с пагинацией.
- PATCH с `status` в body → 400; DELETE → 204, повторный GET → 404.
- `pnpm db:seed` дважды подряд → в БД ровно ~30 тикетов, повторный прогон — no-op
  по составу (идемпотентность).
- `openapi:emit` регенерит спеку со всеми новыми роутами; домен **заморожен**.
- `inject()`-тесты на CRUD/переходы/ошибки зелёные + ревью-пайплайн чист (CRITICAL/BUG = 0).

## Шаги
1. `src/domain/ticket-status.ts` (+ unit-тест матрицы); `schemas/ticket.ts` переводится
   на domain-enum, добавляются `UpdateTicketSchema` (strict) и `TicketListSchema`.
2. `routes/tickets.ts`: пагинация в GET-списке, PATCH, DELETE, transition; `CONFLICT`
   в `ErrorCode`.
3. `prisma/seed.ts` (фиксированные id, upsert) + `prisma db seed` + Makefile `seed`.
4. `inject()`-тесты: пагинация, PATCH/DELETE, цепочка переходов, 409/404/400;
   `openapi:emit`.
5. Ревью-пайплайн (general-reviewer + constitution-reviewer → аудитор → фиксы) + `/simplify`.

## Вне scope
Фронт/Orval/nginx/compose api-сервиса (iter 6); CI (iter 7); AI-эндпоинты (iter 8–9);
новые поля модели (`createdAt` и пр. — домен заморожен, порядок списка — по `id`);
cursor-пагинация и RFC 9457 (зафиксированные не-апгрейды).
