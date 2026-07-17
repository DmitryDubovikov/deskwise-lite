# Demo 03 — smoke-тест эксплуатационной поверхности

Прогон доказывает три утверждения контрактов №2 и №4: (1) **все** ошибки — невалидный body,
битый JSON, неизвестный роут, несуществующий тикет, упавший хендлер — выходят наружу в одном
envelope `{"error":{"code","message"}}` с машинным кодом, и 500 не течёт внутренностями;
(2) этот envelope — часть OpenAPI-контракта: он виден в `api/openapi.json` на кодах
400/404/500, а значит в iter 6 Orval сгенерит для него типы фронта; (3) каждый запрос
оставляет структурную JSON-строку лога с `reqId` — без этого разбирать инциденты в проде
нечем. Если хоть одно не воспроизводится — итерация не закрыта.

Все команды выполняются из корня репо: `/Users/dd/projects/pet/deskwise-lite`.
Env выставлять не нужно — у `loadConfig()` есть дефолты (`DW_PORT=3000`,
`DW_LOG_LEVEL=info`).

## 1. Гейт качества

Что доказываем: линт, строгий tsc и весь vitest-набор (включая новый `errors.test.ts`)
зелёные.

```bash
make check
```

**Ожидаемо:** Biome — `Checked 15 files ... No fixes applied`, tsc — без вывода,
vitest — `Test Files  3 passed (3)`, `Tests  16 passed (16)`.

## 2. Поднять сервер: логи — JSON-строки

Что доказываем: `make dev` теперь читает конфиг через `loadConfig()` и включает pino —
сервер с первого же события пишет структурный JSON, а не текст. В отдельном терминале:

```bash
make dev
```

**Ожидаемо:** в терминале — JSON-строки вида
`{"level":30,"time":...,"pid":...,"hostname":"...","msg":"Server listening at http://127.0.0.1:3000"}`
(Fastify разворачивает `host: 0.0.0.0` в строку на каждый интерфейс; уровень и порт
пришли из config-модуля, дефолты `.env.example`).

## 3. Структурный лог запроса несёт `reqId`

Что доказываем: request-id в каждой строке запросного лога — то, чем склеиваются все
события одного запроса при разборе инцидента; Fastify подставляет его сам.

```bash
curl -s localhost:3000/health | jq
```

**Ожидаемо:** ответ `{"status": "ok"}`, а в терминале с `make dev` — пара строк
`"msg":"incoming request"` и `"msg":"request completed"`, обе с одинаковым
`"reqId":"req-1"` (номер растёт с каждым запросом).

## 4. Невалидный body → 400 VALIDATION_ERROR

Что доказываем: ошибка Zod-валидации выходит в envelope контракта №2 с машинным кодом,
по которому клиент сможет ветвиться программно.

```bash
curl -s -X POST localhost:3000/tickets \
  -H 'content-type: application/json' \
  -d '{}' | jq
```

**Ожидаемо:** тело вида

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "body/subject Invalid input: expected string, received undefined, body/body Invalid input: expected string, received undefined"
  }
}
```

## 5. Битый JSON → тоже 400 VALIDATION_ERROR, а не FST_*-код

Что доказываем: транспортные ошибки Fastify (не-парсящийся JSON, `FST_ERR_CTP_*`)
замаппены в тот же контрактный код — внутренние имена фреймворка не текут в словарь API.

```bash
curl -s -X POST localhost:3000/tickets \
  -H 'content-type: application/json' \
  -d '{not json' | jq
```

**Ожидаемо:** `"code": "VALIDATION_ERROR"`, в message — жалоба парсера JSON
(без строки `FST_ERR`).

## 6. Неизвестный роут и несуществующий тикет → 404 NOT_FOUND

Что доказываем: 404 обоих сортов — «нет такого роута» (`setNotFoundHandler`) и «нет такого
тикета» (хендлер роута) — один и тот же envelope, единый формат ошибок без исключений.

```bash
curl -s localhost:3000/nope | jq
curl -s localhost:3000/tickets/$(uuidgen | tr 'A-Z' 'a-z') | jq
```

**Ожидаемо:** оба ответа — envelope с `"code": "NOT_FOUND"`; message первого —
`Route GET /nope not found`, второго — `Ticket not found`.

## 7. Упавший хендлер → 500 без утечки деталей

Что доказываем: необработанное исключение превращается в generic-envelope, а внутренности
уходят только в лог. Через публичный HTTP этого не вызвать — валидный сервер нарочно не
роняется, поэтому поверхность утверждения — vitest-тест с фейковым store, кидающим из
`get` (вспомогательная проверка невозможна иначе — это осознанно).

```bash
cd api && pnpm vitest run src/errors.test.ts --reporter=verbose; cd ..
```

**Ожидаемо:** `6 passed`, среди строк —
`✓ error envelope (контракт №2) > wraps handler exceptions as 500 without leaking details`:
тест сравнивает **всё** тело ответа с
`{"error":{"code":"INTERNAL_SERVER_ERROR","message":"Internal server error"}}` — строка
`secret internal detail` из исключения наружу не попала. Рядом зелёные тесты битого JSON,
404, лога с `reqId`, спеки и `/docs`.

## 8. Схемы ошибок — в `openapi.json`, эмит идемпотентен

Что доказываем: envelope — не рантайм-фокус, а часть контракта: регенерация спеки даёт
пустой diff (закоммиченный файл синхронен коду), повторный прогон — тоже (идемпотентность,
которая в iter 7 станет CI-гейтом). И показываем сам артефакт, а не только exit code.

```bash
make openapi
git diff --exit-code api/openapi.json && echo "DIFF EMPTY (1st run)"
make openapi
git diff --exit-code api/openapi.json && echo "DIFF EMPTY (2nd run)"
jq '.paths["/tickets/{id}"].get.responses | keys' api/openapi.json
jq '.paths["/tickets/{id}"].get.responses["404"].content["application/json"].schema' api/openapi.json
```

**Ожидаемо:** обе проверки печатают свой `DIFF EMPTY`; ключи ответов —
`["200", "400", "404", "500"]`; последняя команда печатает JSON Schema envelope:
`object` с обязательным полем `error`, внутри — обязательные `code` и `message`
(`additionalProperties: false`).

## 9. `/docs` — интерактивная страница из той же спеки

Что доказываем: swagger-ui рендерится из того же источника, что и `openapi.json`, — это
аналог `/docs` FastAPI, доступный до всякого фронта.

```bash
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/docs/
curl -s localhost:3000/docs/ | grep -o '<title>[^<]*</title>'
```

**Ожидаемо:** `200` и `<title>Swagger UI</title>`. Глазами (для витрины): открыть
`http://localhost:3000/docs/` в браузере — страница со всеми роутами, у
`GET /tickets/{id}` видны ответы 400/404/500 со схемой envelope.

## 10. Погасить сервер

```bash
make stop
```

**Ожидаемо:** dev-сервер остановлен, `curl -s localhost:3000/health` больше не отвечает.
