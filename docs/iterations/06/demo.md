# Демо 06 — фронт-пайплайн: typed-клиент из спеки, герой-tsc, полный стек за nginx

Прогон доказывает **героя проекта — end-to-end type safety**: типы фронта рождаются из
`api/openapi.json` (Orval), поэтому правка Zod-схемы на бэке ломает компиляцию `web/` —
рассинхрон контракта ловит компилятор, а не пользователь. Заодно проверяем полный стек за
nginx (`:8080`: статика SPA + прокси `/api/`) и то, что регенерация контракт-пайплайна
идемпотентна — это фундамент CI drift-gate следующей итерации. Все команды запускаются из
корня репо: `/Users/dd/projects/pet/deskwise-lite`.

## 1. Полный стек одной командой

Это первый раз, когда проект поднимается целиком как продукт (nginx + api + Postgres) —
без этого агенту поддержки некуда зайти.

```bash
make up
docker compose ps
```

**Ожидаемо:** три сервиса — `db` (`healthy`), `api`, `web` (`0.0.0.0:8080->8080`).
Контейнер api на старте сам гонит `prisma migrate deploy` (идемпотентно). Повторный
`make up` — no-op: в выводе `Running`, а не `Recreated` (для этого `make up` отключает
provenance-аттестации BuildKit — см. learnings).

Если БД свежая или тесты подчистили данные (vitest-прогоны вычищают таблицу тикетов) — верни сид:

```bash
make seed
```

**Ожидаемо:** `Seeded 30 tickets`; повторный `make seed` — снова ровно 30 (upsert по
фиксированным id, дублей нет).

## 2. SPA и прокси через реальную поверхность

Проверяем обе роли nginx с публичной стороны (`:8080`), а не по внутренностям контейнеров:
и статика, и срез префикса `/api/` — контракт №6.

```bash
curl -s localhost:8080/ | grep -o "<title>[^<]*</title>"
curl -s "localhost:8080/api/tickets?page=1&limit=3" | jq '{total, page, limit, first: .items[0].subject}'
```

**Ожидаемо:** первая команда печатает `<title>` SPA (Deskwise/Fernwood); вторая — JSON
пагинации контракта №5: `total` ~30 (seed), `page: 1`, `limit: 3` и subject первого тикета.

## 3. Регенерация контракта идемпотентна

Стабильность регенерации — это ровно то, что в iter 7 станет красным CI-гейтом
(`git diff --exit-code` после регенерации). Здесь проверяем её двойным прогоном с хэшем
содержимого — эта форма работает и до коммита итерации, когда diff против HEAD ещё непуст:

```bash
make generate
H1=$(find api/openapi.json web/src/generated -type f | sort | xargs shasum | shasum)
make generate
H2=$(find api/openapi.json web/src/generated -type f | sort | xargs shasum | shasum)
[ "$H1" = "$H2" ] && echo REGEN-IDEMPOTENT
```

**Ожидаемо:** Orval оба раза перегенерил `web/src/generated/` с нуля (`clean: true`), но
содержимое побайтно совпало — печатается `REGEN-IDEMPOTENT`. После коммита итерации то же
самое короче: `make generate && git diff --exit-code api/openapi.json web/src/generated` —
именно эту форму будет гонять CI iter 7.

## 4. Показать сам контракт, а не только его существование

Смысл `.meta({id})` + `jsonSchemaTransformObject` — именованные схемы в
`components/schemas` и `$ref` на них; без этого Orval генерил бы безымянные инлайн-типы.

```bash
jq '.components.schemas | keys' api/openapi.json
jq '.paths."/tickets".get | {operationId, ref: .responses."200".content."application/json".schema}' api/openapi.json
grep -n "priority" web/src/generated/schemas/ticket.ts
```

**Ожидаемо:** ключи `Ticket`, `TicketList`, `ErrorResponse`, `TransitionRequest`, … ;
у `listTickets` ответ — `$ref` на `#/components/schemas/TicketList`; сгенерённый тип
`Ticket` содержит поле `priority: TicketPriority` — тип фронта, рождённый из Zod-схемы.

## 5. Герой-демо: правка Zod-схемы валит tsc фронта

Это и есть end-to-end type safety: переименуем поле `priority` → `urgency` в `TicketSchema`
на бэке, прогоним пайплайн — и сам компилятор фронта обязан отказаться собирать UI,
который читает `ticket.priority`.

```bash
perl -0pi -e 's/priority: TicketPrioritySchema,/urgency: TicketPrioritySchema,/' api/src/schemas/ticket.ts
make generate
cd web && pnpm typecheck; cd ..
```

**Ожидаемо:** `tsc` падает (exit ≠ 0) с ошибками вида
`Property 'priority' does not exist on type 'Ticket'` в `TicketList.tsx` и
`TicketDetail.tsx` — покажи сам текст ошибки, это артефакт героя.

Откат (обязательно — домен заморожен, правка временная). Обратным perl'ом, а не
`git checkout`: до коммита итерации checkout откатил бы файл к прошлой итерации и снёс бы
незакоммиченную работу (после коммита `git checkout -- api/src/schemas/ticket.ts` тоже
годится):

```bash
perl -0pi -e 's/urgency: TicketPrioritySchema,/priority: TicketPrioritySchema,/' api/src/schemas/ticket.ts
make generate
cd web && pnpm typecheck && cd .. && echo WEB-GREEN
```

**Ожидаемо:** `WEB-GREEN` — контракт и фронт вернулись в синхрон (`grep -c urgency
api/src/schemas/ticket.ts` печатает `0`).

## 6. State machine видна через публичную поверхность

UI показывает кнопки всех статусов и не дублирует матрицу переходов — 409 приходит из
домена api. Проверяем тот самый ответ, который увидит компонент, — через nginx.

```bash
ID=$(curl -s "localhost:8080/api/tickets?status=open&limit=1" | jq -r '.items[0].id')
curl -si -X POST "localhost:8080/api/tickets/$ID/transition" -H 'content-type: application/json' -d '{"to":"closed"}' | head -1
curl -s -X POST "localhost:8080/api/tickets/$ID/transition" -H 'content-type: application/json' -d '{"to":"closed"}' | jq .
```

**Ожидаемо:** статус `409 Conflict`; тело — envelope контракта №2:
`{"error":{"code":"CONFLICT","message":"Cannot transition ticket from 'open' to 'closed'"}}`.
Именно `error.message` из этого envelope компонент `TicketDetail` рендерит под кнопками.

## 7. UI глазами (витрина, не доказательство)

Открой `http://localhost:8080` в браузере: список тикетов с фильтром по статусу и
пагинацией (стрелки, `page N / M`), клик по тикету открывает деталь, кнопки `→ status`
переводят статус (список и деталь обновляются сами — инвалидация react-query), а
недопустимый переход показывает красный текст 409 из envelope.
