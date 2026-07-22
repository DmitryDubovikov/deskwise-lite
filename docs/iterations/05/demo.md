# Демо 05 — полный REST-домен: state machine, пагинация, идемпотентный seed

Прогон доказывает, что домен тикетов собран целиком и заморожен: жизненный цикл статусов
охраняется state machine (недопустимый переход — честный 409, обход через PATCH — 400),
очередь листается и фильтруется, seed наполняет базу воспроизводимо, а `openapi.json`
содержит весь этот контракт — ровно тот файл, из которого iter 6 сгенерит typed-клиент.
Это последний шанс поймать дыру в домене дёшево: после заморозки на него встают фронт,
CI-гейт и AI-эндпоинты.

Все команды выполняются из корня репо `/Users/dd/projects/pet/deskwise-lite`; env берётся
из `api/.env` (создать однажды: `cp api/.env.example api/.env`).

⚠️ `make test`/`make check` чистят таблицу тикетов перед каждым тестом (общая dev/test БД)
— после прогона тестов пересей базу `make seed`.

1. **Поднять Postgres и убедиться, что миграции — no-op.** Без живой БД прогон
   бессмыслен; повторный `migrate` на мигрированной базе обязан ничего не делать.

   ```sh
   make db-up && make migrate
   ```

   Ожидаемо: сервис `db` — `Up ... (healthy)`; migrate печатает `Already in sync, no
   schema change or pending migration was found.`

2. **Поднять API.** Все проверки домена дальше идут через реальную HTTP-поверхность,
   а не через импорт внутренних функций.

   ```sh
   make dev
   ```

   Ожидаемо (в соседнем терминале): `curl -s localhost:3000/health` → `{"status":"ok"}`.

3. **Seed: наполнить очередь.** Иначе кабинет поддержки пуст — и AI-итерациям нечего
   будет суммаризовать.

   ```sh
   make seed
   ```

   Ожидаемо: строка `Seeded 30 tickets`. Проверка через API (считаем только тикеты с
   фиксированными seed-id — демо-тикеты других шагов не мешают):

   ```sh
   curl -s 'localhost:3000/tickets?limit=100' \
     | jq '[.items[] | select(.id | startswith("00000000-0000-4000-8000-"))] | length'
   ```

   Ожидаемо: `30`.

4. **Seed идемпотентен и возвращает канон.** Это свойство, на котором держится
   воспроизводимость витрины: сколько ни прогоняй, дублей нет, а руками перекрашенный
   seed-тикет возвращается к исходному состоянию. Сначала «портим» канон разрешённым
   переходом:

   ```sh
   curl -s -X POST localhost:3000/tickets/00000000-0000-4000-8000-000000000001/transition \
     -H 'content-type: application/json' -d '{"to":"in_progress"}' | jq .status
   ```

   Ожидаемо: `"in_progress"`. Теперь повторный seed:

   ```sh
   make seed
   curl -s localhost:3000/tickets/00000000-0000-4000-8000-000000000001 | jq .status
   curl -s 'localhost:3000/tickets?limit=100' \
     | jq '[.items[] | select(.id | startswith("00000000-0000-4000-8000-"))] | length'
   ```

   Ожидаемо: снова `Seeded 30 tickets`, статус вернулся к канону `"open"`, тикетов
   по-прежнему `30` — дублей нет.

5. **Пагинация (контракт №5).** Ответ списка — envelope `{items, total, page, limit}`,
   страницы стабильны (`orderBy id`):

   ```sh
   curl -s 'localhost:3000/tickets?page=2&limit=10' \
     | jq '{total, page, limit, on_page: (.items | length)}'
   ```

   Ожидаемо: `{"total": 30, "page": 2, "limit": 10, "on_page": 10}` (total может быть
   больше, если в базе есть ручные тикеты помимо seed).

6. **Фильтр по статусу работает вместе с пагинацией.**

   ```sh
   curl -s 'localhost:3000/tickets?status=in_progress&limit=100' \
     | jq '{total, statuses: (.items | map(.status) | unique)}'
   ```

   Ожидаемо: `statuses` — ровно `["in_progress"]`, `total` — 8 (столько их в seed).

7. **State machine: недопустимый переход → 409 CONFLICT.** Тикет #1 после шага 4 снова
   `open`, а `open → closed` матрица запрещает — нельзя закрыть необработанное обращение:

   ```sh
   curl -si -X POST localhost:3000/tickets/00000000-0000-4000-8000-000000000001/transition \
     -H 'content-type: application/json' -d '{"to":"closed"}' | grep -E 'HTTP|error'
   ```

   Ожидаемо: `HTTP/1.1 409 Conflict` и envelope
   `{"error":{"code":"CONFLICT","message":"Cannot transition ticket from 'open' to 'closed'"}}`.

8. **Полный жизненный цикл + reopen — на свежем тикете** (seed-канон не трогаем):

   ```sh
   ID=$(curl -s -X POST localhost:3000/tickets -H 'content-type: application/json' \
     -d '{"subject":"Demo ticket","body":"Walk the lifecycle."}' | jq -r .id)
   for to in in_progress resolved in_progress resolved closed; do
     curl -s -X POST "localhost:3000/tickets/$ID/transition" \
       -H 'content-type: application/json' -d "{\"to\":\"$to\"}" | jq -c '{status, error}'
   done
   ```

   Ожидаемо: пять строк со статусами `in_progress → resolved → in_progress` (это reopen)
   `→ resolved → closed`, поле `error` везде `null`.

9. **PATCH строгий: `status` в теле → 400, легальное поле → 200.** Это защита state
   machine от обхода — статус не меняется мимо `/transition` даже «случайно»:

   ```sh
   curl -si -X PATCH "localhost:3000/tickets/$ID" -H 'content-type: application/json' \
     -d '{"status":"open"}' | grep -E 'HTTP|error'
   curl -s -X PATCH "localhost:3000/tickets/$ID" -H 'content-type: application/json' \
     -d '{"priority":"high"}' | jq -c '{status, priority}'
   ```

   Ожидаемо: первый вызов — `HTTP/1.1 400 Bad Request` с
   `{"error":{"code":"VALIDATION_ERROR",...}}`; второй — `{"status":"closed","priority":"high"}`.

10. **DELETE → 204, повторный GET → 404.** Демо-тикет заодно убираем за собой:

    ```sh
    curl -s -o /dev/null -w '%{http_code}\n' -X DELETE "localhost:3000/tickets/$ID"
    curl -s "localhost:3000/tickets/$ID" | jq -c .error
    ```

    Ожидаемо: `204`, затем `{"code":"NOT_FOUND","message":"Ticket not found"}`.

11. **Контракт синхронен и содержит весь домен.** Регенерация обязана дать пустой diff —
    иначе закоммиченная спека врёт (именно это в iter 7 станет CI-гейтом):

    ```sh
    make openapi && git diff --exit-code api/openapi.json && echo "spec in sync"
    ```

    Ожидаемо: `spec in sync`. (Если итерация ещё не закоммичена, `git diff` сравнивает с
    HEAD и честно непуст — тогда эквивалентная проверка: два прогона `make openapi`
    подряд дают одинаковый `shasum -a 256 api/openapi.json`.) И сам артефакт — полный домен с 409 на transition и чистым
    204 у DELETE (без псевдо-content, который сломал бы Orval):

    ```sh
    jq '.paths | keys' api/openapi.json
    jq '.paths["/tickets/{id}/transition"].post.responses | keys' api/openapi.json
    jq '.paths["/tickets/{id}"].delete.responses["204"]' api/openapi.json
    ```

    Ожидаемо: пути `["/health","/tickets","/tickets/{id}","/tickets/{id}/transition"]`;
    коды transition `["200","400","404","409","500"]`; у 204 — только
    `{"description":"Default Response"}`, ключа `content` нет.

12. **Точечные тесты итерации** (матрица — unit без БД, домен — inject-тесты на реальной
    БД; сеть и OpenAI не нужны):

    ```sh
    cd api && pnpm vitest run src/domain/ticket-status.test.ts src/tickets.test.ts
    ```

    Ожидаемо: оба файла зелёные (34 теста), скипов нет.

13. **Прибраться.** Dev-сервер больше не нужен:

    ```sh
    make stop
    ```
