# Демо 08 — AI-эндпоинт неотличим от обычного в типизированном контракте

Прогон доказывает красную нить итерации: OpenAI-вызов вошёл в приложение через тот же
schema-first-пайплайн, что и CRUD — Zod-схема ответа → `openapi.json` → Orval-хук →
кнопка в UI, а тесты обходятся фейковым клиентом без сети. Зачем это за пределами демо:
если AI-фича живёт в общем контракте, фронт получает её typed-хуком без единой рукописной
строки клиента, а CI-гейт iter 7 автоматически сторожит и её — рассинхрон AI-эндпоинта
краснит PR так же, как рассинхрон CRUD. Все команды запускаются из корня репо:
`/Users/dd/projects/pet/deskwise-lite`. Для шагов 1–4 и 6 сеть/ключ не нужны; шаг 5 — один
live-вызов (⚠️ копейки). Стек: `make up` (nginx :8080 + api + db), тикеты засеяны
`make seed`.

## 1. Контракт содержит AI-путь — и регенерация идемпотентна

Сначала доказываем, что summarize родился из Zod-схемы, а не дописан в спеку руками:
смотрим сам фрагмент контракта, затем дважды перегенериваем весь пайплайн и требуем, чтобы
содержимое спеки и Orval-клиента не изменилось ни на байт. Проверка — хеш-снапшотом, а не
`git diff --exit-code`: она работает и на незакоммиченном дереве (в момент церемонии
итерация ещё не в git); после коммита ту же стабильность против закоммиченного состояния
сторожит CI-джоба `contract-drift` (iter 7).

```bash
jq '.paths["/tickets/{id}/summarize"].post | {operationId, responses: (.responses | keys)}' api/openapi.json
jq '.components.schemas.TicketSummary' api/openapi.json
snap() { { shasum -a 256 api/openapi.json; find web/src/generated -type f | sort | xargs shasum -a 256; } | shasum -a 256; }
S0=$(snap); make generate >/dev/null 2>&1; S1=$(snap); make generate >/dev/null 2>&1; S2=$(snap)
[ "$S0" = "$S1" ] && [ "$S1" = "$S2" ] && echo CONTRACT-STABLE || echo CONTRACT-DRIFT
```

**Ожидаемо:** первый `jq` печатает `"operationId": "summarizeTicket"` и коды
`["200","400","404","500"]` — AI-эндпоинт описан с теми же error-схемами, что и CRUD;
второй — объект `{"summary": {"type": "string"}}` с `required: ["summary"]`; финальная
строка — `CONTRACT-STABLE` (оба прогона регенерации дали побайтно то же содержимое).

## 2. Orval родил typed-хук — фронт не писал клиента руками

Это и есть «неотличим от обычного»: хук `useSummarizeTicket` лежит в сгенерённом файле
рядом с CRUD-хуками, и именно его зовёт кнопка.

```bash
grep -n "export const useSummarizeTicket" web/src/generated/api/tickets/tickets.ts
grep -n "useSummarizeTicket\|summarize.mutate" web/src/components/TicketDetail.tsx
```

**Ожидаемо:** первый grep находит объявление хука в generated-файле (~строка 750); второй —
импорт/вызов в `TicketDetail.tsx` (`const summarize = useSummarizeTicket();` и
`summarize.mutate({ id })`).

## 3. Тесты с фейковым клиентом — без сети и без ключа

Доказываем контракт №7: vitest-прогон summarize не ходит в OpenAI. Фейк реализует узкий
интерфейс плагина и заодно проверяет детерминизм (пиннёная модель, `temperature: 0`).

```bash
cd api && pnpm vitest run src/summarize.test.ts; cd ..
```

**Ожидаемо:** `Test Files 1 passed`, `Tests 2 passed` — успех (summary из фейка доезжает
до HTTP-ответа) и 404 (клиент не вызван). Сети нет: нужен только Postgres из compose.
Побочный эффект: тесты чистят таблицу тикетов в общем dev-Postgres — поэтому шаг 5
начинается с повторного `make seed` (он идемпотентен: фиксированные id + upsert).

## 4. Ошибочный путь — 404 в общем envelope, до всякого расхода

AI-эндпоинт обязан ошибаться так же, как остальные: несуществующий тикет → 404 в едином
envelope с машинным кодом, и OpenAI при этом не вызывается (что клиент не вызван —
проверено тестом в шаге 3; здесь смотрим сам envelope через реальную поверхность, nginx).

```bash
curl -si -X POST http://localhost:8080/api/tickets/00000000-0000-0000-0000-000000000000/summarize | head -1
curl -s -X POST http://localhost:8080/api/tickets/00000000-0000-0000-0000-000000000000/summarize | jq .
```

**Ожидаемо:** статус `HTTP/1.1 404 Not Found`, тело — единый envelope:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Ticket not found"
  }
}
```

## 5. Live-вызов через продуктовую поверхность ⚠️ live, стоит денег (один вызов — копейки)

Кульминация: настоящий summary настоящего тикета — через nginx, как из UI. Требуется
реальный `DW_OPENAI_API_KEY` в `api/.env` (одной строкой:
`echo 'DW_OPENAI_API_KEY=<твой ключ с platform.openai.com>' >> api/.env` — это
единственное значение, которое знает только владелец ключа) и перезапуск стека после его
появления (`make up`).

```bash
make seed
TICKET_ID=$(curl -s "http://localhost:8080/api/tickets?limit=1" | jq -r '.items[0].id')
curl -s "http://localhost:8080/api/tickets/$TICKET_ID" | jq '{subject, body}'
curl -s -X POST "http://localhost:8080/api/tickets/$TICKET_ID/summarize" | jq .
```

**Ожидаемо:** третья команда возвращает `{"summary": "..."}` — одно-два английских
предложения, пересказывающие тело тикета из второй команды (сравни глазами: в summary —
суть именно этого письма). Батч-прогон по всем seed-тикетам НЕ гоняем (правило 4 — расход
только со спроса).

## 6. UI-кнопка (кадр витрины, глазами)

Финальный продуктовый вид — для витрины, не для доказательства (правило 8): открой
`http://localhost:8080`, выбери тикет, нажми **Summarize**.

**Ожидаемо:** кнопка на время запроса меняется на «Summarizing…», затем под телом тикета
появляется абзац summary. Переключение на другой тикет сбрасывает summary (ремоунт по
`key={selectedId}`).
