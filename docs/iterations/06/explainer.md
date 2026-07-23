# Итерация 06 — фронт-пайплайн: typed-клиент из своей спеки и полный стек за nginx

> 🎯 Тот же инженерный стандарт, другой рантайм. Existence-gate, не accuracy-gate.

## Зачем это (продукт и ценность)

Продукт deskwise-lite — мини-кабинет поддержки Fernwood Supplies: агент видит очередь
тикетов, ведёт каждый по жизненному циклу статусов и (в будущих итерациях) получает
AI-резюме и черновик ответа — вместо ручного разбора почтового ящика. До этой итерации
всё это существовало только как API: очередь можно было увидеть лишь `curl`'ом. Теперь у
агента поддержки появился настоящий кабинет в браузере — список тикетов с фильтром по
статусу и пагинацией, деталь тикета и кнопки перевода статуса. Инженерная команда при этом
получила главное свойство проекта: фронт физически не может рассинхронизироваться с
бэком — любое изменение контракта ловит компилятор фронта, а не пользователь в проде.

## 🧵 Что это дало резюме

Стал демонстрируемым **герой проекта — End-to-end type safety**: цепочка
`Zod-схема → openapi.json → Orval → typed hooks → tsc` проверена вживую — переименование
поля в Zod-схеме на бэке валит `tsc --noEmit` в `web/` реальной ошибкой компиляции.
Заодно в стек-строку легли nginx и полный Docker Compose (SPA + API + Postgres на `:8080`).

## TL;DR (простыми словами)

Было: API с закоммиченной спекой `openapi.json`, но без потребителя — фронта не
существовало. Стало: независимый пакет `web/` (Vite + React), в котором Orval из той самой
спеки генерит типизированные react-query-хуки, а UI (список/деталь/переходы) собран только
на них. Добавились два кусочка: контракт-пайплайн `make generate` (спека → typed-клиент) и
полная оркестрация `make up` (nginx на `:8080` раздаёт статику и проксирует `/api/`).
Типы фронта рождаются из спеки — руками не написан ни один DTO-тип.

## Что это за техника

- **Orval (генератор typed-клиента из OpenAPI)** — инструмент, который читает
  `openapi.json` и пишет готовые TypeScript-функции и react-query-хуки на каждый эндпоинт.
  В Python-мире та же роль у пары drf-spectacular → openapi-python-client: спека как
  граница, клиент — артефакт генерации. Здесь он замыкает герой-пайплайн: типы фронта —
  производная контракта, поэтому рассинхрон = ошибка компиляции. Ключевые термины:
  *мутатор* (`customFetch` — своя функция транспорта, которую Orval подставляет во все
  вызовы), *tags-split* (раскладка сгенерённого по тегам роутов: `api/tickets/`,
  `api/health/`), *operationId* (имя операции в спеке, из которого Orval делает имя хука —
  `listTickets` → `useListTickets`).
- **TanStack Query (react-query)** — клиентский слой данных: хук объявляет «мне нужен
  ресурс X», библиотека сама кэширует ответ, дедуплицирует запросы и перезапрашивает после
  мутаций. Прямого питоньего аналога нет (в серверном мире это «кэш + инвалидация»
  руками); ближайшая интуиция — декларативный `@lru_cache` над HTTP с явной инвалидацией.
  Термины: *query key* (ключ кэша, у Orval генерится из URL+params),
  *инвалидация* (`invalidateQueries` — пометить ключи протухшими, чтобы они
  перезапросились).
- **Vite SPA + dev proxy** — сборщик и dev-сервер фронта; `vite` в dev-режиме ≈
  `manage.py runserver` для SPA, а его прокси `/api/*` → `localhost:3000/*` повторяет
  прод-маршрутизацию nginx, чтобы код фронта не знал, где живёт API.
- **`.meta({id})` + `jsonSchemaTransformObject`** — способ дать Zod-схемам имена в спеке:
  схема с `.meta({id: "Ticket"})` попадает в `components/schemas/Ticket`, а роуты ссылаются
  на неё через `$ref`. В drf-spectacular то же делает имя сериализатора, попадающее в
  components автоматически. Без этого Orval генерит безымянные инлайн-типы вида
  `listTickets200ItemsItem` — с этим получаются человеческие `Ticket`, `TicketList`.

## Поток данных

Поток здесь двойной: build-time (как рождается typed-клиент) и runtime (как браузер
доходит до Postgres).

**Build-time (герой-пайплайн).** Триггер — разработчик поменял Zod-схему в `api/` и
запускает `make generate`. Чтобы у фронта был свежий контракт, сначала нужна спека —
поэтому первым шагом `pnpm openapi:emit` собирает приложение через `buildApp()` без
слушающего сервера и сериализует OpenAPI в `api/openapi.json`. Дальше Orval
(`pnpm generate:api` в `web/`) читает этот файл — не URL, контракт №3 — и перезаписывает
`web/src/generated/`: типы из `components/schemas` и react-query-хуки по одному на
операцию. Компоненты UI импортируют только сгенерённое, поэтому финальный судья —
`tsc --noEmit`: если схема уехала, а UI не поправили, компиляция красная.

```
api/src/schemas/*.ts (Zod + .meta({id}))
        │  make openapi  (pnpm openapi:emit: buildApp без listen → сериализация спеки)
        ▼
api/openapi.json  (коммитится, руками не правится — контракт №3)
        │  make generate  (pnpm generate:api → Orval, вход — файл, не URL)
        ▼
web/src/generated/  (typed hooks + типы; коммитится — вход drift-gate iter 7)
        │  import в компонентах
        ▼
TicketList.tsx / TicketDetail.tsx
        │  tsc --noEmit (и в pnpm build, и в Dockerfile web)
        ▼
зелёный = фронт синхронен контракту; красный = рассинхрон пойман компилятором
```

**Runtime.** Триггер — агент поддержки открывает `http://localhost:8080`. nginx отдаёт
статику `web/dist`, SPA зовёт хук `useListTickets`, тот через мутатор `customFetch` делает
`fetch("/api/tickets?...")`. Чтобы фронт не знал адрес API, префикс `/api` срезает прокси —
в прод-режиме nginx (`location /api/ { proxy_pass http://api:3000/; }`), в dev — Vite тем
же правилом. Дальше знакомый путь: Fastify валидирует Zod-схемой, Prisma ходит в Postgres.

```
браузер ── :8080 ──▶ nginx ──┬── /            → статика web/dist (SPA-fallback)
                             └── /api/tickets → api:3000/tickets (срез префикса)
                                                    │ Fastify (Zod-валидация)
                                                    ▼
                                                 Prisma → Postgres (db)
```

| Инструмент | Что делает | Куда пишет |
|---|---|---|
| `pnpm openapi:emit` (`api/scripts/emit-openapi.ts`) | собирает `buildApp()` без сервера, сериализует спеку | `api/openapi.json` |
| Orval (`web/orval.config.ts`, `pnpm generate:api`) | генерит typed react-query-хуки и типы из спеки | `web/src/generated/` |
| `tsc --noEmit` (`pnpm typecheck` в `web/`) | сверяет UI с типами контракта | никуда — красный/зелёный вердикт |
| Vite (`pnpm build` в `web/`) | собирает SPA (после tsc) | `web/dist` |
| nginx (`web/Dockerfile`, `web/nginx.conf`) | раздаёт статику + проксирует `/api/` → `api:3000` | ответы на `:8080` |
| `docker compose up` (`make up`) | db + api (сам гонит `migrate deploy` на старте) + web | контейнеры |

Честные оговорки — чего в этой итерации НЕТ: **CI-гейта ещё нет** (iter 7) — «пустой diff
после регенерации» проверяется руками, мёрдж пока ни от чего не краснеет; **web без
тестов** (`# dw-lite: web без тестов → vitest+MSW`) — типы держит tsc, механику — смок;
**SSE-локации в nginx нет** (появится в iter 9); AI-кнопок в UI нет (iter 8–9).

## Карта «где в коде»

Номера строк — ориентир на момент итерации; надёжнее искать по именам символов.

1. **Именованные схемы контракта** — `api/src/schemas/ticket.ts:18` и далее (`.meta({id})`
   на `Ticket:18`, `CreateTicket:27`, `UpdateTicket:38`, `TransitionRequest:44`,
   `TicketList:54`; плюс `ErrorResponse` в `api/src/schemas/error.ts:14`). Вызов
   `.meta({id: "..."})` кладёт схему в глобальный zod-реестр, откуда она попадёт в
   `components/schemas` спеки — так Orval получает именованные типы вместо инлайновых.
   Shape домена при этом не менялся — заморозка правила 3 держится, это метаданные
   контракта.

   ```ts
   export const TicketSchema = z
   	.object({
   		id: z.uuid(),
   		subject: z.string().min(1),
   		body: z.string().min(1),
   		status: TicketStatusSchema,
   		priority: TicketPrioritySchema,
   	})
   	.meta({ id: "Ticket" });
   ```

2. **Сборка components/$ref в спеке** — `transformObject` в `api/src/app.ts:83`. Хук
   swagger-плагина теперь первым шагом прогоняет документ через
   `jsonSchemaTransformObject` (он и превращает zod-реестр в `components/schemas` +
   `$ref`), а вторым — прежняя зачистка псевдо-тела у 204-ответов. Правится один документ,
   потребителей два: `openapi:emit` и `/docs`.

   ```ts
   transformObject: (doc) => {
   	const spec = jsonSchemaTransformObject(doc);
   	// … зачистка {enum: [null]}-контента у 204-ответов
   	return spec;
   },
   ```

3. **`tags` + `operationId` на роутах** — `api/src/routes/tickets.ts:36` (и все шесть
   операций там же), `api/src/routes/health.ts:10`. Теги дают Orval раскладку tags-split
   (`generated/api/tickets/`, `generated/api/health/`), а `operationId` — человеческие
   имена хуков: `listTickets` → `useListTickets`.

4. **Конфиг Orval** — `web/orval.config.ts:6`. Перенос из nextjs-django-tutors почти
   дословно: клиент `react-query` на `httpClient: fetch`, `tags-split`,
   `customFetch`-мутатор; вход — закоммиченный файл `../api/openapi.json` (не URL —
   контракт №3), `clean: true` перегенерирует `src/generated/` с нуля.

   ```ts
   export default defineConfig({
   	deskwise: {
   		input: { target: "../api/openapi.json" },
   		output: {
   			mode: "tags-split",
   			target: "./src/generated/api",
   			schemas: "./src/generated/schemas",
   			client: "react-query",
   			httpClient: "fetch",
   			clean: true,
   			override: {
   				mutator: { path: "./src/lib/api-client.ts", name: "customFetch" },
   				query: { signal: false },
   			},
   		},
   	},
   });
   ```

5. **Мутатор `customFetch` и `ApiError`** — `web/src/lib/api-client.ts:19` и `:9`. Единая
   точка транспорта для всех сгенерённых хуков: добавляет префикс `/api` (его срежет
   прокси), ставит JSON-заголовок и приводит любой отказ — не-2xx-ответ и даже сетевой
   `TypeError` — к исключению `ApiError` формы envelope №2. Класс объявлен как
   `implements ErrorResponse`: компилятор гарантирует, что рантайм-исключение совпадает с
   контрактным типом ошибки, и компоненты читают `query.error.error.message` без проверок.

   ```ts
   export class ApiError extends Error implements ErrorResponse {
   	constructor(
   		public status: number,
   		public error: ErrorResponse["error"],
   	) { … }
   }

   export async function customFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
   	// fetch(`/api${url}`, …); не-ok → ApiError(status, body.error); 204 → data: undefined
   }
   ```

6. **Список тикетов на typed-хуке** — `TicketListPanel` в
   `web/src/components/TicketList.tsx:13`. Компонент зовёт сгенерённый `useListTickets`
   (`:21`) с параметрами фильтра и пагинации — их типы выведены из спеки (контракт №5), и
   опечатка в имени параметра или статуса не скомпилируется. На `:31` — кламп страницы:
   если под активным фильтром последний тикет уехал (переход статуса «усушил» total),
   guarded setState во время рендера сдвигает страницу назад.

   ```ts
   const query = useListTickets({
   	page,
   	limit: PAGE_LIMIT,
   	...(status ? { status } : {}),
   });
   ```

7. **Деталь и переходы статуса** — `TicketDetail` в
   `web/src/components/TicketDetail.tsx:10`. Кнопки рендерятся на все статусы, кроме
   текущего, — матрица переходов на фронте НЕ дублируется, её знает только домен api:
   недопустимый переход честно возвращает 409, и его `message` из envelope показывается
   под кнопками (`transition.error.error.message`). После успешной мутации
   `useTransitionTicket` (`:13`) точечно инвалидирует кэш: деталь по
   `getGetTicketQueryKey(id)` и все страницы списка по префиксу `getListTicketsQueryKey()`.

8. **Рантайм-enum статусов из контракта** — `web/src/lib/ticket-statuses.ts:5`.
   `STATUS_VALUES = Object.values(TicketStatus)` — список статусов для фильтра и кнопок
   берётся из сгенерённого кода, а не из `api/` (правило 5) и не из строк руками.

9. **Dev-прокси Vite** — `web/vite.config.ts:11`. Правило `/api/*` → `localhost:3000/*`
   со срезом префикса повторяет прод-nginx, поэтому `customFetch` одинаково работает в
   dev (`make web-dev` рядом с `make dev`) и за nginx.

10. **nginx как единая точка входа** — `web/nginx.conf:3`. `:8080` раздаёт `/` из
    `web/dist` с SPA-fallback (`try_files $uri /index.html`) и проксирует
    `location /api/` на `api:3000` — trailing slash в `proxy_pass` срезает префикс.
    SSE-локация с `proxy_buffering off` сознательно отложена до iter 9 (контракт №6).

11. **Двухстадийный `web/Dockerfile`** — `web/Dockerfile:3` и `:18`. Стадия build гонит
    `pnpm build` = `tsc --noEmit && vite build` — типы включены в сборку образа, так что
    рассинхрон с контрактом валит `docker compose build`, это герой-свойство в
    оркестрации. Рантайм-стадия — голый nginx со статикой `dist` и `nginx.conf`.

12. **`api/Dockerfile` на tsx-рантайме** — `api/Dockerfile:2`
    (`# dw-lite: tsx в контейнере → tsc build`). Слой зависимостей отделён (в него входит
    `schema.prisma` ради `postinstall` = `prisma generate`), а стартовая команда сама
    доводит схему БД: `prisma migrate deploy && exec tsx src/index.ts` — идемпотентно.

13. **Полный compose и make-цели** — `docker-compose.yml:4` (сервисы `api` — ждёт
    healthy `db`, и `web` — публикует `8080:8080`; наружу торчит только nginx) и
    `Makefile:11` (`make up` — весь стек), `:8` (`make web-dev` — Vite dev), `:44`
    (`make generate` — контракт-пайплайн целиком: `openapi` → Orval; то же самое будет
    гонять drift-gate iter 7).
