# Итерация 08 — OpenAI из Node: `POST /tickets/:id/summarize`

> 🎯 Тот же инженерный стандарт, другой рантайм. Existence-gate, не accuracy-gate.

## Цель

Ввести интеграцию OpenAI из Node: официальный `openai` SDK как декорированная зависимость
(Fastify-плагин, фейковый клиент в тестах), поверх — первый AI-эндпоинт, который проходит
через тот же schema-first-пайплайн, что и CRUD.

## 🧵 Красная нить (резюме)

> **AI-эндпоинт неотличим от обычного в типизированном контракте** — `POST
> /tickets/:id/summarize`: openai SDK через декоратор (правило 6), `temperature=0`,
> пиннёный снапшот; Zod-схема ответа → спека → Orval-хук → кнопка в UI; тесты с
> мок-клиентом, CI без сети (№7).

## Питоний аналог

`requests → openai-python`: тот же официальный SDK, тот же паттерн «клиент — зависимость,
мок на границе» (fake client аргументом в `buildApp` ≈ dependency override в FastAPI).

## Новая концепция (и минимальный объём)

- **openai npm SDK (Responses API)** — `client.responses.create({model, input,
  temperature: 0})` → `output_text` (решение 2026-07-23; семантические стрим-события
  пригодятся в iter 9). Плагин `openaiPlugin` — копия шва `prismaPlugin`: узкий
  структурный интерфейс клиента, декоратор, фейк в тестах без сети. Промпт — константа.
  Модель: **`gpt-4.1-nano-2025-04-14`** (пин-гейт `-\d{4}-\d{2}-\d{2}$` — проверка в
  config-схеме).

## Done-gate (по факту существования)

- `POST /tickets/:id/summarize` отвечает `200 {summary}` (Zod-схема ответа), `404` в
  envelope; live-вызов работает через `curl` (копейки, батчей нет).
- `make generate` идемпотентен: `openapi.json` содержит новый путь, Orval родил
  `useSummarizeTicket`, повторный прогон — пустой diff (drift-gate iter 7 зелёный).
- Кнопка Summarize в детали тикета показывает summary через сгенерённый хук.
- vitest: summarize с фейковым клиентом (успех + 404), без сети; CI-джобы получают
  заглушечные `DW_OPENAI_*` (паттерн `DW_DATABASE_URL`).
- Ревью-пайплайн чист (CRITICAL/BUG = 0).

## Шаги

1. Конфиг: `DW_OPENAI_API_KEY` (непустой), `DW_OPENAI_MODEL` (regex-пин); `.env.example`,
   env в CI-джобах (api, contract-drift).
2. `plugins/openai.ts` (узкий интерфейс + декоратор) + `deps.openai` в `buildApp`;
   реальный клиент — фабрикой по образцу `createPrismaClient`.
3. Роут `summarize` (схемы `SummarizeResponse`), промпт-константа, `temperature: 0`;
   тесты с фейком.
4. `make generate` → закоммиченные `openapi.json` + Orval-клиент; кнопка в
   `TicketDetail`.
5. Ревью-пайплайн (general + constitution → аудит → фиксы → `/simplify`).

## Вне scope

Стриминг/SSE (iter 9) · suggest-reply · сохранение summary в БД (домен заморожен,
правило 3) · retry/rate-limit-обвязка · LangChain/evals/кассеты (правило 4) · UI сверх
одной кнопки и текста.
