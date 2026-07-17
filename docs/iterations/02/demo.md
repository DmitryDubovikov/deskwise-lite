# Demo 02 — smoke-тест дерева плагинов и `buildApp(deps)`

Итерация — рефакторинг, поэтому прогон доказывает три утверждения о **форме** приложения,
а не новые фичи: (1) зависимость `ticketStore` инкапсулирована — корень приложения её не
видит, а роуты-сиблинги внутри tickets-скоупа работают; (2) composition root `buildApp(deps)`
позволяет собрать то же приложение с фейковым хранилищем — фундамент всех будущих тестов
без БД и сети (и мока OpenAI в iter 8); (3) пересборка не сдвинула контракт ни на байт —
`openapi.json` регенерируется в пустой diff. Если хоть одно не воспроизводится — это не
рефакторинг, а поломка.

Все команды выполняются из корня репо: `/Users/dd/projects/pet/deskwise-lite`.

## 1. Гейт качества

Что доказываем: после сноса `server.ts` и разноса кода по `app.ts`/`plugins/`/`routes/`
линт, строгий tsc и весь vitest-набор зелёные.

```bash
make check
```

**Ожидаемо:** Biome — `Checked 12 files ... No fixes applied`, tsc — без вывода,
vitest — `Test Files  2 passed (2)`, `Tests  10 passed (10)`.

## 2. Инкапсуляция: корень не видит `ticketStore`

Что доказываем: декоратор, зарегистрированный fp-плагином **внутри** tickets-скоупа,
хоистится ровно на один уровень и в корень не протекает — `hasDecorator` на корне отвечает
`false`. Снаружи HTTP инкапсуляцию не пощупать (это свойство внутренней структуры), поэтому
артефакт здесь — сам vitest-прогон с именем теста (вспомогательной проверкой это не
считаем: тест и есть публичная поверхность утверждения).

```bash
cd api && pnpm vitest run src/app.test.ts --reporter=verbose; cd ..
```

**Ожидаемо:** 3 passed, среди них строка
`✓ plugin encapsulation > keeps ticketStore invisible outside the tickets scope` — и рядом
`✓ openapi spec > is generated without a listening server` (swagger, наоборот, из корня
доступен — fp-плагин `@fastify/swagger` хоистится в корень намеренно).

## 3. Фейковые deps: тикет отдаётся без единого POST

Что доказываем: это и есть польза `buildApp(deps)` — тест собирает приложение с pre-seeded
`Map`, и `GET /tickets/:id` находит тикет, которого через API никто не создавал. Аналог
`dependency_overrides` FastAPI, без DI-контейнера и патчинга модулей.

```bash
cd api && pnpm vitest run src/tickets.test.ts -t "fake store" --reporter=verbose; cd ..
```

**Ожидаемо:** `✓ buildApp(deps) with a fake store > serves tickets from the injected store
without POST` — `1 passed`, остальные тесты файла — `skipped` (фильтр `-t`).

## 4. Живой сервер: роуты-сиблинги делят одно хранилище

Что доказываем: то же дерево плагинов работает в проде-режиме — POST-хендлер пишет в
декорированный store, GET-хендлер (сиблинг по скоупу) из него читает; health-роут живёт в
отдельном плагине. В отдельном терминале:

```bash
make dev
```

Затем:

```bash
curl -s localhost:3000/health | jq
id=$(curl -s -X POST localhost:3000/tickets \
  -H 'content-type: application/json' \
  -d '{"subject": "Printer jam on floor 2", "body": "The office printer keeps jamming on duplex jobs."}' | jq -r '.id')
curl -s "localhost:3000/tickets/$id" | jq
```

**Ожидаемо:** `{"status": "ok"}`; затем JSON созданного тикета с тем же `id`,
`status: "open"`, `priority: "normal"` — два разных роута увидели один store.

## 5. Контракт не сдвинулся: пустой diff спеки, эмит идемпотентен

Что доказываем: рефакторинг формы не тронул контракт — регенерация `openapi.json` через
переехавший на `buildApp` скрипт даёт пустой diff, и повторный прогон тоже (та самая
идемпотентность, которая в iter 7 станет CI-гейтом). Слушающий сервер не нужен.

```bash
make openapi
git diff --exit-code api/openapi.json && echo "DIFF EMPTY (1st run)"
make openapi
git diff --exit-code api/openapi.json && echo "DIFF EMPTY (2nd run)"
```

**Ожидаемо:** обе проверки печатают свой `DIFF EMPTY` (exit code 0).

## 6. Погасить сервер

```bash
make stop
```

**Ожидаемо:** dev-сервер остановлен, `curl -s localhost:3000/health` больше не отвечает.
