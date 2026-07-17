# Demo 01 — smoke-тест schema-first API

Прогон доказывает главное утверждение итерации: **одна Zod-схема на роуте даёт сразу три
артефакта** — рантайм-валидацию (кривой запрос отбивается автоматическим 400), статические
типы хендлера (правка схемы валит компилятор) и OpenAPI-спеку (файл рождается скриптом и
идемпотентен). Это фундамент герой-пайплайна: в iter 6 из этого же `openapi.json` Orval
сгенерит типизированный клиент, в iter 7 идемпотентность эмита станет CI-гейтом дрифта.
Если хоть один из трёх артефактов не воспроизводится — итерация не закрыта.

Все команды выполняются из корня репо: `/Users/dd/projects/pet/deskwise-lite`.

## 1. Гейт качества

Что доказываем: линт, строгий tsc и все vitest-тесты зелёные — статическая половина
done-gate выполняется.

```bash
make check
```

**Ожидаемо:** Biome — `Checked 9 files ... No fixes applied`, tsc — без вывода,
vitest — `Test Files  2 passed (2)`, `Tests  8 passed (8)`.

## 2. Поднять сервер

Что доказываем: приложение реально стартует через ту же фабрику `buildServer()`, что и
тесты. В отдельном терминале:

```bash
make dev
```

**Ожидаемо:** tsx-watch поднимает Fastify на `:3000` (проверка: `curl -s localhost:3000/health`
→ `{"status":"ok"}`).

## 3. Валидный POST — схема подставляет дефолты

Что доказываем: happy path работает, и дефолт `priority: "normal"` подставляет **схема**
(в теле запроса его нет), а `status: "open"` — хендлер.

```bash
curl -s -X POST localhost:3000/tickets \
  -H 'content-type: application/json' \
  -d '{"subject": "Missing items in order #4821", "body": "Two of the five stapler boxes were not in the parcel."}' | jq
```

**Ожидаемо:** JSON тикета с полями `id` (uuid), `status: "open"`, `priority: "normal"` —
код ответа 201.

## 4. Невалидный POST — 400 автоматом, без единого if в хендлере

Что доказываем: рантайм-валидацию делает validatorCompiler по Zod-схеме — хендлер до
кривого тела даже не доходит. Смотрим само тело ошибки (артефакт, а не только код).

```bash
curl -si -X POST localhost:3000/tickets \
  -H 'content-type: application/json' \
  -d '{"subject": ""}' | head -1
curl -s -X POST localhost:3000/tickets \
  -H 'content-type: application/json' \
  -d '{"subject": ""}' | jq
```

**Ожидаемо:** первая команда — `HTTP/1.1 400 Bad Request`; вторая — дефолтный
Fastify-формат ошибки с `"code": "FST_ERR_VALIDATION"` и message, называющим оба
нарушения: `subject` короче 1 символа и отсутствующий `body`. (Единый envelope ошибок —
iter 3, здесь формат дефолтный — осознанно.)

## 5. Query- и params-схемы: фильтр, 400 на мусор, 404 на неизвестный id

Что доказываем: валидируется не только body — querystring и params тоже описаны схемами
(все четыре вида схем из спеки итерации в деле).

```bash
curl -s 'localhost:3000/tickets?status=open' | jq 'length'
curl -si 'localhost:3000/tickets?status=weird' | head -1
curl -si localhost:3000/tickets/not-a-uuid | head -1
curl -si localhost:3000/tickets/00000000-0000-0000-0000-000000000000 | head -1
```

**Ожидаемо:** число ≥ 1 (тикет из шага 3 в списке; каждый лишний POST добавляет ещё один —
хранилище in-memory и живёт до рестарта сервера); `HTTP/1.1 400 Bad Request`
(статуса `weird` нет в enum); `HTTP/1.1 400 Bad Request` (params-схема требует uuid);
`HTTP/1.1 404 Not Found` (uuid валиден, но тикета нет).

## 6. Спека рождается скриптом и идемпотентна

Что доказываем: `api/openapi.json` — не рукопись, а продукт `make openapi`, и повторный
эмит на нетронутой схеме даёт пустой diff (это утверждение в iter 7 станет CI-гейтом).
Слушающий сервер скрипту не нужен — работает и при выключенном `make dev`.

```bash
make openapi
git diff --exit-code api/openapi.json && echo "DIFF EMPTY"
```

**Ожидаемо:** вторая команда печатает `DIFF EMPTY` (exit code 0).

Показываем сам артефакт — как body-схема `POST /tickets` легла в контракт:

```bash
jq '.paths."/tickets".post.requestBody.content."application/json".schema' api/openapi.json
```

**Ожидаемо:** JSON Schema с `required: ["subject", "body"]`, `minLength: 1` у строк и
`priority` с `enum: ["low", "normal", "high"]` + `default: "normal"` — ровно то, что
написано в `CreateTicketSchema` на Zod.

## 7. Типы текут из схемы: правка Zod → красный tsc

Что доказываем: типы хендлера не написаны руками, а выводятся из схемы — переименование
поля в `CreateTicketSchema`/`TicketSchema` обязано сломать компиляцию хендлера. Заставляем
сам компилятор это подтвердить (и откатываем правку!).

```bash
sed -i '' 's/subject: z.string().min(1),/subj: z.string().min(1),/' api/src/schemas/ticket.ts
cd api && pnpm typecheck; cd ..
git checkout api/src/schemas/ticket.ts
```

**Ожидаемо:** tsc падает (exit code 1) двумя ошибками — `src/schemas/ticket.ts` (TS2322:
`pick({ subject: true })` больше не знает такого ключа) и `src/server.ts` (TS2741:
`Property 'subj' is missing ...` — хендлер собирает тикет по старому имени поля). Это и
есть доказательство: типы хендлера выведены из схемы, не написаны руками. После
`git checkout` рабочее дерево чистое и `pnpm typecheck` снова зелёный.

## 8. Погасить сервер

```bash
make stop
```

**Ожидаемо:** dev-сервер остановлен, `curl -s localhost:3000/health` больше не отвечает.
