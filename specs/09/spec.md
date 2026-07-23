# Итерация 09 — SSE и Node-стримы: `POST /tickets/:id/suggest-reply`

> 🎯 Тот же инженерный стандарт, другой рантайм. Existence-gate, не accuracy-gate.

## Цель

Показать витринную силу Node — асинхронный I/O на стриминге: стрим токенов OpenAI
протекает через Fastify SSE-ответом до React-UI без буферизации по всему пути
(api → nginx → браузер). Клиент — руками: осознанная граница контракт-подхода.

## 🧵 Красная нить (резюме)

> **SSE token streaming** — `suggest-reply`: стрим OpenAI → SSE-ответ Fastify; `curl -N`
> показывает токены (правило 8); ручной хук на фронте (осознанное исключение из
> автогена — задокументировать «почему»); токены дорисовываются в UI; nginx не
> буферизует (№6); мок-стрим в тестах.

## Питоний аналог

`StreamingResponse` из FastAPI (сервер) + `requests.iter_lines` (клиент) — но здесь
это родная стихия рантайма: стрим OpenAI — async iterable, `for await` пишет чанки
прямо в HTTP-ответ.

## Новая концепция (и минимальный объём)

- **SSE поверх Node-стримов** — один эндпоинт `POST /tickets/:id/suggest-reply`:
  `client.responses.create({stream: true})` → `for await` по событиям →
  `reply.raw.write()` SSE-кадров, мимо Zod-сериализатора. Узкий интерфейс границы
  (`plugins/openai.ts`) расширяется stream-вариантом; фейк-стрим в тестах — тот же шов
  `buildApp(deps)`, что в iter 8.
- **Wire-формат (фиксируем, фронт его парсит):** кадры `data: {"delta":"<текст>"}`,
  финальный `data: [DONE]`; ошибка после старта стрима — кадр `event: error` +
  `data: {envelope}`. 404 до старта — обычный JSON-envelope (заголовки ещё не ушли).
- **Вне OpenAPI:** роут скрыт из спеки (`hide`) — OpenAPI/Orval стриминг не описывают
  (заметка №6 ROADMAP); ручной хук `useSuggestReplyStream` поверх fetch-reader
  (не EventSource: его авто-reconnect повторно триггерил бы платную генерацию).
  Промпт — константа, `temperature=0`, модель из `app.ai` (№7).

## Done-gate (по факту существования)

- `curl -N` на живом api показывает токены по мере генерации (одиночный live-вызов —
  копейки); то же через nginx `:8080/api/...` — SSE-локация с `proxy_buffering off`.
- vitest с фейк-стримом, без сети: тело ответа — SSE-кадры в порядке стрима +
  `[DONE]`; `temperature=0` и пиннёная модель дошли до вызова; 404 — envelope,
  клиент не позван.
- Кнопка Suggest reply в `TicketDetail`: токены дорисовываются в UI по мере прихода.
- `make generate` — пустой diff: `openapi.json` и Orval-клиент не изменились
  (эндпоинт осознанно вне контракта); повторный прогон стрима состояние не мутирует.
- Ревью-пайплайн чист (CRITICAL/BUG = 0).

## Шаги

1. Граница OpenAI: stream-вариант в узком интерфейсе `OpenAIResponsesClient`
   (реальный SDK соответствует структурно), фабрика без изменений.
2. Роут `suggest-reply`: `hide` из спеки, Zod-валидация params живёт; 404 до стрима;
   SSE-заголовки + `for await` → `reply.raw`; промпт-константа. Тесты с фейк-стримом
   (успех + 404 + ошибка после старта).
3. Фронт: `useSuggestReplyStream` (fetch-reader, парс `data:`-кадров, накопление в
   state) + кнопка и текст в `TicketDetail`; комментарий-«почему» об исключении из
   автогена.
4. nginx: SSE-локация с `proxy_buffering off` (заготовка-комментарий из iter 6);
   проверка `curl -N` напрямую и через compose.
5. Ревью-пайплайн (general + constitution → аудит → фиксы → `/simplify`).

## Вне scope

Сохранение suggested reply в БД (домен заморожен, правило 3) · отмена/AbortController
и reconnect-логика · WebSockets · вынос summarize на стриминг · retry/rate-limit ·
UI сверх кнопки и дорисовывающегося текста · SSE-описание в OpenAPI (заметка №6).
