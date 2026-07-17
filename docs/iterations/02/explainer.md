# Итерация 02 — Plugin system: дерево плагинов + `buildApp(deps)`

> 🎯 Приложение пересобрано из монолитной фабрики в дерево Fastify-плагинов с composition
> root `buildApp(deps)`: зависимости кладутся декораторами в инкапсулированные контексты —
> это штатная замена DI-контейнера в мире Fastify (правило 6 конституции).

## Зачем это (продукт и ценность)

Продукт deskwise-lite — мини-кабинет поддержки Fernwood Supplies: агент видит очередь
тикетов, ведёт каждый тикет по жизненному циклу статусов и получает AI-подсказки — вместо
ручного разбора почтового ящика. Бизнесу это ценно дважды: команда поддержки получает
управляемый поток обращений, а инженерная команда — контракт, при котором фронт физически
не может рассинхронизироваться с бэком. Эта итерация пользовательских фич не добавляет —
она перестраивает несущий каркас: теперь у сервиса есть архитектура, в которую безболезненно
встанут настоящая база (iter 4), OpenAI-клиент (iter 8) и обработчик ошибок (iter 3), а
каждый кусок логики можно проверить тестом с подменёнными зависимостями — без БД и сети.
Для продукта это страховка от регрессий на всём дальнейшем пути.

## 🧵 Что это дало резюме

Пункт north-star №5 **«Fastify-архитектура»** стал демонстрируемым: приложение — дерево
плагинов с composition root `buildApp(deps)`, а артефакты-доказательства — тест
инкапсуляции (`app.hasDecorator("ticketStore") === false` в корне при работающих роутах
внутри скоупа) и тест с фейковым store, где app собирается с подменённой зависимостью —
аналог `dependency_overrides` FastAPI, но без DI-контейнера.

## TL;DR (простыми словами)

Было: один файл `server.ts`, где фабрика `buildServer()` создавала Fastify, объявляла все
роуты и держала `Map` тикетов замыканием — подменить хранилище в тесте было нельзя. Стало:
composition root `buildApp(deps)` в `app.ts` собирает приложение из кусочков-плагинов
(health-роуты, tickets-скоуп со своим хранилищем), а зависимости приходят аргументом.
Добавили два кусочка: плагин `ticket-store`, кладущий хранилище декоратором в
инкапсулированный контекст, и тесты, которые (а) доказывают, что хранилище не протекает
в корень, (б) собирают app с фейковым pre-seeded store.

## Что это за техника

- **Плагин ≈ Django app / FastAPI `APIRouter`.** Плагин в Fastify — это просто async-функция
  `(app, opts) => { ... }`, которая навешивает на переданный ей инстанс роуты, декораторы,
  хуки. Подключается через `app.register(плагин)` — как `include_router` в FastAPI. Ключевое
  отличие от Python-аналога: `register()` создаёт **инкапсулированный контекст** — дочернюю
  копию инстанса, и всё, что плагин объявит (декораторы, хуки), видно ему самому и его детям,
  но «вверх» и сиблингам не протекает. В FastAPI роутер глобален по эффекту; здесь у каждой
  ветки — своя область видимости, как у локальных переменных функции.

- **Декоратор ≈ `Depends`/`app.state` FastAPI.** `app.decorate("ticketStore", store)` кладёт
  значение прямо на инстанс Fastify — дальше любой роут этого контекста читает
  `app.ticketStore`. Это и есть замена DI-контейнера: зависимость объявляется один раз в
  composition root и доезжает до хендлеров через дерево контекстов, а не через импорт
  синглтона (правило 6 запрещает и синглтоны, и awilix-подобные контейнеры). Термин
  *module augmentation* — TypeScript-приём `declare module "fastify" { ... }`, докидывающий
  полю `ticketStore` тип: без него компилятор про декоратор не знает.

- **`fastify-plugin` (fp) — осознанная дырка в инкапсуляции.** Обёртка `fp(плагин)`
  отключает инкапсуляцию у самого плагина: его декораторы ложатся не в его собственный
  скрытый контекст, а в контекст, **где его зарегистрировали** — то есть хоистятся ровно
  на один уровень вверх, не дальше. Так store, зарегистрированный внутри tickets-скоупа,
  становится виден роутам-сиблингам этого скоупа, но не корню приложения. Python-аналога
  нет — в Python видимость решается импортами; здесь это явный механизм с ручкой.

- **`buildApp(deps)` ≈ фабрика `create_app()` + `dependency_overrides`.** Composition root —
  единственное место, знающее полный состав приложения: какие плагины, в каком порядке, с
  какими зависимостями. Продакшен (`index.ts`) зовёт `buildApp()` с дефолтами, тест зовёт
  `buildApp({ ticketStore: fakeMap })` — и получает то же приложение с подменённым
  хранилищем, без моков-патчей в духе `monkeypatch`.

## Поток данных

Итерация — рефакторинг: путь HTTP-запроса и путь спеки из iter 1 не изменились (пустой diff
`openapi.json` это доказывает). Новое — **путь сборки приложения**, и у него два триггера.

**Прод-путь.** `make dev` запускает `src/index.ts`, тот зовёт `buildApp()` без аргументов.
Фабрике нужно собрать дерево: сначала регистрируется swagger (его onRoute-хук обязан встать
до роутов), затем health-роуты, затем — анонимный tickets-скоуп. Внутри скоупа первым
регистрируется fp-плагин `ticketStorePlugin` — раз deps пустые, он кладёт декоратором
свежую `new Map()`; вторым — `ticketRoutes`, чьи хендлеры читают `app.ticketStore` из
контекста. Снаружи скоупа декоратора не существует.

**Тест-путь.** Vitest зовёт ту же фабрику, но с аргументом:
`buildApp({ ticketStore: pre-seeded Map })`. Дерево собирается то же самое, только в
декоратор ложится фейк — и `GET /tickets/:id` через `inject()` отдаёт тикет, которого
никто не POST-ил. Ни БД, ни сети, ни патчинга модулей.

```
   make dev → index.ts ── buildApp()            vitest ── buildApp({ticketStore: fake})
                             │                                │
                             └───────────┬────────────────────┘
                                         ▼
                     app (корень) ── hasDecorator("ticketStore") === false
                      ├─ fastifySwagger          (fp-плагин: хоистится в корень —
                      │                           app.swagger() виден всем)
                      ├─ healthRoutes            (обычный плагин: GET /health)
                      └─ tickets-скоуп           (анонимный плагин = граница видимости)
                          ├─ ticketStorePlugin   (fp: decorate("ticketStore", deps ?? Map)
                          │                       → хоист ровно до tickets-скоупа)
                          └─ ticketRoutes        (сиблинг: читает app.ticketStore ✓)
```

| Инструмент | Что делает | Куда пишет |
|---|---|---|
| `buildApp(deps)` (`app.ts`) | собирает дерево плагинов, дефолтит `deps.ticketStore` в пустую `Map` | возвращает готовый app |
| `ticketStorePlugin` (fp) | кладёт хранилище декоратором в контекст, где зарегистрирован | `app.ticketStore` tickets-скоупа |
| `register()` (Fastify) | создаёт инкапсулированный дочерний контекст на каждый плагин | дерево контекстов в памяти |
| `ticketRoutes` / `healthRoutes` | объявляют роуты со Zod-схемами iter 1 (без изменений) | HTTP-ответы |

Честные оговорки — чего в этой итерации **нет**: контракт не менялся ни на байт (пустой
diff `openapi.json` — часть done-gate); хранилище всё ещё in-memory `Map` (Prisma-клиент
встанет в этот же плагиновый шов в iter 4); env по-прежнему не читается вовсе, порт 3000
захардкожен (config-модуль — iter 3–4); UI и CI-гейта нет (iter 6–7).

## Карта «где в коде»

Номера строк — ориентир на момент итерации; надёжнее искать по именам символов.

1. **Composition root** — `api/src/app.ts:18-49`, функция `buildApp(deps)`. Единственное
   место, знающее полный состав приложения: она создаёт Fastify-инстанс с Zod-компиляторами
   (сетап iter 1 без изменений), регистрирует swagger, health-роуты и tickets-скоуп.
   Скоуп — анонимный плагин, существующий ради границы видимости: внутри него store и
   роуты — сиблинги, снаружи их внутренностей не видно. Зависимость приходит аргументом
   `deps` и дефолтится пустой `Map` — прод и тест зовут одну и ту же фабрику.

   ```ts
   export interface AppDeps {
     ticketStore?: TicketStore;
   }

   export async function buildApp(deps: AppDeps = {}) {
     const app = Fastify().withTypeProvider<ZodTypeProvider>();
     // ... Zod-компиляторы и fastifySwagger — как в iter 1
     await app.register(healthRoutes);
     await app.register(async (tickets) => {
       await tickets.register(ticketStorePlugin, {
         store: deps.ticketStore ?? new Map(),
       });
       await tickets.register(ticketRoutes);
     });
     return app;
   }
   ```

2. **Плагин-поставщик зависимости** — `api/src/plugins/ticket-store.ts:19-24`,
   `ticketStorePlugin`. Обёрнут в `fp()`, поэтому его декоратор ложится в контекст, где
   плагин зарегистрирован (tickets-скоуп), а не в его собственный скрытый — иначе роуты-
   сиблинги хранилища бы не увидели. Рядом (`:7-11`) — module augmentation, докидывающий
   тип поля `ticketStore` в `FastifyInstance`, и `dw-lite`-маркер: `Map` — стенд-ин
   Prisma-клиента до iter 4.

   ```ts
   export type TicketStore = Map<string, Ticket>;

   declare module "fastify" {
     interface FastifyInstance {
       ticketStore: TicketStore;
     }
   }

   export const ticketStorePlugin = fp<TicketStoreOptions>(
     async (app, opts) => {
       app.decorate("ticketStore", opts.store);
     },
     { name: "ticket-store" },
   );
   ```

3. **Роуты как плагины** — `api/src/routes/tickets.ts:10-61` (`ticketRoutes`) и
   `api/src/routes/health.ts:4-10` (`healthRoutes`). Содержимое роутов — ровно iter 1
   (те же Zod-схемы, те же `dw-lite`-маркеры про голый массив и плоский 404), изменилась
   упаковка: каждый файл экспортирует `FastifyPluginAsyncZod` — типизированный контракт
   «я плагин, и мои роуты понимают Zod-схемы». Хендлеры читают хранилище из контекста
   (`app.ticketStore`) вместо замыкания на локальную переменную фабрики.

   ```ts
   export const ticketRoutes: FastifyPluginAsyncZod = async (app) => {
     app.post(
       "/tickets",
       { schema: { body: CreateTicketSchema, response: { 201: TicketSchema } } },
       async (request, reply) => {
         const ticket: Ticket = { ...request.body, id: crypto.randomUUID(), status: "open" };
         app.ticketStore.set(ticket.id, ticket);
         return reply.code(201).send(ticket);
       },
     );
     // ... GET /tickets (query-фильтр), GET /tickets/:id (404) — без изменений
   };
   ```

4. **Потребители фабрики** — `api/src/index.ts:1-3` и `api/scripts/emit-openapi.ts:2-4`.
   Оба переехали с `buildServer()` на `buildApp()` однострочной правкой импорта — сам факт,
   что прод-запуск и эмит спеки не заметили пересборки, и есть смысл фабрики. Файл
   `server.ts` удалён.

   ```ts
   import { buildApp } from "./app.js";

   const app = await buildApp();
   ```

5. **Тесты итерации** — `api/src/app.test.ts:15-36` и `api/src/tickets.test.ts:102-123`.
   Два новых теста держат done-gate. Тест инкапсуляции спрашивает у корня
   `hasDecorator("ticketStore")` и ждёт `false` — рантайм-доказательство, что зависимость
   не протекла выше своего скоупа (типам это знать не дано — см. learnings). Тест фейковых
   deps собирает app с pre-seeded `Map` и читает тикет GET-ом без единого POST — прямая
   демонстрация подмены зависимости через `buildApp(deps)`.

   ```ts
   it("keeps ticketStore invisible outside the tickets scope", async () => {
     const app = await buildApp();
     await app.ready();
     expect(app.hasDecorator("ticketStore")).toBe(false);
   });

   it("serves tickets from the injected store without POST", async () => {
     const app = await buildApp({ ticketStore: new Map([[ticket.id, ticket]]) });
     const response = await app.inject({ method: "GET", url: `/tickets/${ticket.id}` });
     expect(response.json()).toEqual(ticket);
   });
   ```
