# Итерация 07 — CI contract-drift gate: рассинхрон контракта краснит PR

> 🎯 Тот же инженерный стандарт, другой рантайм. Existence-gate, не accuracy-gate.

## Зачем это (продукт и ценность)

Продукт deskwise-lite — мини-кабинет поддержки Fernwood Supplies: агент видит очередь
тикетов, ведёт каждый по жизненному циклу статусов и получает AI-резюме и черновик ответа —
вместо ручного разбора почтового ящика. Для команды поддержки эта итерация ничего видимого
не меняет — она страхует то, что уже работает. Инженерная ценность в другом: до сих пор
главное свойство проекта — «фронт не может рассинхронизироваться с бэком» — держалось на
дисциплине разработчика (не забыть прогнать `make generate` после правки схемы). Теперь оно
держится на машине: любой pull request, в котором Zod-схема уехала, а закоммиченный
контракт — нет, физически не мёржится, потому что CI сам регенерирует контракт, видит
расхождение и краснеет. Пользователь Fernwood Supplies никогда не увидит фронт, собранный
против устаревшего API.

## 🧵 Что это дало резюме

Стал демонстрируемым пункт north-star **«CI contract-drift gate»**: GitHub Actions
(`.github/workflows/ci.yml`) на каждый PR и push в `main` гонит линт+типы+vitest на
реальном Postgres (service container), регенерирует `api/openapi.json` и Orval-клиент и
требует `git diff --exit-code`; три джобы закреплены как required status checks в branch
protection на `main`. Артефакт-доказательство — красный PR с правкой Zod-схемы без
регенерации (шаг 6 демо).

## TL;DR (простыми словами)

Было: контракт-пайплайн `Zod → openapi.json → Orval → tsc` существовал, но «пустой diff
после регенерации» проверялся руками — забыл прогнать `make generate`, закоммитил — и
никто не заметит до красной компиляции у коллеги. Стало: GitHub Actions на каждом PR
повторяет ровно те же команды разработчика (`pnpm check` в обоих пакетах,
`make generate`) и падает, если регенерация дала непустой diff. Добавились два кусочка:
workflow с тремя джобами (`api`, `web`, `contract-drift`) и branch protection, которая
делает эти джобы обязательными для мёржа.

## Что это за техника

- **Contract-drift gate** — CI-джоба, которая воспроизводит закоммиченный сгенерённый
  артефакт и падает, если результат разошёлся с тем, что в git. Питоний аналог из семьи —
  eval-gate CI triagewise/authwise (джоба воспроизводит артефакт и краснеет на
  расхождении); из общего Python-мира — проверка «`pip-compile` не меняет
  `requirements.txt`» или `alembic check` в CI. Здесь гейт — механическая замена
  shared-типам (правило 5): у api и web нет общего пакета, контракт течёт только через
  `openapi.json`, и именно поэтому его синхронность обязана проверяться машиной.
- **Required status checks + branch protection** — настройка GitHub, которая запрещает
  мёрдж в `main`, пока названные джобы не зелёные. Аналогия — «обязательные проверки» в
  GitLab MR; в Python-сиблингах то же самое делал required-джобой eval-gate. Термины:
  *context* (имя джобы, каким его видит protection — у нас `api`, `web`,
  `contract-drift`), *strict mode* (требовать ветку, догнанную до `main`, — у нас
  выключен), *enforce_admins* (распространять запрет на владельца — выключен, чтобы
  рабочий цикл семьи «прямой push в main» остался жив).
- **Service container** — контейнер-сосед джобы GitHub Actions: тот же `postgres:17-alpine`
  с теми же кредами, что сервис `db` в `docker-compose.yml`, поднимается на время джобы и
  умирает с ней. Питоний аналог — точно такой же postgres service в CI сиблингов; решение
  №5 (Postgres везде, SQLite нигде) дотянуто до CI: vitest и в CI ходит в реальную БД.

## Почему коммитим сгенерённое

Обычный рефлекс — «сгенерённое в git не кладут» (как `__pycache__` или собранный dist).
Здесь ровно наоборот, и это осознанный дизайн: `api/openapi.json` и `web/src/generated/`
закоммичены, потому что они — **граница контракта, а не побочный продукт сборки**.
Три причины. Во-первых, ревью: в диффе PR видно, как правка Zod-схемы изменила публичный
контракт и сгенерённый клиент, — контракт ревьюится как код. Во-вторых, сборка `web/` не
зависит от запуска `api/`: Orval читает файл, а не URL (контракт №3), поэтому фронт
собирается из чистого чекаута без живого бэка. В-третьих — сам гейт: «регенерируй и сравни
с закоммиченным» возможен только когда закоммиченное существует; незакоммиченный артефакт
нечем дифать, и рассинхрон нечем ловить. Плата — сгенерённые файлы в диффах; принята.

## Поток данных

Триггер — разработчик открывает pull request (или пушит в `main`). GitHub видит событие,
читает `.github/workflows/ci.yml` и запускает три независимые джобы. Чтобы вердикт CI
совпадал с локальным, джобы не изобретают своих команд, а зеркалят Makefile и
`package.json`: состав проверок живёт в `pnpm check` и `make generate`, CI их только
вызывает.

Джоба **`api`** отвечает на вопрос «бэк здоров?»: ей нужен реальный Postgres (vitest ходит
в БД — решение №5), поэтому она поднимает service container, гонит
`prisma migrate deploy`, а затем `pnpm check` (biome → tsc → vitest). Джоба **`web`**
отвечает «фронт синхронен контракту?»: закоммиченный Orval-клиент уже в чекауте, так что
достаточно `pnpm check` (biome → tsc) — БД не нужна. Джоба **`contract-drift`** отвечает
на новый вопрос итерации — «а сам закоммиченный контракт не протух?»: она запускает
`make generate` (регенерация `openapi.json` → Orval-клиент, тот же пайплайн, что у
разработчика) и требует, чтобы регенерированное побайтно совпало с закоммиченным.
Сравнение — `git add -A` по двум путям и `git diff --cached --exit-code`: через индекс,
потому что обычный `git diff` не видит новые (untracked) файлы, а Orval с `clean: true`
умеет и создавать, и удалять их.

```
PR / push в main
      │  GitHub Actions читает .github/workflows/ci.yml
      ├──────────────┬──────────────────┐
      ▼              ▼                  ▼
  джоба api      джоба web       джоба contract-drift
  postgres:17    pnpm install    pnpm install (api и web)
  service        pnpm check      make generate
  migrate deploy (biome+tsc)        │ регенерит openapi.json + web/src/generated
  pnpm check                        ▼
  (biome+tsc+vitest)             git add -A api/openapi.json web/src/generated
      │              │           git diff --cached --exit-code
      │              │              │  пустой diff → зелёный; иначе → красный
      ▼              ▼              ▼
   branch protection на main: все три — required status checks → мёрдж только зелёным
```

| Инструмент | Что делает | Куда пишет |
|---|---|---|
| джоба `api` (`ci.yml`, postgres service) | `prisma migrate deploy` + `pnpm check` (biome, tsc, vitest на реальной БД) | никуда — красный/зелёный контекст `api` |
| джоба `web` (`ci.yml`) | `pnpm check` (biome, tsc против закоммиченного Orval-клиента) | контекст `web` |
| джоба `contract-drift` (`ci.yml`) | `make generate` + `git diff --cached --exit-code` по `api/openapi.json` и `web/src/generated` | контекст `contract-drift` |
| branch protection (`gh api`, команда в `specs/07/spec.md`) | делает три контекста обязательными для мёржа в `main` | настройка репо на GitHub |

Честные оговорки — чего в этой итерации НЕТ: **Docker-образы в CI не собираются** (вне
scope — типы web и так проверяет джоба `web`); **coverage-отчётов и dependabot нет**;
**прямой push владельца в `main` гейт не блокирует** (`enforce_admins` выключен осознанно —
рабочий цикл семьи), гейт обязателен для PR; сам workflow попадает в git коммитом этой
итерации, поэтому **первый живой прогон CI случится только после push** — до этого гейт
проверен локальной симуляцией тех же команд (шаги 1–3 демо) и красным демо-PR после
коммита (шаг 6).

## Карта «где в коде»

Номера строк — ориентир на момент итерации; надёжнее искать по именам символов.

1. **Workflow целиком** — `.github/workflows/ci.yml:7` (`name: CI`), триггеры `on:
   pull_request` + `push` в `main` (`:9`). Шапка-комментарий фиксирует принцип: CI зеркалит
   Makefile (`make check` / `make generate`), а не изобретает свои команды, — состав
   проверок живёт в одном месте (`package.json` → `check`), и локальный зелёный совпадает с
   зелёным CI.

2. **Отмена устаревших прогонов — только для PR** — блок `concurrency` в
   `.github/workflows/ci.yml:16`. Новый push в PR отменяет прошлый прогон (экономия
   минут), но на `main` каждый коммит получает полный вердикт — история статусов ветки не
   дырявится «cancelled».

   ```yaml
   concurrency:
     group: ${{ github.workflow }}-${{ github.ref }}
     cancel-in-progress: ${{ github.event_name == 'pull_request' }}
   ```

3. **Джоба `api` с postgres service container** — `.github/workflows/ci.yml:21`. Сервис
   (`:28`) повторяет `db` из `docker-compose.yml` (image/креды/healthcheck — комментарий
   требует держать их в синхроне), `DW_DATABASE_URL` (`:42`) указывает на него. Миграция
   идёт до проверок (`:56`) — vitest ходит в реальный Postgres; сами проверки — одной
   строкой `pnpm check`, их состав CI не дублирует.

   ```yaml
   services:
     postgres:
       image: postgres:17-alpine
       env: { POSTGRES_USER: dw, POSTGRES_PASSWORD: dw, POSTGRES_DB: dw }
       # … healthcheck pg_isready
   steps:
     # … checkout, pnpm, node
     - run: pnpm exec prisma migrate deploy
     - run: pnpm check
   ```

4. **Джоба `web`** — `.github/workflows/ci.yml:59`. Симметрична api, но без БД:
   `pnpm install --frozen-lockfile` + `pnpm check` (biome + tsc). Ключевая деталь — tsc
   проверяет UI против **закоммиченного** Orval-клиента: это вход drift-гейта, поэтому
   джобе не нужен ни запуск api, ни регенерация.

5. **Джоба `contract-drift` — сам гейт** — `.github/workflows/ci.yml:77`. Env-заглушка
   `DW_DATABASE_URL` (`:83`) нужна, потому что `openapi:emit` собирает `buildApp()`, а
   config-модуль требует непустой URL, — но Prisma-клиент ленив, соединения не происходит.
   Дальше `make generate` (`:103`) — тот же пайплайн, что у разработчика, — и проверка
   через индекс (`:108`): `git add -A` по двум путям ловит и новые/удалённые файлы,
   которых обычный `git diff` не видит.

   ```yaml
   - run: make generate
   - name: contract drift check
     run: |
       git add -A api/openapi.json web/src/generated
       git diff --cached --exit-code
   ```

6. **Один pnpm на оба пакета** — `pnpm/action-setup@v4` с
   `package_json_file: api/package.json` (`.github/workflows/ci.yml:45`, `:86`) читает пин
   `packageManager: "pnpm@11.13.1"` (одинаковый в `api/package.json` и
   `web/package.json`); `setup-node` кэширует pnpm-store по lockfile'ам — в
   `contract-drift` по обоим сразу (`:95`).

7. **Branch protection — применена и воспроизводима** — команда в `specs/07/spec.md:50`:
   `gh api -X PUT repos/DmitryDubovikov/deskwise-lite/branches/main/protection` с
   `required_status_checks.contexts = ["api", "web", "contract-drift"]`,
   `enforce_admins: false` (прямой push владельца жив), `strict: false` (не требуем ветку,
   догнанную до main). Проверка текущего состояния — read-only `gh api` (шаг 4 демо).

8. **Вход гейта — цель `generate`** — `Makefile:47` (не менялась в этой итерации, но
   стала исполняемым контрактом CI): `make generate` = `pnpm openapi:emit` в `api/` +
   `pnpm generate:api` (Orval) в `web/`. Именно поэтому «CI зеркалит Makefile» — не
   метафора: джоба вызывает ту же цель.
