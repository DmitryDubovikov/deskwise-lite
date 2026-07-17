# Итерация 03 — Эксплуатационная поверхность: pino, setErrorHandler, `/docs`

> 🎯 У сервиса появилась эксплуатационная поверхность: каждый запрос оставляет структурную
> JSON-строку лога с request-id (pino, встроенный в Fastify), любая ошибка — от невалидного
> body до необработанного исключения — уходит клиенту в едином envelope контракта №2, и
> этот envelope описан Zod-схемой прямо в `openapi.json`. Бонусом — интерактивная страница
> `/docs` из той же спеки и config-модуль, единственное место чтения env (контракт №4).

## Зачем это (продукт и ценность)

Продукт deskwise-lite — мини-кабинет поддержки Fernwood Supplies: агент видит очередь
тикетов, ведёт каждый тикет по жизненному циклу статусов и получает AI-резюме и черновик
ответа — вместо ручного разбора почтового ящика. Бизнесу это ценно дважды: команда
поддержки получает управляемый поток обращений, а инженерная команда — контракт, при
котором фронт физически не может рассинхронизироваться с бэком. Эта итерация добавляет
кусочек «сервис можно эксплуатировать»: когда у агента что-то пойдёт не так, он получит
понятный, одинаковый по форме ответ об ошибке (а не HTML-простыню или чужой стектрейс с
внутренностями), а инженер найдёт причину по логам — каждая строка привязана к конкретному
запросу через request-id. Плюс живая страница `/docs`, где API можно потыкать руками ещё
до появления фронта.

## 🧵 Что это дало резюме

Пункт north-star №1 **«Schema-first Node API»** расширился на ошибки: envelope
`{"error":{"code","message"}}` — такая же Zod-схема, как тело тикета, и она видна в
`openapi.json` на кодах 400/404/500 каждого роута (артефакт — сам файл спеки: у
`GET /tickets/{id}` четыре кода ответа с одной схемой ошибки). В стек-строку добавился
**pino** — артефакт-кадр для витрины: JSON-строка лога с `reqId` (ROADMAP → «Витрина»).

## TL;DR (простыми словами)

Было: ошибки отдавались кто во что горазд — Zod-валидация отвечала своим форматом, 404
несуществующего тикета — плоским `{"error": "..."}`, а брошенное исключение утекло бы
наружу стектрейсом; логов не было вовсе, порт был захардкожен. Стало: все ошибки проходят
через один обработчик и выходят в едином конверте с машинным кодом; каждый запрос пишет
JSON-строку лога с request-id; env читается в одном модуле с дефолтами. Добавили четыре
кусочка: `src/config.ts`, `src/schemas/error.ts`, пару хендлеров ошибок в `app.ts` и
страницу `/docs`.

## Что это за техника

- **pino ≈ structlog.** Это JSON-логгер: вместо строк «для глаз» пишет по одному
  JSON-объекту на событие — такие логи фильтруются `jq`/Loki, а не глазами. Ключевое
  отличие от Python-мира: pino не ставится и не настраивается отдельно — он **встроен в
  Fastify** и включается опцией `logger` при создании инстанса, а request-id (`reqId`)
  Fastify сам генерит на каждый запрос и кладёт в каждую строку запросного лога. В
  structlog ту же привязку контекста к запросу пришлось бы собирать руками через
  middleware и contextvars.

- **`setErrorHandler` ≈ `@app.exception_handler` FastAPI.** Это перехватчик на корне
  приложения: любая ошибка любого роута — Zod-валидация, битый JSON, брошенное в хендлере
  исключение — попадает в одну функцию, которая решает, каким кодом и в какой форме
  ответить. Парный ему `setNotFoundHandler` ловит запросы к несуществующим роутам — в
  Fastify «нет такого роута» не считается ошибкой и до error handler'а не доходит (в
  FastAPI и то и другое — exception handlers). Термины ниже: *envelope* — единый конверт
  ошибки `{"error":{"code","message"}}` (контракт №2), *машинный код* — строка типа
  `VALIDATION_ERROR`, по которой клиент ветвится программно, не парся message.

- **Config-модуль ≈ pydantic `Settings`.** Env-переменные читаются в одном месте
  (`loadConfig()` в `src/config.ts`), валидируются Zod-схемой и получают дефолты; остальной
  код про `process.env` не знает (контракт №4, префикс `DW_`). Нюанс рантайма: env всегда
  строки, поэтому порт прогоняется через `z.coerce.number()` — аналог того, что pydantic
  делает молча.

- **`@fastify/swagger-ui` ≈ страница `/docs` FastAPI.** В FastAPI интерактивная
  документация есть из коробки; в Fastify это отдельный плагин, который рендерит
  swagger-ui поверх той же спеки, что генерит `@fastify/swagger` из Zod-схем. Одна
  регистрация — и по `/docs` живёт страница, где каждый эндпоинт можно вызвать кнопкой
  Try it out.

## Поток данных

Триггер — клиент прислал плохой запрос (или хендлер упал). Например, агент поддержки
(пока — `curl`) POST-ит тикет без обязательного `subject`. Чтобы клиент получил
предсказуемый ответ, а не внутренности фреймворка, ошибка должна доехать до одного места,
знающего формат контракта №2, — это `setErrorHandler` в `app.ts`:

```
клиент ── POST /tickets {битый body}
  │
  ▼
Fastify: validatorCompiler (Zod) ── схема не сошлась → ошибка валидации
  │                                   │
  │ (валидно)                         ▼
  ▼                            setErrorHandler (app.ts) ── какая это ошибка?
хендлер роута ── throw ──────────►    ├─ Zod-валидация / битый JSON → 400 VALIDATION_ERROR
  │                                   ├─ прочие 4xx Fastify         → 4xx REQUEST_ERROR
  ▼                                   └─ всё остальное ── log.error → 500 INTERNAL_SERVER_ERROR
GET /nope (нет роута)                                      │           (generic message,
  │                                                        ▼            детали не текут)
  └──► setNotFoundHandler ── 404 NOT_FOUND        pino → stdout (JSON-строка с reqId)
                │                                          
                ▼                                          
        errorBody(code, message) ── {"error":{"code","message"}} ──► клиенту
```

Параллельно у каждого запроса есть путь лога: Fastify генерит `reqId`, pino пишет в stdout
JSON-строки `incoming request` / `request completed` с этим `reqId` — по нему все строки
одного запроса склеиваются при разборе инцидента. Уровень лога приходит из
`loadConfig()` (`DW_LOG_LEVEL`), который `index.ts` читает на старте и передаёт в
`buildApp({ logger: { level } })`; в тестах логгер по умолчанию выключен, а тест логов
подсовывает in-memory stream.

Третий путь — контрактный: та же Zod-схема `ErrorResponseSchema` навешана на коды ответов
роутов (спред `errorResponses` даёт 400/500 везде, 404 добавлен точечно у
`GET /tickets/:id`), поэтому `pnpm openapi:emit` пишет её в `openapi.json` на каждый код, а
`/docs` показывает те же ошибки интерактивно.

| Инструмент | Что делает | Куда пишет |
|---|---|---|
| pino (опция `logger` Fastify) | пишет JSON-строку на каждое событие запроса, подставляя `reqId` | stdout dev-сервера |
| `setErrorHandler` (`app.ts`) | маппит любую ошибку в envelope: Zod/битый JSON → 400, прочие 4xx → REQUEST_ERROR, остальное → 500 + лог | HTTP-ответ клиенту |
| `setNotFoundHandler` (`app.ts`) | оформляет «нет такого роута» в 404-envelope | HTTP-ответ клиенту |
| `loadConfig()` (`config.ts`) | читает `DW_PORT`/`DW_LOG_LEVEL` из env, валидирует Zod-схемой, дефолтит | объект `Config` для `index.ts` |
| `errorResponses` (`schemas/error.ts`) | подмешивает схему envelope в response-мапы роутов | `openapi.json` (через `openapi:emit`) |
| `@fastify/swagger-ui` | рендерит интерактивную страницу из той же спеки | `GET /docs` |

Честные оговорки — чего в этой итерации **нет**: кода 409 и переходов статусов нет
(state machine — iter 5; envelope просто готов принять новый код в словарь); хранилище
всё ещё in-memory `Map`, Prisma — iter 4; UI и CI-гейта нет (iter 6–7); логи идут только
в stdout — транспорты, pino-pretty и ротация осознанно не тащатся (спека: вне scope);
машинные коды в спеке — просто `string`, их словарь не энумерируется (см. learnings).

## Карта «где в коде»

Номера строк — ориентир на момент итерации; надёжнее искать по именам символов.

1. **Config-модуль** — `api/src/config.ts:5-21`, функция `loadConfig(env)`. Единственное
   место чтения env (контракт №4): Zod-схема с префиксом `DW_` валидирует и дефолтит
   значения, наружу выходит уже плоский типизированный `Config`. Аргумент `env` с дефолтом
   `process.env` оставлен ради тестируемости — тест может передать свой словарь, не трогая
   глобальное окружение.

   ```ts
   const ConfigSchema = z.object({
     DW_PORT: z.coerce.number().int().positive().default(3000),
     DW_LOG_LEVEL: z.string().default("info"),
   });

   export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
     const parsed = ConfigSchema.parse(env);
     return { port: parsed.DW_PORT, logLevel: parsed.DW_LOG_LEVEL };
   }
   ```

   Потребитель один — `api/src/index.ts:4-5`: он зовёт `loadConfig()` и отдаёт уровень
   лога в `buildApp({ logger: { level: config.logLevel } })`, а порт — в `listen`.
   Рядом лежит `api/.env.example` (в git) с теми же двумя переменными.

2. **Схема envelope и словарь кодов** — `api/src/schemas/error.ts:5-30`. Одна Zod-схема
   `ErrorResponseSchema` описывает конверт контракта №2; хелпер `errorBody(code, message)`
   собирает тело ошибки, а TypeScript-union `ErrorCode` держит словарь машинных кодов —
   новый код (409 `CONFLICT` в iter 5) добавится сюда одной строкой. Спред-объект
   `errorResponses` — это коды, которые может вернуть любой роут с валидируемым входом
   (400/500); специфичные коды роуты добавляют сами.

   ```ts
   export const ErrorResponseSchema = z.object({
     error: z.object({ code: z.string(), message: z.string() }),
   });

   export type ErrorCode =
     | "VALIDATION_ERROR" | "REQUEST_ERROR" | "NOT_FOUND" | "INTERNAL_SERVER_ERROR";

   export const errorResponses = { 400: ErrorResponseSchema, 500: ErrorResponseSchema };
   ```

3. **Обработчики ошибок** — `api/src/app.ts:32-59`, вызовы `setErrorHandler` и
   `setNotFoundHandler` в `buildApp`. Error handler различает три случая: ошибку
   Zod-валидации распознаёт хелпер `hasZodFastifySchemaValidationErrors` из
   `fastify-type-provider-zod`; транспортные ошибки Fastify с кодами `FST_ERR_CTP_*`
   (битый JSON, кривой content-type) тоже маппятся в `VALIDATION_ERROR`, чтобы внутренние
   имена фреймворка не становились контрактным словарём; всё остальное — 500 с
   generic-сообщением, а реальные детали уходят только в лог (`request.log.error`).

   ```ts
   app.setErrorHandler<FastifyError>((error, request, reply) => {
     if (hasZodFastifySchemaValidationErrors(error)) {
       return reply.code(400).send(errorBody("VALIDATION_ERROR", error.message));
     }
     if (error.statusCode && error.statusCode < 500) {
       const code = error.code?.startsWith("FST_ERR_CTP")
         ? "VALIDATION_ERROR" : "REQUEST_ERROR";
       return reply.code(error.statusCode).send(errorBody(code, error.message));
     }
     request.log.error({ err: error }, "unhandled error");
     return reply.code(500).send(errorBody("INTERNAL_SERVER_ERROR", "Internal server error"));
   });

   app.setNotFoundHandler((request, reply) =>
     reply.code(404).send(errorBody("NOT_FOUND", `Route ${request.method} ${request.url} not found`)),
   );
   ```

4. **Логгер как зависимость** — `api/src/app.ts:16-26` (`AppDeps.logger`) и тест
   `api/src/errors.test.ts:52-73`. Конфиг pino приходит в `buildApp` тем же путём, что
   и остальные зависимости (правило 6): прод передаёт `{ level }` из config-модуля,
   тесты по умолчанию получают `false` — прогон vitest молчит. Тест структурных логов
   подсовывает pino in-memory stream и проверяет, что запросные строки распарсились как
   JSON и несут `reqId`.

   ```ts
   export interface AppDeps {
     ticketStore?: TicketStore;
     logger?: FastifyServerOptions["logger"];
   }

   const app = Fastify({ logger: deps.logger ?? false }).withTypeProvider<ZodTypeProvider>();
   ```

5. **Схемы ошибок на роутах** — `api/src/routes/tickets.ts:15-70` и
   `api/src/routes/health.ts:6-18`. Каждый tickets-роут подмешивает `...errorResponses` в
   response-мапу, а `GET /tickets/:id` объявляет ещё и 404 — и его хендлер теперь отвечает
   `errorBody("NOT_FOUND", ...)` вместо прежнего плоского `{error: "..."}`. Благодаря
   этому `openapi:emit` видит envelope на каждом коде и пишет его в `api/openapi.json`
   (у `GET /tickets/{id}` — ответы 200/400/404/500).

   ```ts
   app.get(
     "/tickets/:id",
     {
       schema: {
         params: TicketSchema.pick({ id: true }),
         response: { 200: TicketSchema, 404: ErrorResponseSchema, ...errorResponses },
       },
     },
     async (request, reply) => {
       const ticket = app.ticketStore.get(request.params.id);
       if (!ticket) {
         return reply.code(404).send(errorBody("NOT_FOUND", "Ticket not found"));
       }
       return ticket;
     },
   );
   ```

6. **Интерактивная документация** — `api/src/app.ts:74-75`. Одна регистрация плагина —
   и по `/docs` живёт swagger-ui, читающий ту же спеку, что и `openapi:emit`; это аналог
   автостраницы `/docs` FastAPI, только явным плагином.

   ```ts
   await app.register(fastifySwaggerUi, { routePrefix: "/docs" });
   ```

7. **Тесты итерации** — `api/src/errors.test.ts:1-98`. Четыре блока держат done-gate:
   битый JSON → 400 `VALIDATION_ERROR` (а не `FST_*`-код); неизвестный роут → 404
   `NOT_FOUND`; исключение в хендлере (фейковый store `ThrowingStore`, кидающий из `get`)
   → 500 строго `{"code":"INTERNAL_SERVER_ERROR","message":"Internal server error"}` —
   тест равенством всего тела доказывает, что «secret internal detail» наружу не утёк;
   спека содержит коды 200/400/404/500 у `GET /tickets/{id}`; `/docs/` отдаёт HTML.
   Плюс два усиленных ассерта в `api/src/tickets.test.ts:38,100` — прежние тесты 400/404
   теперь проверяют и машинный код в envelope.

   ```ts
   class ThrowingStore extends Map<string, Ticket> {
     override get(_id: string): Ticket | undefined {
       throw new Error("secret internal detail");
     }
   }
   const app = await buildApp({ ticketStore: new ThrowingStore() });
   // ... inject GET /tickets/:id → 500, тело сравнивается целиком с generic-envelope
   ```
