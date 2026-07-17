# Итерация 01 — Schema-first: Zod + type provider + OpenAPI

> 🎯 Одна Zod-схема на роуте порождает сразу три вещи: рантайм-валидацию запросов,
> статические типы хендлера и OpenAPI-спеку. Это фундамент герой-пайплайна проекта.

## Зачем это (продукт и ценность)

Продукт deskwise-lite — мини-кабинет поддержки Fernwood Supplies: агент видит очередь
тикетов, ведёт каждый тикет по жизненному циклу статусов и получает AI-подсказки — вместо
ручного разбора почтового ящика. Бизнесу это ценно дважды: команда поддержки получает
управляемый поток обращений, а инженерная команда — контракт, при котором фронт физически
не может рассинхронизироваться с бэком: рассинхрон ловит компилятор и CI, а не пользователь
в проде. Именно эта итерация добавила первый рабочий кусок продукта: тикет теперь можно
создать и найти через API, причём кривой запрос (пустая тема, несуществующий статус)
сервис вежливо отклоняет сам, а форма контракта зафиксирована документом, по которому
дальше будет собираться весь интерфейс агента.

## 🧵 Что это дало резюме

Пункт north-star **«Schema-first Node API»** стал демонстрируемым: артефакт-доказательство —
закоммиченный `api/openapi.json`, рождённый скриптом из Zod-схем роутов (руками не
правится), плюс автоматический 400 на невалидный body и красный `tsc` при переименовании
поля в схеме.

## TL;DR (простыми словами)

Было: голый hello-роут `/health` без валидации и без спеки. Стало: три тикет-роута
(создать, список с фильтром, один по id), где каждый запрос проверяется схемой ещё до
хендлера, а типы `request.body`/`request.query` компилятор выводит из той же схемы.
Добавили два кусочка: Zod-схемы тикета как единый источник правды и скрипт
`pnpm openapi:emit`, который печатает из этих схем файл `api/openapi.json`.

## Что это за техника

- **Zod ≈ Pydantic.** Zod — библиотека схем данных для TypeScript: схема описывается кодом
  (`z.object({...})`), умеет валидировать значение в рантайме и одновременно отдаёт
  статический тип (`z.infer`). Ровно как Pydantic-модель: один класс — и валидация, и
  type hints. Здесь Zod-схемы тикета (`TicketSchema`, `CreateTicketSchema`) — единый
  источник правды для всего остального. Ключевые термины: *схема* (описание формы данных),
  *`z.infer`* (вытащить из схемы TypeScript-тип), *`enum`-схема* (`z.enum([...])` — как
  `Literal`/`Enum` в Pydantic).

- **Type provider ≈ то, что FastAPI делает сигнатурой эндпоинта.** В FastAPI ты пишешь
  Pydantic-модель в параметрах функции — и фреймворк сам валидирует запрос и даёт типы.
  Fastify из коробки так не умеет: он валидирует JSON Schema, а про TypeScript-типы ничего
  не знает. Type provider — механизм, который учит Fastify выводить типы хендлера из схемы
  роута. Пакет `fastify-type-provider-zod` даёт три детали: *validatorCompiler* (как
  проверять вход Zod-схемой), *serializerCompiler* (как сериализовать ответ по
  response-схеме) и собственно провайдер типов (`withTypeProvider<ZodTypeProvider>()`),
  после которого `request.body` внутри хендлера типизирован без единой ручной аннотации.

- **@fastify/swagger + jsonSchemaTransform ≈ автоспека FastAPI.** FastAPI отдаёт
  `/openapi.json` из коробки; в Fastify спеку собирает плагин `@fastify/swagger`, который
  слушает регистрацию роутов и складывает их схемы в OpenAPI-документ. Загвоздка: плагин
  понимает JSON Schema, а у нас на роутах Zod — функция `jsonSchemaTransform` из того же
  type-provider-пакета конвертирует Zod-схемы в JSON Schema на лету. Отличие от FastAPI —
  осознанное: спеку мы не отдаём страницей, а **эмитим скриптом в файл** (контракт №3
  ROADMAP), потому что файл — вход для Orval-кодогенерации и для CI-гейта дрифта.

## Поток данных

Всё начинается с одного из двух триггеров: либо клиент шлёт HTTP-запрос (в проде), либо
разработчик запускает `make openapi` (в dev-цикле). Оба пути питаются одними и теми же
Zod-схемами — в этом и есть смысл итерации.

**Путь запроса.** Клиент зовёт, например, `POST /tickets` с JSON-телом. Чтобы хендлер
получил гарантированно правильные данные, Fastify сначала прогоняет тело через
`CreateTicketSchema` (validatorCompiler): невалидное — автоматический 400, до хендлера
дело не доходит; валидное — в `request.body` уже лежит типизированный объект с
подставленным дефолтом (`priority: "normal"`). Хендлер кладёт тикет в in-memory `Map` и
отвечает; ответ, в свою очередь, прогоняется через response-схему (serializerCompiler) —
лишние поля наружу не утекут.

**Путь спеки.** Разработчик запускает `make openapi` → `pnpm openapi:emit` →
`scripts/emit-openapi.ts`. Скрипту нужен собранный app (иначе swagger-плагину неоткуда
узнать роуты), поэтому он зовёт ту же фабрику `buildServer()`, ждёт `app.ready()` (в этот
момент `@fastify/swagger` уже собрал документ из всех схем роутов) и печатает
`app.swagger()` в `api/openapi.json`. Слушающий сервер не поднимается — порт не нужен.

```
                    Zod-схемы (src/schemas/ticket.ts)
                    единый источник правды
                   ┌────────────┼─────────────────┐
                   ▼            ▼                 ▼
             рантайм-      типы хендлера     OpenAPI-спека
             валидация     (type provider)   (@fastify/swagger
                   │            │             + jsonSchemaTransform)
                   ▼            ▼                 ▼
HTTP-запрос ──► 400/2xx    request.body      make openapi ──► api/openapi.json
                           типизирован                        (коммитится, руками
                           компилятором                        не правится)
```

| Инструмент | Что делает | Куда пишет |
|---|---|---|
| `fastify-type-provider-zod` (validator/serializer) | проверяет body/query/params Zod-схемой до хендлера, сериализует ответ по response-схеме | HTTP-ответ (400 или 2xx) |
| `ZodTypeProvider` (тот же пакет) | выводит TypeScript-типы `request.body`/`query`/`params` из схемы роута | никуда — работает в компиляторе |
| `@fastify/swagger` + `jsonSchemaTransform` | собирает OpenAPI-документ из схем всех роутов при `app.ready()` | в память (`app.swagger()`) |
| `scripts/emit-openapi.ts` (`make openapi`) | собирает app без listen и печатает спеку файлом | `api/openapi.json` |

Честные оговорки — чего в этой итерации **нет**: спека никем не потребляется (Orval-клиент —
iter 6, CI-гейт дрифта — iter 7); ошибки — в дефолтном формате Fastify, единый envelope
`{"error": {...}}` придёт в iter 3; хранилище — in-memory `Map`, живёт до рестарта
(Prisma/Postgres — iter 4); UI нет вовсе (iter 6).

## Карта «где в коде»

Номера строк — ориентир на момент итерации; надёжнее искать по именам символов.

1. **DTO-схемы тикета** — `api/src/schemas/ticket.ts:3-27`. Файл объявляет enum-схемы
   статуса и приоритета из замороженного домена, полную схему тикета и схему создания.
   `CreateTicketSchema` не пишется с нуля, а выводится из `TicketSchema` через
   `pick`/`extend` — так поля не разъезжаются; дефолт приоритета живёт в схеме, и его
   подставляет валидация, а не хендлер. Это ручные DTO (правило 5): когда в iter 4 появится
   Prisma, схема хранения сможет расходиться с контрактом.

   ```ts
   export const TicketStatusSchema = z.enum(["open", "in_progress", "resolved", "closed"]);
   export const TicketSchema = z.object({
     id: z.uuid(),
     subject: z.string().min(1),
     body: z.string().min(1),
     status: TicketStatusSchema,
     priority: TicketPrioritySchema,
   });
   export const CreateTicketSchema = TicketSchema.pick({ subject: true, body: true })
     .extend({ priority: TicketPrioritySchema.default("normal") });
   export type Ticket = z.infer<typeof TicketSchema>;
   ```

2. **Сетап type provider и swagger** — `api/src/server.ts:17-37`, функция `buildServer()`.
   Фабрика создаёт Fastify-инстанс, подключает к нему Zod-компиляторы и регистрирует
   swagger-плагин **до** объявления роутов — swagger вешает onRoute-хук, и роуты,
   объявленные раньше него, в спеку не попадут (поэтому `await app.register(...)`, и
   поэтому сама фабрика стала `async`).

   ```ts
   export async function buildServer() {
     const app = Fastify().withTypeProvider<ZodTypeProvider>();
     app.setValidatorCompiler(validatorCompiler);
     app.setSerializerCompiler(serializerCompiler);
     await app.register(fastifySwagger, {
       openapi: { info: { title: "deskwise-lite API", ... } },
       transform: jsonSchemaTransform,
     });
     // dw-lite: in-memory Map → Prisma/Postgres (iter 4)
     const tickets = new Map<string, Ticket>();
     ...
   }
   ```

3. **Роуты со схемами всех четырёх видов** — `api/src/server.ts:45-94`. Три тикет-роута
   вместе покрывают body, querystring, params и response-схемы. Хендлеры тонкие: вся
   проверка входа — в схеме, поэтому в коде хендлера нет ни одного `if` про валидацию.
   Обрати внимание — у `request.body` и `request.query` нет аннотаций типов: их выводит
   type provider из схемы роута.

   ```ts
   app.post(
     "/tickets",
     { schema: { body: CreateTicketSchema, response: { 201: TicketSchema } } },
     async (request, reply) => {
       const ticket: Ticket = { ...request.body, id: crypto.randomUUID(), status: "open" };
       tickets.set(ticket.id, ticket);
       return reply.code(201).send(ticket);
     },
   );
   app.get("/tickets", { schema: { querystring: z.object({ status: TicketStatusSchema.optional() }), ... } }, ...);
   app.get("/tickets/:id", { schema: { params: z.object({ id: z.uuid() }), response: { 200: TicketSchema, 404: ... } } }, ...);
   ```

4. **Скрипт эмита спеки** — `api/scripts/emit-openapi.ts:1-11`, npm-скрипт `openapi:emit`
   в `api/package.json:6`, make-цель `openapi` в корневом `Makefile`. Скрипт собирает
   приложение той же фабрикой, что и прод (`src/index.ts`), доводит его до `ready()` — но
   не до `listen()` — и пишет `app.swagger()` в файл с финальным переводом строки, чтобы
   повторный прогон давал байт-в-байт тот же файл (идемпотентность — будущий CI-гейт).

   ```ts
   const app = await buildServer();
   await app.ready();
   const spec = JSON.stringify(app.swagger(), null, 2);
   await writeFile(new URL("../openapi.json", import.meta.url), `${spec}\n`);
   await app.close();
   ```

5. **Тесты итерации** — `api/src/tickets.test.ts:9-113`. Восемь `inject()`-тестов (аналог
   `TestClient` из FastAPI: запрос уходит в app в памяти, без сети и порта) проверяют
   happy/sad path всех роутов: 201 с дефолтами из схемы, автоматический 400 на пустой
   `subject` и на неизвестный статус в query, 404 по несуществующему id, плюс смок на то,
   что `app.swagger()` отдаёт документ со всеми путями без слушающего сервера.

   ```ts
   it("rejects an invalid body with 400 automatically", async () => {
     const app = await buildServer();
     const response = await app.inject({ method: "POST", url: "/tickets", payload: { subject: "" } });
     expect(response.statusCode).toBe(400);
   });
   ```

6. **Сгенерённый контракт** — `api/openapi.json` (290 строк, OpenAPI 3.0.3). Единственный
   файл, который нельзя править руками (контракт №3): его переписывает `make openapi`.
   Zod-схемы в нём инлайнятся прямо в описания роутов (секция `components.schemas` пока
   пустая — см. learnings). Чтобы Biome не пытался форматировать сгенерённый файл, он
   исключён в `api/biome.json` (`"includes": ["**", "!openapi.json"]`).
