# Итерация 08 — OpenAI из Node: summarize-эндпоинт в типизированном контракте

> 🎯 **Тот же инженерный стандарт, другой рантайм.** Официальный `openai` SDK входит в
> приложение тем же швом, что и Prisma: узкий интерфейс + Fastify-плагин + фейк в тестах,
> а сам AI-эндпоинт проходит через герой-пайплайн контракта без единого исключения.

## Зачем это (продукт и ценность)

deskwise-lite — мини-кабинет поддержки Fernwood Supplies: агент видит очередь тикетов,
ведёт каждый по жизненному циклу статусов и не разбирает почтовый ящик руками. Бизнесу это
даёт управляемый поток обращений, а инженерной команде — контракт, при котором фронт
физически не может рассинхронизироваться с бэком: рассинхрон ловят компилятор и CI, а не
пользователь в проде. Эта итерация прибавляет первый кусочек AI-пользы: кнопка
**Summarize** в детали тикета сжимает длинное письмо клиента в одно-два предложения —
агент понимает суть обращения за секунды, не вычитывая всё тело тикета.

## 🧵 Что это дало резюме

Пункт north-star **«AI-эндпоинт неотличим от обычного в типизированном контракте»** стал
демонстрируемым: путь `/tickets/{id}/summarize` лежит в `api/openapi.json` рядом с CRUD
(схема `TicketSummary`, ошибки 400/404/500 в общем envelope), Orval родил из него typed-хук
`useSummarizeTicket`, и кнопка в UI зовёт OpenAI через тот же сгенерённый клиент, что и
переходы статусов. Заодно закрылась резюме-строка «Integrated OpenAI into the service: a
typed JSON endpoint through the same generated contract» — её вторая половина (SSE) — iter 9.

## TL;DR (простыми словами)

Было: полный CRUD тикетов с typed-фронтом, но без капли AI. Стало: в API появился
`POST /tickets/:id/summarize` — он читает тикет из БД, отправляет его в OpenAI и
возвращает `{summary}`. Добавились две вещи: плагин `openaiPlugin`, который кладёт
OpenAI-клиент в приложение ровно так же, как Prisma-плагин кладёт БД (в тестах вместо него
фейк — сети и расходов нет), и сам эндпоинт, который прошёл через обычный конвейер
Zod-схема → спека → Orval-хук → кнопка в UI.

## Что это за техника

- **openai npm SDK (Responses API).** Это официальный клиент OpenAI для Node — прямой
  аналог `openai-python`, вплоть до имён методов. Мы зовём
  `client.responses.create({model, input, temperature})` и читаем готовый текст из
  `response.output_text` — как `client.responses.create(...)` в Python. Responses API
  выбран вместо старого Chat Completions, потому что его семантические стрим-события
  пригодятся в iter 9 для SSE.
- **Мок на границе через структурную типизацию.** В Python подменить клиент в тестах
  помогает duck typing плюс dependency override в FastAPI. В TypeScript ту же роль играет
  структурная типизация: плагин объявляет узкий интерфейс `OpenAIResponsesClient` (один
  метод `responses.create`), настоящий SDK-клиент ему соответствует автоматически, а фейк
  в тестах — три строки объекта-литерала без каста и без сети. Ключевые термины: *узкий
  интерфейс* (описываем только то, что реально зовём), *фейк* (ручная реализация
  интерфейса вместо mock-библиотеки).
- **Пин-гейт снапшота.** Модель задаётся только датированным снапшотом
  (`gpt-4.1-nano-2025-04-14`), и это проверяет regex в config-схеме — аналог валидатора в
  Pydantic `Settings`. Плавающий алиас (`gpt-4.1-nano`) конфиг не пройдёт: ответы должны
  быть воспроизводимыми, это семейное правило всех *-lite.

## Поток данных

Поток запускает агент поддержки: он открыл тикет в UI и нажал кнопку **Summarize** (или
разработчик дёрнул `curl -X POST .../summarize`). Чтобы показать резюме, фронту нужен
typed-ответ — поэтому кнопка зовёт сгенерённый Orval-хук `useSummarizeTicket`, а не
рукописный fetch. Дальше запрос идёт обычной дорогой compose: nginx на :8080 проксирует
`/api/` в `api:3000`. Хендлер сначала достаёт тикет из Postgres через `app.prisma` — без
тела тикета суммаризовать нечего, а несуществующий id должен дать честный 404 в envelope
ещё до какого-либо расхода на AI. Затем хендлер зовёт `app.ai.client.responses.create` с
промптом-константой, телом тикета и `temperature: 0`; ответ OpenAI (`output_text`)
заворачивается в `{summary}` — и Zod-схема `TicketSummarySchema` сериализует его так же,
как любой CRUD-ответ.

```
[кнопка Summarize] ──useSummarizeTicket()──▶ nginx :8080 ──/api/──▶ Fastify api:3000
                                                                        │
                                             404 в envelope ◀── нет ──┤ prisma: тикет есть?
                                                                        │ да
                                                                        ▼
                                              OpenAI API ◀── app.ai.client.responses.create
                                                  │              (model=пиннёный снапшот,
                                                  ▼               temperature=0, промпт+тикет)
                                             output_text ──▶ {summary} ──▶ 200 (TicketSummary)
```

| Инструмент | Что делает | Куда пишет |
|---|---|---|
| `useSummarizeTicket` (Orval-хук) | POST на `/api/tickets/{id}/summarize` через customFetch | состояние react-query-мутации |
| nginx (compose) | проксирует `/api/` в `api:3000` | — |
| хендлер summarize (`routes/tickets.ts`) | достаёт тикет, зовёт OpenAI, заворачивает ответ | HTTP-ответ `{summary}` |
| `openaiPlugin` | кладёт `{client, model}` декоратором `app.ai` в tickets-скоуп | контекст Fastify |
| `createAiDeps` (`ai.ts`) | строит реальный клиент из config (`DW_OPENAI_*`) | — |
| фейк `fakeAi` (тесты) | подменяет `deps.ai` в `buildApp`, записывает параметры вызова | массив `calls` в тесте |

Честные оговорки: summary **не сохраняется** в БД (домен заморожен, правило 3) — повторное
нажатие кнопки зовёт OpenAI заново; стриминга нет — ответ приходит одним JSON (токены
по мере генерации — это iter 9); ретраев и rate-limit-обвязки нет — ошибка OpenAI честно
падает в 500-envelope.

## Дерево плагинов: куда лёг новый шов

Плагин зарегистрирован внутри tickets-скоупа — ровно там же, где Prisma. Декоратор `app.ai`
виден роутам тикетов и невидим health-роуту: инкапсуляция Fastify вместо DI-контейнера
(правило 6).

```
buildApp(deps)
├── swagger + type provider + errorHandler   (корень)
├── healthRoutes                             (не видит ни prisma, ни ai)
└── tickets-скоуп
    ├── prismaPlugin  → app.prisma   (deps.prisma ?? createPrismaClient())
    ├── openaiPlugin  → app.ai       (deps.ai     ?? createAiDeps())      ← НОВОЕ
    └── ticketRoutes  — CRUD, transition, summarize
```

## Карта «где в коде»

1. **Узкий интерфейс и плагин** — `api/src/plugins/openai.ts:6` (`OpenAIResponsesClient`),
   `:31` (`openaiPlugin`). Интерфейс описывает единственный метод, который зовут хендлеры,
   — поэтому официальный SDK подходит под него структурно, а тестовый фейк не требует ни
   сети, ни каста. Плагин просто кладёт пару «клиент + пиннёная модель» декоратором:

   ```ts
   export interface OpenAIResponsesClient {
   	responses: {
   		create(params: {
   			model: string;
   			input: string;
   			temperature: number;
   		}): Promise<{ output_text: string }>;
   	};
   }

   export const openaiPlugin = fp<AiDeps>(
   	async (app, opts) => {
   		app.decorate("ai", { client: opts.client, model: opts.model });
   	},
   	{ name: "openai" },
   );
   ```

2. **Фабрика реального клиента** — `createAiDeps` в `api/src/ai.ts:8`. Это зеркало
   `createPrismaClient`: ключ и модель берутся только из config (контракт №4), а клиент
   ленив — пока нет вызова, нет и сети, поэтому `openapi:emit` и тесты ничего не платят:

   ```ts
   export function createAiDeps(): AiDeps {
   	const config = loadConfig();
   	return {
   		client: new OpenAI({ apiKey: config.openaiApiKey }),
   		model: config.openaiModel,
   	};
   }
   ```

3. **Шов в composition root** — `api/src/app.ts:24` (`ai?: AiDeps` в `AppDeps`) и `:114`
   (регистрация). Тесты передают фейк, прод получает реальный клиент — то же правило
   `deps.x ?? createX()`, что у Prisma:

   ```ts
   await tickets.register(openaiPlugin, deps.ai ?? createAiDeps());
   ```

4. **Конфиг с пин-гейтом** — `api/src/config.ts:12-17`. Ключ обязан быть непустым, а
   модель — датированным снапшотом; плавающий алиас валидацию не проходит:

   ```ts
   DW_OPENAI_API_KEY: z.string().min(1),
   DW_OPENAI_MODEL: z
   	.string()
   	.regex(/-\d{4}-\d{2}-\d{2}$/, "pinned snapshot required (…-YYYY-MM-DD)"),
   ```

5. **Сам эндпоинт** — `api/src/routes/tickets.ts:206-232`, промпт-константа
   `SUMMARIZE_PROMPT` — `:23`. Хендлер сначала проверяет существование тикета (404 до
   всякого расхода), затем зовёт OpenAI детерминированно и возвращает DTO по Zod-схеме:

   ```ts
   app.post(
   	"/tickets/:id/summarize",
   	{
   		schema: {
   			operationId: "summarizeTicket",
   			params: IdParamsSchema,
   			response: { 200: TicketSummarySchema, 404: ErrorResponseSchema, ...errorResponses },
   		},
   	},
   	async (request, reply) => {
   		const ticket = await app.prisma.ticket.findUnique({ where: { id: request.params.id } });
   		if (!ticket) {
   			return reply.code(404).send(TICKET_NOT_FOUND);
   		}
   		const response = await app.ai.client.responses.create({
   			model: app.ai.model,
   			input: `${SUMMARIZE_PROMPT}\n\nSubject: ${ticket.subject}\n\n${ticket.body}`,
   			temperature: 0,
   		});
   		return { summary: response.output_text };
   	},
   );
   ```

6. **DTO ответа** — `TicketSummarySchema` в `api/src/schemas/ticket.ts:42`. Схема нарочно
   не имеет пары в `schema.prisma`: summary считается по требованию и живёт только в
   контракте (DTO ≠ модель БД, правило 5):

   ```ts
   export const TicketSummarySchema = z
   	.object({ summary: z.string() })
   	.meta({ id: "TicketSummary" });
   ```

7. **Тесты с фейком** — `api/src/summarize.test.ts:8` (`fakeAi`) и два кейса: успех
   (фейковый summary доезжает до ответа, в вызов ушли пиннёная модель, `temperature: 0` и
   тело тикета) и 404 (клиент не вызван вовсе — `calls` пуст). Хелпер `createTicket` и
   фикстура `validBody` переехали в `api/src/test-setup.ts:20-33`, чтобы не дублироваться
   между тестовыми файлами.

8. **Фронт** — `web/src/components/TicketDetail.tsx:29` зовёт сгенерённый
   `useSummarizeTicket` (Orval, `web/src/generated/api/tickets/tickets.ts:750`), кнопка и
   вывод — `:62-74`. В `web/src/App.tsx:18` деталь получила `key={selectedId}` — при
   смене тикета компонент ремоунтится и summary тикета A не залипает под тикетом B.

9. **CI и env** — `.github/workflows/ci.yml`: джобы `api` и `contract-drift` получили
   заглушки `DW_OPENAI_API_KEY: unused` / `DW_OPENAI_MODEL: gpt-fake-0000-00-00` — config
   валиден, а сеть не нужна (в тестах фейк, в эмите клиент ленив). В `docker-compose.yml`
   сервис `api` читает `env_file: ./api/.env` — реальный ключ живёт вне git.

*Номера строк — ориентир на момент закрытия итерации; при дрейфе ищи по именам символов.*
