# Итерация 06 — фронт-пайплайн (герой проекта)

> 🎯 Тот же инженерный стандарт, другой рантайм. Existence-gate, не accuracy-gate.

## Цель
Ввести фронт-пайплайн: независимый пакет `web/` (Vite + React), Orval генерит typed
react-query-хуки из закоммиченного `api/openapi.json`, UI поверх них, nginx + полный
compose. Реализация фазами: (A) контракт-пайплайн + tsc-демо, (B) UI + оркестрация;
ревью один раз по всему диффу (решение 2026-07-23 — не расщеплять на 6a/6b).

## 🧵 Красная нить (резюме)
**End-to-end type safety (герой проекта)** — изменение Zod-схемы на бэке ломает
компиляцию фронта: `openapi.json → Orval → typed hooks → tsc`.

## Питоний аналог
drf-spectacular → Orval из tutors — тот же пайплайн, источник спеки другой (своя
Zod-схема вместо DRF-сериализаторов). Vite dev server ≈ `runserver` + прокси.

## Новая концепция (и минимальный объём)
- **Typed-клиент из своей спеки** (Vite SPA + Orval + TanStack Query): конфиг Orval
  переносится из tutors почти дословно (react-query, tags-split, httpClient fetch,
  customFetch-мутатор), но мутатор — тривиальный (без auth): префикс `/api`, JSON,
  ошибки — envelope №2 в `ApiError`. Сгенерённое (`src/generated/`) — коммитится,
  как `openapi.json` (вход для drift-gate iter 7).

## Состав
- **Фаза A — пайплайн:** `web/` (Vite+React+TS, свой lockfile, biome, без импортов из
  `api/` — правило 5); в api-роуты добавляются `tags`+`operationId` (требование
  tags-split и имён хуков), а DTO-схемы получают `.meta({id})` +
  `jsonSchemaTransformObject` в app.ts — components/$ref в спеке → именованные
  типы у Orval (`Ticket`, не `listTickets200ItemsItem`); shape домена/DTO не
  меняется (заморозка правила 3 держится) + `openapi:emit`;
  `orval.config.ts` (input — файл `../api/openapi.json`, не URL);
  `pnpm generate:api`; минимальный список тикетов на сгенерённом хуке; Vite dev proxy
  `/api/*` → `localhost:3000/*` (префикс срезается).
- **Демо героя (правило 8):** переименовать поле в Zod-схеме → `openapi:emit` +
  `generate:api` → `tsc --noEmit` в `web/` красный; убедиться и откатить.
- **Фаза B — UI:** список (фильтр `?status=` + пагинация №5), деталь, кнопки переходов
  (все статусы кроме текущего; недопустимый → 409 envelope виден в UI — матрица НЕ
  дублируется на фронте, её знает только домен). Без react-router (master-detail на
  state) и без web-тестов: `# dw-lite: web без тестов → vitest+MSW`.
- **Оркестрация (№6, знакомое — бесплатно):** `api/Dockerfile` (tsx-рантайм:
  `# dw-lite: tsx в контейнере → tsc build`, старт через `prisma migrate deploy`),
  `web/Dockerfile` (build → nginx: статика `dist` + `location /api/` → `api:3000`,
  срез префикса), compose: db + api + web(:8080). SSE-локацию не делаем (iter 9).

## Done-gate (по факту существования)
- `pnpm generate:api` из закоммиченной спеки — зелёный; повторный прогон → пустой
  `git diff` (идемпотентность, вход iter 7); `tsc --noEmit` в `web/` зелёный.
- Демо: переименование поля в Zod → регенерация → `tsc` в web падает (проверено, откачено).
- UI: список с фильтром и пагинацией, деталь, переходы; 409 отображается.
- `docker compose up -d` → `:8080` отдаёт SPA, `/api/tickets` проксируется; повторный
  `up` — no-op.
- Ревью-пайплайн чист (CRITICAL/BUG = 0).

## Шаги
1. Скаффолд `web/` + Orval-конфиг + мутатор + генерация; минимальный список (фаза A).
2. tsc-демо героя (проверить, откатить).
3. UI: фильтр+пагинация, деталь, переходы, показ 409 (фаза B).
4. Dockerfile'ы, nginx.conf, compose; смок `:8080`.
5. Ревью-пайплайн (general + constitution → аудитор → фиксы) + `/simplify`.

## Вне scope
CI drift-gate (iter 7); AI-эндпоинты и кнопки (iter 8–9); SSE-локация nginx (iter 9);
auth (решение №4); react-router, MSW, web-тесты; правки shape домена/DTO api
(заморожен; метаданные контракта — tags/operationId/.meta({id}) — не shape);
cursor-пагинация.
