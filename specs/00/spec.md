# Итерация 00 — Каркас (Node/TS-анатомия)

> 🎯 Тот же инженерный стандарт, другой рантайм. Existence-gate, не accuracy-gate.

## Цель
Поставить голый скелет `api/`-пакета: пакетный менеджер, TS-конфиг под ESM, dev-watch,
тестраннер, линт/форматтер, hello-роут Fastify — фундамент, на котором iter 1 строит
schema-first API.

## 🧵 Красная нить (резюме)
— *(каркас; резюме-строка не заявляется в iter 0 — она появится с iter 1 и далее)*.

## Питоний аналог
pyproject + uv ≈ package.json + pnpm; `uvicorn --reload` ≈ tsx-watch; pytest ≈ vitest;
ruff ≈ Biome.

## Новая концепция (и минимальный объём)
- **Анатомия Node/TS-проекта** — package.json + pnpm (без workspaces, правило семьи №3
  ROADMAP), tsconfig под ESM (`module`/`moduleResolution: NodeNext`, `strict: true`),
  tsx-watch для dev, vitest для смок-теста, Biome одним инструментом на линт+формат.
  Минимально: один пакет `api/`, один роут (`GET /health` или аналог), один смок-тест.

## Done-gate (по факту существования)
- `api/` — самостоятельный pnpm-пакет (свой `package.json`, `pnpm-lock.yaml`), без
  workspaces.
- `pnpm dev` (tsx-watch) поднимает Fastify, hello-роут отвечает (`curl` вручную проверить).
- `pnpm test` (vitest) — зелёный смок-тест на роут через `fastify.inject()`.
- `pnpm check` (Biome lint+format check + tsc --noEmit) проходит.
- Корневой `Makefile` с целями `dev`/`test`/`check`, проксирующими в `api/`.
- Ревью-пайплайн чист (CRITICAL/BUG = 0).
- Идемпотентность: `pnpm install` повторно — no-op (lockfile не дрейфует); dev-сервер
  перезапускаем без побочных состояний (БД ещё нет — не аргумент здесь).

## Шаги
1. `api/`: `pnpm init`, зависимости (`fastify`, `tsx`, `typescript`, `vitest`, `@biomejs/biome`).
2. `tsconfig.json` под ESM/NodeNext + `strict`.
3. `src/server.ts` — голый Fastify с одним hello-роутом (`GET /health` → `{status: "ok"}`).
4. `src/server.test.ts` — vitest + `fastify.inject()` смок на роут.
5. `biome.json` — линт+формат конфиг.
6. Корневой `Makefile` (`dev`, `test`, `check` → `cd api && pnpm ...`).
7. Ревью-пайплайн (`general-reviewer` + `constitution-reviewer` → дедуп → `review-auditor`) → фиксы → `/simplify`.

## Вне scope
Zod-схемы и OpenAPI (iter 1), plugin-архитектура/`buildApp` (iter 2), логирование pino
(iter 3), Prisma/Postgres (iter 4), домен Ticket (iter 5), фронтенд (iter 6), CI (iter 7),
OpenAI (iter 8/9). GitHub remote уже существует — просто подтвердить, не создавать заново.
