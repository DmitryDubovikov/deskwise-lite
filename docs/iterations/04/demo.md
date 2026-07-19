# Демо 04 — тикеты в настоящем Postgres через Prisma-цикл

Прогон доказывает, что API перестал быть демо-игрушкой с памятью процесса: структура БД
рождается из `schema.prisma` закоммиченными миграциями, роуты пишут в настоящий Postgres,
созданный тикет переживает рестарт сервера, а контракт API при смене хранилища не
дрейфанул ни на байт. Это фундамент под iter 5 (seed + state machine поверх реальной БД)
и iter 7 (те же миграции в CI на postgres service container). Все команды выполняются из
корня репо `/Users/dd/projects/pet/deskwise-lite`; env берётся из `api/.env` (создать
однажды: `cp api/.env.example api/.env`).

1. **Поднять Postgres.** Без живой БД весь остальной прогон бессмыслен; healthcheck
   доказывает, что это не «контейнер стартовал», а «база принимает соединения».

   ```sh
   make db-up && docker compose ps
   ```

   Ожидаемо: в таблице `docker compose ps` сервис `db` (образ `postgres:17-alpine`) со
   статусом `Up ... (healthy)` и портом `0.0.0.0:5432->5432/tcp`.

2. **Применить миграции — и убедиться, что они идемпотентны.** Это сердце Prisma-цикла:
   на чистой БД команда применяет обе закоммиченные миграции, на уже мигрированной —
   честный no-op (повторный прогон ничего не плодит).

   ```sh
   make migrate
   ```

   Ожидаемо: на уже мигрированной БД — строка `Already in sync, no schema change or
   pending migration was found.`; на чистой — список из двух применённых миграций
   (`20260719163501_init`, `20260719165211_ticket_status_index`).

3. **Показать сам артефакт миграции.** Спека правила 8: доказываем не «файл существует»,
   а «в нём лежит настоящий SQL, рождённый из schema.prisma».

   ```sh
   cat api/prisma/migrations/20260719163501_init/migration.sql
   ```

   Ожидаемо: `CREATE TYPE "TicketStatus" AS ENUM ('open', 'in_progress', 'resolved',
   'closed')`, `CREATE TYPE "TicketPriority" ...` и `CREATE TABLE "Ticket" (...)` с
   дефолтами `'open'` / `'normal'`.

4. **Запустить API** (в отдельном терминале — команда держит терминал занятым).

   ```sh
   make dev
   ```

   Ожидаемо: JSON-строка pino-лога `"Server listening at http://127.0.0.1:3000"`.

5. **Создать тикет через реальную поверхность продукта.** POST идёт через Zod-валидацию
   в хендлер, а тот — в `app.prisma.ticket.create`, то есть в живую таблицу.

   ```sh
   TICKET=$(curl -s -X POST http://localhost:3000/tickets \
     -H 'content-type: application/json' \
     -d '{"subject": "Missing items in order #4821", "body": "Two of the five stapler boxes were not in the parcel."}')
   echo "$TICKET" | jq
   TICKET_ID=$(echo "$TICKET" | jq -r .id)
   ```

   Ожидаемо: JSON тикета с uuid в `id` и дефолтами из схемы — `"status": "open"`,
   `"priority": "normal"` (эти дефолты продублированы на слое БД — шаг 3 показал их же
   в `CREATE TABLE`). `TICKET_ID` понадобится в шаге 7.

6. **Прочитать список с фильтром по статусу.** Фильтр теперь выполняет Postgres
   (`where` в `findMany`), а не JS-фильтрация по `Map`.

   ```sh
   curl -s 'http://localhost:3000/tickets?status=open' | jq
   ```

   Ожидаемо: массив, содержащий созданный тикет; тот же запрос с `status=closed` — `[]`.

7. **Доказать, что это БД, а не память процесса.** Ключевой пойнт итерации: рестартуем
   сервер — с `Map` тикет бы исчез, с Postgres обязан выжить.

   ```sh
   make stop && make dev   # make dev — снова в отдельном терминале
   curl -s "http://localhost:3000/tickets/$TICKET_ID" | jq
   ```

   Ожидаемо: тот же тикет (тот же `id`, `subject`, `status`) — данные пережили рестарт.

8. **Заглянуть в таблицу напрямую** *(вспомогательная проверка, не основной путь — API
   уже всё доказал, но для витрины полезно увидеть строку глазами).*

   ```sh
   docker compose exec db psql -U dw -d dw \
     -c "SELECT subject, status, priority FROM \"Ticket\" WHERE id = '$TICKET_ID';"
   ```

   Ожидаемо: одна строка `Missing items in order #4821 | open | normal`.

9. **Контракт не дрейфанул.** Смена хранилища не должна течь в API: регенерация спеки
   обязана дать пустой diff. Заодно это проверка, что `openapi:emit` работает без
   поднятой БД (клиент строится лениво) — но здесь гоняем при живой БД, как обычно.

   ```sh
   make openapi && git diff --exit-code api/openapi.json && echo "контракт синхронен"
   ```

   Ожидаемо: пустой diff, вывод `контракт синхронен` (exit code 0).

10. **Тесты на реальной БД — дважды.** Прогон vitest ходит в настоящий Postgres общим
    клиентом из `test-setup.ts`; повторный прогон доказывает идемпотентность
    (`beforeEach` чистит таблицу — дубли не копятся, порядок не важен).

    ```sh
    make test && make test
    ```

    Ожидаемо: оба раза `Test Files 3 passed (3)`, `Tests 16 passed (16)` — именно
    `passed`, не `skipped`.
