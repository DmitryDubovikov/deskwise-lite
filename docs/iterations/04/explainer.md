# Итерация 04 — Prisma-цикл: schema.prisma, миграции, генерённый клиент

> 🎯 Тикеты переехали из in-memory `Map` в настоящий PostgreSQL: появился весь Prisma-цикл —
> декларативная `schema.prisma` с enum'ами домена, закоммиченные SQL-миграции, генерённый
> типизированный клиент — и Postgres в docker-compose. Клиент входит в приложение тем же
> швом, что и прежний store: fastify-plugin-обёртка декорирует `app.prisma` внутри
> tickets-скоупа, а `onClose` гасит соединения. Контракт API при этом не изменился ни на
> байт — `openapi.json` дал пустой diff.

## Зачем это (продукт и ценность)

Продукт deskwise-lite — мини-кабинет поддержки Fernwood Supplies: агент видит очередь
тикетов, ведёт каждый тикет по жизненному циклу статусов и получает AI-резюме и черновик
ответа — вместо ручного разбора почтового ящика. Бизнесу это ценно дважды: команда
поддержки получает управляемый поток обращений, а инженерная команда — контракт, при
котором фронт физически не может рассинхронизироваться с бэком. До этой итерации у
кабинета была неприятная особенность: любой перезапуск сервера стирал все тикеты — очередь
жила в памяти процесса. Теперь тикеты лежат в настоящей базе: агент может создать
обращение сегодня и найти его завтра, после любого деплоя и рестарта. Это тот кусочек,
без которого «система учёта тикетов» была бы демо-декорацией, а не системой учёта.

## 🧵 Что это дало резюме

Строки **Prisma** и **PostgreSQL** из стек-строки north-star стали демонстрируемыми.
Артефакты-доказательства: `api/prisma/schema.prisma` с enum'ами `TicketStatus`/
`TicketPriority`, закоммиченные SQL-миграции в `api/prisma/migrations/`, и живые
CRUD-роуты, которые читают и пишут реальную БД (тикет переживает рестарт сервера — `Map`
такого не умел).

## TL;DR (простыми словами)

Было: тикеты хранились в `Map` внутри процесса — рестарт сервера обнулял всё. Стало:
в docker-compose живёт Postgres, структура таблицы описана в `schema.prisma`, из неё
сгенерированы и SQL-миграции (закоммичены), и типизированный клиент (генерится при
`pnpm install`, в git не попадает). Роуты вместо `Map` зовут `app.prisma.ticket.*`, тесты
гоняются на реальной БД и чистят таблицу перед каждым тестом. Добавили четыре кусочка:
`docker-compose.yml`, папку `api/prisma/`, плагин `src/plugins/prisma.ts` вместо
`ticket-store.ts` и общий тестовый клиент в `src/test-setup.ts`.

## Что это за техника

- **Prisma-цикл ≈ SQLAlchemy + Alembic.** Prisma — это ORM-тулкит из трёх частей вокруг
  одного файла `schema.prisma`: файл декларативно описывает модели и enum'ы (аналог
  declarative-моделей SQLAlchemy), команда `prisma migrate dev` сравнивает его с БД и
  генерит+применяет SQL-миграцию (аналог `alembic revision --autogenerate` +
  `alembic upgrade head` одной командой), а `prisma generate` генерит из того же файла
  типизированный клиент. Ключевое отличие от Python-мира: единственный источник истины —
  не код на языке приложения, а отдельный DSL-файл; и модели, и миграции, и типы клиента
  рождаются из него.

- **Генерённый клиент ≈ типизированная `Session`.** `PrismaClient` — это объект с
  методами `prisma.ticket.create/findMany/findUnique(...)`, у которых аргументы и
  результаты типизированы строго по схеме — опечатка в имени поля ловится компилятором,
  как в запросах через SQLAlchemy 2.0 с typed-моделями. Но в отличие от SQLAlchemy этот
  код — **артефакт сборки**: он лежит в `api/src/generated/prisma/`, в git не коммитится
  и пересоздаётся хуком `postinstall` при каждом `pnpm install`.

- **Driver adapter (`@prisma/adapter-pg`).** Начиная с Prisma 7 клиент ходит в БД не
  через встроенный бинарный движок, а через обычный JS-драйвер — адаптер `PrismaPg`
  оборачивает штатный pg-пул. Для нас это одна строка при создании клиента:
  `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })` — аналог того, как
  SQLAlchemy подключается через DBAPI-драйвер (psycopg).

- **`prisma.config.ts` — конфиг CLI, не приложения.** Команды `prisma migrate/generate`
  работают вне рантайма приложения и не проходят через `buildApp`, поэтому URL базы для
  них задаётся отдельным конфигом в корне `api/`. Это задокументированное исключение из
  правила 6 («env читается только в config-модуле») — второе место, где читается
  `DW_DATABASE_URL`, существует только для CLI.

- **`fastify-plugin` (fp) — «сними инкапсуляцию ровно на один уровень».** По умолчанию
  декоратор, объявленный внутри плагина, виден только самому плагину и его детям — как
  переменная внутри функции. Обёртка `fp()` убирает барьер самого плагина: декоратор
  ложится в тот контекст, **где плагин зарегистрировали**. Мы регистрируем `prismaPlugin`
  внутри tickets-скоупа — поэтому `app.prisma` виден роутам-сиблингам в этом скоупе, но
  не корню приложения (тест на инкапсуляцию держится ровно за это).

## Поток данных

Здесь два разных потока: dev-time цикл миграций (запускается разработчиком при изменении
схемы) и runtime-путь запроса (запускается каждым HTTP-запросом агента).

**Dev-time.** Разработчик поменял `prisma/schema.prisma` (или клонировал репо на чистую
машину) и хочет, чтобы БД и типы клиента соответствовали схеме. Для этого он запускает
`make migrate` (`prisma migrate dev`): команда сверяет схему с БД, генерит недостающий
SQL и применяет его; сгенерённый SQL коммитится — это история изменений БД, как папка
`versions/` у Alembic. Типизированный клиент из той же схемы пересоздаёт `prisma generate`
— руками его звать почти не приходится, он висит на `postinstall`:

```
api/prisma/schema.prisma  (модель Ticket + enum'ы — источник истины)
        │
        ├──(make migrate → prisma migrate dev)──► api/prisma/migrations/NN_*.sql ── в git
        │                                                  │ применяются
        │                                                  ▼
        │                                        Postgres (compose-сервис db, том db-data)
        │
        └──(prisma generate, хук postinstall)──► api/src/generated/prisma/ ── вне git
                                                 (типизированный PrismaClient)
```

**Runtime.** Агент поддержки (пока — `curl`) POST-ит тикет. Чтобы записать его в БД,
хендлеру нужен клиент — он берёт его из декоратора `app.prisma`, который положил туда
`prismaPlugin` при сборке приложения:

```
curl POST /tickets ──► Fastify: Zod-валидация body ──► хендлер (routes/tickets.ts)
                                                             │
                                                   app.prisma.ticket.create({data})
                                                             │
                                    PrismaClient ──► PrismaPg-адаптер (pg-пул) ── SQL INSERT
                                                             │
                                                             ▼
                                              Postgres ── строка в таблице "Ticket"
```

Сам клиент рождается в composition root: `buildApp(deps)` берёт `deps.prisma`, если его
передали (тесты передают общий клиент из `test-setup.ts`, фейковые тесты — заглушку), а
без него лениво строит настоящий из `loadConfig().databaseUrl` — поэтому `openapi:emit`
собирает приложение и пишет спеку, не требуя поднятой БД, а `src/index.ts` не изменился
вовсе. При остановке приложения хук `onClose` зовёт `$disconnect()` — pg-пул закрывается
штатно.

| Инструмент | Что делает | Куда пишет |
|---|---|---|
| docker compose (сервис `db`) | поднимает `postgres:17-alpine` с healthcheck | именованный том `db-data` |
| `prisma migrate dev` (`make migrate`) | сверяет `schema.prisma` с БД, генерит и применяет SQL | `api/prisma/migrations/` (git) + БД |
| `prisma generate` (хук `postinstall`) | генерит типизированный клиент из схемы | `api/src/generated/prisma/` (вне git) |
| `prismaPlugin` (`src/plugins/prisma.ts`) | кладёт клиент декоратором `app.prisma` в tickets-скоуп, вешает `onClose → $disconnect()` | декоратор Fastify |
| `buildApp(deps)` (`src/app.ts`) | берёт `deps.prisma` или лениво строит клиент из `loadConfig().databaseUrl` | дерево плагинов |
| `test-setup.ts` | один клиент/pg-пул на весь прогон vitest, `beforeEach` чистит таблицу | таблица `Ticket` |

Честные оговорки — чего в этой итерации **нет**: роуты не расширялись — фильтры,
пагинация, transition-эндпоинт и seed придут в iter 5 (state machine пока не живёт даже
в БД — колонка `status` есть, а переходы никто не проверяет); сервис `api` в compose не
добавлен — там пока только `db`, полная оркестрация с nginx — iter 6; CI по-прежнему без
postgres service container — iter 7; `openapi.json` не изменился вообще — для контракта
эта итерация невидима, и это осознанно (смена хранилища не должна течь в API).

## Карта «где в коде»

Номера строк — ориентир на момент итерации; надёжнее искать по именам символов.

1. **Схема БД** — `api/prisma/schema.prisma:10-31`. Декларативная модель домена: два
   enum'а и модель `Ticket`, поля 1:1 с Zod-схемой `TicketSchema` (но это два независимых
   описания — правило 5 запрещает генерить одно из другого, контракт API и схема хранения
   обязаны уметь расходиться). Дефолты `open`/`normal` совпадают с дефолтами Zod-схемы,
   поэтому POST без статуса даёт одинаковый результат на обоих слоях. Индекс по `status`
   заведён отдельной миграцией под фильтр `?status=` из iter 5.

   ```prisma
   model Ticket {
     id       String         @id @default(uuid())
     subject  String
     body     String
     status   TicketStatus   @default(open)
     priority TicketPriority @default(normal)

     @@index([status])
   }
   ```

   Рядом — закоммиченные миграции `api/prisma/migrations/20260719163501_init/` (CREATE
   TYPE + CREATE TABLE) и `20260719165211_ticket_status_index/` (CREATE INDEX).

2. **Плагин-обёртка клиента** — `api/src/plugins/prisma.ts:16-24`, экспорт `prismaPlugin`
   (замена удалённого `ticket-store.ts`). Плагин получает готовый клиент опцией,
   декорирует им инстанс и вешает graceful shutdown; `fp()` поднимает декоратор ровно в
   тот скоуп, где плагин зарегистрирован. Заодно `declare module "fastify"` учит
   TypeScript, что у инстанса есть `app.prisma` типа `PrismaClient`.

   ```ts
   export const prismaPlugin = fp<PrismaPluginOptions>(
     async (app, opts) => {
       app.decorate("prisma", opts.prisma);
       app.addHook("onClose", async () => {
         await opts.prisma.$disconnect();
       });
     },
     { name: "prisma" },
   );
   ```

3. **Composition root** — `api/src/app.ts:84-93` (tickets-скоуп) и `api/src/app.ts:19-23`
   (`AppDeps`). Поле `deps.ticketStore` заменилось на `deps.prisma?: PrismaClient`;
   внутри инкапсулированного скоупа регистрируются `prismaPlugin` и `ticketRoutes` —
   поэтому корень приложения про `prisma` не знает (`app.hasDecorator("prisma")` на корне
   — `false`). Дефолт строится лениво из config-модуля, так что без явных deps приложение
   само подключается к БД из `DW_DATABASE_URL`.

   ```ts
   await app.register(async (tickets) => {
     await tickets.register(prismaPlugin, {
       prisma:
         deps.prisma ??
         new PrismaClient({
           adapter: new PrismaPg({ connectionString: loadConfig().databaseUrl }),
         }),
     });
     await tickets.register(ticketRoutes);
   });
   ```

4. **Роуты поверх БД** — `api/src/routes/tickets.ts:24,40,59`. Три вызова `Map`
   превратились в три вызова клиента — `create` / `findMany` / `findUnique`; Zod-схемы
   роутов не тронуты, поэтому контракт не дрейфанул. Фильтр по статусу переехал из
   JS-фильтрации в `where` — теперь его выполняет Postgres.

   ```ts
   const ticket = await app.prisma.ticket.create({ data: request.body });
   // ...
   return app.prisma.ticket.findMany({ where: status ? { status } : undefined });
   // ...
   const ticket = await app.prisma.ticket.findUnique({ where: { id: request.params.id } });
   ```

5. **Конфиг CLI** — `api/prisma.config.ts:7-15`. Prisma CLI (migrate/generate) работает
   вне `buildApp`, поэтому URL базы он берёт из этого файла; `import "dotenv/config"`
   наполняет `process.env` из `api/.env`. Это задокументированное исключение из правила 6.
   В самом `schema.prisma` блок `datasource` остался без `url` — раньше там жил
   `env("...")`, теперь источник один, этот конфиг.

   ```ts
   export default defineConfig({
     schema: "prisma/schema.prisma",
     migrations: { path: "prisma/migrations" },
     datasource: { url: process.env.DW_DATABASE_URL },
   });
   ```

6. **Общий тестовый клиент** — `api/src/test-setup.ts:10-20` и
   `api/vitest.config.ts:3-10`. Setup-файл создаёт один `PrismaClient` (один pg-пул) на
   весь прогон — тесты импортируют его и передают в `buildApp({ prisma })`, вместо того
   чтобы плодить пул на каждый вызов фабрики. `beforeEach` чистит таблицу — прогоны
   идемпотентны и не зависят от порядка; `afterAll` закрывает пул. Раз все файлы делят
   одну таблицу, `fileParallelism: false` выключает параллельный прогон файлов — иначе
   они гонялись бы за одни строки.

   ```ts
   export const prisma = new PrismaClient({
     adapter: new PrismaPg({ connectionString: loadConfig().databaseUrl }),
   });

   beforeEach(async () => {
     await prisma.ticket.deleteMany();
   });
   ```

7. **Тест инкапсуляции и фейковый клиент** — `api/src/app.test.ts:16-23` и
   `api/src/tickets.test.ts:106-131`. Первый проверяет, что `prisma` не виден на корне
   приложения (то же утверждение, что раньше держал `ticketStore`). Второй показывает шов
   `buildApp(deps)` в действии: вместо настоящего клиента подсовывается объект с одним
   методом `ticket.findUnique`, и `GET /tickets/:id` отвечает из него — ни БД, ни сети.
   По этому же шву в iter 8 войдёт фейковый OpenAI-клиент.

   ```ts
   const fakePrisma = {
     ticket: {
       findUnique: async ({ where }) => (where.id === ticket.id ? ticket : null),
     },
   } as unknown as PrismaClient;
   const app = await buildApp({ prisma: fakePrisma });
   ```

8. **Инфраструктура** — `docker-compose.yml:1-19` в корне репо (сервис `db`:
   `postgres:17-alpine`, healthcheck `pg_isready`, том `db-data`; api/web-сервисы придут
   в iter 6), `Makefile:7-14` (цели `db-up` / `db-down` / `migrate`),
   `api/.env.example:5` (`DW_DATABASE_URL=postgresql://dw:dw@localhost:5432/dw`),
   `api/src/config.ts:11` (обязательная `DW_DATABASE_URL` в схеме конфига). В
   `api/package.json:11-12` — хук `postinstall: prisma generate` и скрипт `db:migrate`;
   в `api/.gitignore` добавлены `.env` и `/src/generated/prisma`.
