# Итерация 09 — SSE и Node-стримы: `POST /tickets/:id/suggest-reply`

> 🎯 **Тот же инженерный стандарт, другой рантайм.** Стрим токенов OpenAI протекает через
> Fastify SSE-ответом до React-UI без буферизации по всему пути (api → nginx → браузер) —
> витринная сила Node: асинхронный I/O как родная стихия рантайма.

## Зачем это (продукт и ценность)

deskwise-lite — мини-кабинет поддержки Fernwood Supplies: агент видит очередь тикетов,
ведёт каждый по жизненному циклу статусов и получает AI-помощь вместо ручного разбора
почтового ящика. Бизнесу это даёт управляемый поток обращений, а инженерной команде —
контракт, при котором фронт не может рассинхронизироваться с бэком незаметно. Эта итерация
прибавляет вторую AI-фичу: кнопка **Suggest reply** в детали тикета пишет черновик
вежливого ответа клиенту — и текст появляется на экране по мере генерации, слово за
словом, как в ChatGPT. Агент не смотрит на спиннер десять секунд: первые слова черновика
видны почти сразу, и уже по ним понятно, годится ли ответ.

## 🧵 Что это дало резюме

Пункт north-star **«SSE token streaming»** стал демонстрируемым: `curl -N` через nginx
показывает SSE-кадры `data: {"delta":"…"}`, приходящие порциями по мере генерации, а в UI
черновик дорисовывается на глазах. Этим закрылась вторая половина резюме-строки
«Integrated OpenAI into the service: …plus an SSE endpoint streaming completion tokens
from Fastify to React» (первая — typed JSON endpoint — iter 8). Ручной хук
`useSuggestReplyStream` — задокументированная граница контракт-подхода: OpenAPI/Orval
стриминг не описывают, и это осознанное исключение, а не дырка.

## TL;DR (простыми словами)

Было: кнопка Summarize, которая ждёт весь ответ OpenAI и показывает его одним куском.
Стало: кнопка Suggest reply, у которой текст течёт на экран по мере генерации. Добавились
две вещи: SSE-эндпоинт в API — он подписывается на стрим событий OpenAI и переливает
текстовые дельты в HTTP-ответ кадрами `data: {"delta":…}`, — и ручной хук на фронте,
который читает эти кадры из fetch-стрима и дописывает текст в состояние. Плюс nginx
получил SSE-локацию с `proxy_buffering off`, чтобы не копить токены у себя.

## Что это за техника

- **SSE (Server-Sent Events).** Это способ, которым сервер шлёт клиенту поток событий по
  обычному HTTP-ответу: соединение не закрывается, а тело ответа приходит кадрами вида
  `data: <текст>\n\n`. В Python-мире это `StreamingResponse` из FastAPI, отдающий
  генератор с `media_type="text/event-stream"`. В отличие от WebSockets здесь нет
  двунаправленности и отдельного протокола — обычный HTTP, который умеют nginx и curl.
  Ключевые термины: *кадр* (блок до пустой строки), *wire-формат* (что именно лежит в
  `data:` — у нас JSON `{"delta":…}` и терминатор `[DONE]`).
- **Async-генератор + `Readable.from` — стрим как значение.** Стрим OpenAI в Node — это
  async iterable, по которому можно идти `for await` — точный аналог `async for` по
  стриму в `openai-python`. Функция `sseFrames` — async-генератор (как в Python:
  `async def` с `yield`), который перекладывает события OpenAI в SSE-строки.
  `Readable.from(генератор)` превращает его в Node-стрим, и Fastify пайпит такой стрим в
  ответ сам — как `StreamingResponse(generator)` в FastAPI. Zod-сериализатор при этом не
  участвует: стрим уходит в ответ как есть.
- **fetch-reader на клиенте.** Браузерный `fetch` умеет отдавать тело ответа не целиком,
  а стримом: `response.body.getReader()` выдаёт байтовые чанки по мере прихода — аналог
  `iter_lines()` у `requests`/`httpx`. Штатный браузерный `EventSource` не подошёл по
  двум причинам: он умеет только GET, а его автоматический reconnect повторно запускал бы
  платную генерацию. Ключевое понятие: *буфер недокачанного кадра* — чанк сети не обязан
  совпадать с границей SSE-кадра, поэтому хвост после последнего `\n\n` копится до
  следующего чанка.
- **`proxy_buffering off` в nginx.** По умолчанию nginx копит ответ апстрима у себя и
  отдаёт клиенту крупными кусками — для обычных ответов это оптимизация, для SSE — смерть
  стриминга: все токены пришли бы одним куском в конце. Отдельная локация для
  suggest-reply выключает буферизацию ровно там, где она вредна.

## Поток данных

Поток запускает агент поддержки: он открыл тикет и нажал **Suggest reply** (или
разработчик дёрнул `curl -N`). Кнопка зовёт ручной хук `useSuggestReplyStream` — Orval-хука
здесь нет, потому что роут скрыт из контракта (`hide: true`): OpenAPI стриминг не
описывает, и честнее держать исключение явным, чем врать спекой. Запрос идёт через nginx
:8080, который для этого URI не буферизует ответ. Хендлер сначала достаёт тикет из
Postgres — несуществующий id должен дать честный 404 в envelope **до** старта стрима
(заголовки ещё не ушли, HTTP-код ещё можно выбрать) и до какого-либо расхода на AI. Затем
он открывает стрим OpenAI (`responses.stream`, пиннёный снапшот, `temperature=0`) и
отвечает `text/event-stream`: генератор `sseFrames` фильтрует из событий стрима текстовые
дельты (`response.output_text.delta`) и заворачивает каждую в кадр `data: {"delta":…}`.
Хук на фронте читает кадры fetch-reader'ом и дописывает каждую дельту в state — React
дорисовывает текст. Конец генерации — кадр `data: [DONE]`; ошибка OpenAI посреди стрима —
кадр `event: error` с тем же envelope, что у JSON-ошибок (HTTP-код уже не сменить — 200
ушёл с первым кадром).

```
[кнопка Suggest reply] ──useSuggestReplyStream.start()──▶ nginx :8080
                                                             │ SSE-локация: proxy_buffering off
                                                             ▼
                                              Fastify api:3000  (роут hide — вне OpenAPI)
                                                             │
                                404 в envelope (JSON) ◀─ нет ─┤ prisma: тикет есть?
                                                             │ да
                                                             ▼
                               OpenAI stream ◀── app.ai.client.responses.stream
                                    │               (снапшот, temperature=0, промпт+тикет)
        события response.output_text.delta          │
                                    ▼               ▼
                       sseFrames() ──▶ data: {"delta":"Hi"}   ──┐ по одному кадру,
                                       data: {"delta":" there"} ─┤ по мере генерации
                                       data: [DONE]             ─┘
                                                             │
                          fetch-reader (хук) ◀───────────────┘
                                    │ setText(prev + delta)
                                    ▼
                       [текст дорисовывается в UI]
```

| Инструмент | Что делает | Куда пишет |
|---|---|---|
| `useSuggestReplyStream` (ручной хук) | POST fetch'ем, читает тело reader'ом, парсит кадры | state `text` → React дорисовывает |
| nginx SSE-локация (`web/nginx.conf`) | проксирует без буферизации именно этот URI | — |
| хендлер suggest-reply (`routes/tickets.ts`) | 404-гейт, открывает стрим OpenAI, отвечает `text/event-stream` | HTTP-ответ-стрим |
| `sseFrames` (async-генератор) | события стрима → SSE-кадры; ошибку — кадром `event: error` | тот же ответ-стрим |
| `Readable.from` + Fastify | пайпит генератор в сокет мимо Zod-сериализатора | сокет клиента |
| фейк `fakeAi` (тесты) | `stream()` выдаёт заготовленные дельты без сети | массив `calls` в тесте |

Честные оговорки: черновик **не сохраняется** в БД (домен заморожен, правило 3) — уход с
тикета его теряет; отмены стрима (AbortController) и reconnect-логики нет — это вне scope;
`openapi.json` и Orval-клиент этой итерацией **не меняются вовсе** — эндпоинт осознанно
вне контракта, и `make generate` обязан дать пустой diff.

## Граница контракт-подхода (что в спеке, а что руками)

```
                    │  в openapi.json  │  клиент на фронте
────────────────────┼──────────────────┼──────────────────────────
CRUD, transition    │  да (Zod-схемы)  │  Orval-хуки (автоген)
summarize (iter 8)  │  да (Zod-схемы)  │  useSummarizeTicket (автоген)
suggest-reply (SSE) │  НЕТ (hide)      │  useSuggestReplyStream (руками)
                        ▲
                        └─ OpenAPI/Orval стриминг не описывают (заметка №6 ROADMAP):
                           исключение фиксируется явно, спека не врёт
```

## Карта «где в коде»

1. **Stream-метод в узком интерфейсе границы** — `api/src/plugins/openai.ts:22`
   (`stream` в `OpenAIResponsesClient`), тип события — `ResponseStreamEventLike` (`:5`).
   Интерфейс описывает ровно то, что зовёт хендлер: метод `stream()` возвращает async
   iterable событий, у которых есть `type` и опциональная `delta`. Настоящий SDK подходит
   структурно; стриминг взят отдельным методом `stream()` (он есть у SDK), а не оверлоадом
   `create({stream: true})` — оверлоады в узком интерфейсе заставили бы фейк кастовать:

   ```ts
   export interface ResponseStreamEventLike {
   	type: string;
   	delta?: string;
   }

   export interface OpenAIResponsesClient {
   	responses: {
   		create(params: {…}): Promise<{ output_text: string }>;
   		stream(params: {
   			model: string;
   			input: string;
   			temperature: number;
   		}): AsyncIterable<ResponseStreamEventLike>;
   	};
   }
   ```

2. **Генератор SSE-кадров** — `sseFrames` в `api/src/routes/tickets.ts:47`. Async-генератор
   перекладывает события стрима OpenAI в wire-формат спеки 09: текстовые дельты — в
   `data: {"delta":…}`, конец — `data: [DONE]`. Ошибка после старта стрима идёт кадром
   `event: error` с тем же envelope, что у JSON-ошибок: статус 200 уже ушёл клиенту, и
   HTTP-кодом её не выразить; логирование здесь руками, потому что стрим течёт мимо
   `setErrorHandler`:

   ```ts
   async function* sseFrames(
   	events: AsyncIterable<ResponseStreamEventLike>,
   	log: FastifyBaseLogger,
   ) {
   	try {
   		for await (const event of events) {
   			if (event.type === "response.output_text.delta" && event.delta) {
   				yield `data: ${JSON.stringify({ delta: event.delta })}\n\n`;
   			}
   		}
   		yield "data: [DONE]\n\n";
   	} catch (error) {
   		log.error({ err: error }, "ai stream failed");
   		yield `event: error\ndata: ${JSON.stringify(
   			errorBody("STREAM_ERROR", "AI stream failed"),
   		)}\n\n`;
   	}
   }
   ```

3. **Сам эндпоинт** — `api/src/routes/tickets.ts:277-303`, промпт-константа
   `SUGGEST_REPLY_PROMPT` — `:31`, общий сборщик промпта `ticketInput` — `:39` (один формат
   подачи тикета модели на оба AI-эндпоинта). Роут скрыт из спеки (`hide: true`), но
   Zod-валидация params живёт; 404 отвечает обычным JSON — до первого кадра заголовки ещё
   не ушли; сам ответ — Node-стрим, который Fastify пайпит мимо Zod-сериализатора:

   ```ts
   app.post(
   	"/tickets/:id/suggest-reply",
   	{ schema: { hide: true, params: IdParamsSchema } },
   	async (request, reply) => {
   		const ticket = await app.prisma.ticket.findUnique({ … });
   		if (!ticket) {
   			return reply.code(404).send(TICKET_NOT_FOUND);
   		}
   		const events = app.ai.client.responses.stream({
   			model: app.ai.model,
   			input: ticketInput(SUGGEST_REPLY_PROMPT, ticket),
   			temperature: 0,
   		});
   		return reply
   			.header("content-type", "text/event-stream")
   			.header("cache-control", "no-cache")
   			.send(Readable.from(sseFrames(events, request.log)));
   	},
   );
   ```

4. **Код `STREAM_ERROR` в словаре ошибок** — `api/src/schemas/error.ts:23`. Единственный
   код вне HTTP-статусов: он едет не HTTP-ответом, а SSE-кадром `event: error`, но в том же
   envelope `{"error":{code,message}}` — фронт парсит его той же формой.

5. **Фейк-стрим в тестах** — `fakeAi` в `api/src/test-setup.ts:40`. Хелпер вырос из
   summarize-теста iter 8 и переехал в общий сетап: один фейк реализует оба метода границы
   (`create` для summarize, `stream` для suggest-reply). Фейковый стрим выдаёт служебное
   событие, заготовленные дельты и — при `fail: true` — бросает исключение после дельт,
   моделируя обрыв OpenAI посреди генерации:

   ```ts
   stream: (params) => {
   	calls.push(params);
   	return (async function* () {
   		yield { type: "response.created" };
   		for (const delta of opts.deltas ?? []) {
   			yield { type: "response.output_text.delta", delta };
   		}
   		if (opts.fail) {
   			throw new Error("upstream connection lost");
   		}
   		yield { type: "response.completed" };
   	})();
   },
   ```

6. **Тесты эндпоинта** — `api/src/suggest-reply.test.ts`. Три кейса через `app.inject()`
   (фейковый стрим конечен, поэтому inject собирает весь SSE-ответ в строку): успех —
   тело побайтно равно кадрам дельт в порядке стрима плюс `[DONE]`, а в вызов ушли
   пиннёная модель и `temperature: 0`; обрыв — есть кадр `event: error` с envelope и нет
   `[DONE]`; несуществующий тикет — 404 в envelope и `calls` пуст (клиент не позван).

7. **Ручной хук на фронте** — `useSuggestReplyStream` в
   `web/src/lib/use-suggest-reply-stream.ts:26`. Шапка файла — комментарий-«почему» про
   исключение из автогена (заметка №6) и про отказ от EventSource (только GET +
   авто-reconnect повторно запускал бы платную генерацию). Хук читает тело fetch-ответа
   reader'ом, копит недокачанный кадр в буфере, режет поток по `\n\n` и дописывает каждую
   дельту в state; `[DONE]` завершает, `event: error` и не-ok-ответы превращаются в ту же
   `ApiError`, что у customFetch:

   ```ts
   const reader = response.body.getReader();
   const decoder = new TextDecoder();
   let buffer = "";
   for (;;) {
   	const { done, value } = await reader.read();
   	if (done) {
   		throw new Error("Stream ended unexpectedly");
   	}
   	buffer += decoder.decode(value, { stream: true });
   	const parts = buffer.split("\n\n");
   	buffer = parts.pop() ?? "";
   	for (const part of parts) {
   		const frame = parseFrame(part);
   		if (frame.event === "error") { /* … ApiError из envelope */ }
   		if (frame.data === "[DONE]") { return; }
   		const { delta } = JSON.parse(frame.data) as { delta: string };
   		setText((prev) => prev + delta);
   	}
   }
   ```

8. **Общая инфраструктура ошибок фронта** — `web/src/lib/api-client.ts:21`
   (`API_PREFIX`) и `:26` (`errorFromResponse`). Из customFetch выделены две вещи, которые
   нужны и ручному хуку: единственная точка знания о префиксе `/api` и превращение
   не-ok-ответа в `ApiError` из envelope. До старта стрима ошибки suggest-reply — обычный
   JSON, и обрабатываются они той же функцией, что у Orval-клиента.

9. **Кнопка в UI** — `web/src/components/TicketDetail.tsx:32` (хук) и `:78-88` (кнопка и
   вывод). Раздел размечен тем же классом `.ai-action`, что и Summarize; стримящийся
   черновик — карточка `.reply` с зелёным акцентом (`web/src/styles.css:164-188`), текст —
   `white-space: pre-wrap`, чтобы абзацы черновика не слипались.

10. **SSE-локация nginx** — `web/nginx.conf:11-15`. Regex-локация матчит ровно URI
    suggest-reply и выключает буферизацию; regex-location в nginx не допускает URI в
    `proxy_pass`, поэтому префикс `/api` срезается `rewrite`, а не trailing slash'ем, как
    в общей `/api/`-локации:

    ```nginx
    location ~ ^/api/tickets/[^/]+/suggest-reply$ {
    	rewrite ^/api(/.*)$ $1 break;
    	proxy_pass http://api:3000;
    	proxy_buffering off;
    }
    ```

*Номера строк — ориентир на момент закрытия итерации; при дрейфе ищи по именам символов.*
