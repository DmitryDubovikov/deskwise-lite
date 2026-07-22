# Итерация 05 — REST-сборка: полный домен тикетов и его заморозка

> 🎯 Из выученного в iter 1–4 собран полный REST-домен тикетов: CRUD дособран (PATCH,
> DELETE), появился переходной эндпоинт `POST /tickets/:id/transition` со state machine
> статусов в виде чистой domain-функции (недопустимый переход → 409), список получил
> offset-пагинацию и фильтр по статусу, а БД — идемпотентный seed из 30 осмысленных
> тикетов Fernwood Supplies. Новой учёбы почти нет — итерация завершает домен и
> **замораживает** его: дальше меняться будет только то, что вокруг (фронт, CI, AI).

## Зачем это (продукт и ценность)

Продукт deskwise-lite — мини-кабинет поддержки Fernwood Supplies: агент видит очередь
тикетов, ведёт каждый тикет по жизненному циклу статусов и получает AI-резюме и черновик
ответа — вместо ручного разбора почтового ящика. Бизнесу это ценно дважды: команда
поддержки получает управляемый поток обращений, а инженерная команда — контракт, при
котором фронт физически не может рассинхронизироваться с бэком. До этой итерации кабинет
умел только завести тикет и посмотреть его; жизненного цикла не было — «взял в работу»,
«решил», «закрыл» приходилось держать в голове. Теперь тикет живёт по понятным правилам:
статус меняется только по разрешённым переходам (нельзя закрыть необработанный тикет или
воскресить закрытый), очередь листается страницами и фильтруется по статусу, а в системе
с первого дня есть 30 реалистичных обращений — очередь выглядит как у настоящей команды
поддержки, и будущим AI-фичам есть что суммаризовать.

## 🧵 Что это дало резюме

Пункт красной нити **«Домен готов кормить герой-пайплайн»**: `api/openapi.json` теперь
содержит весь контракт домена — четыре пути (`/health`, `/tickets`, `/tickets/{id}`,
`/tickets/{id}/transition`) со схемами ответов на каждый код (200/201/204/400/404/409/500).
Именно из этого файла iter 6 сгенерит Orval-клиент, а iter 8–9 добавят AI-эндпоинты поверх
замороженного домена. Артефакт-доказательство: `pnpm openapi:emit` регенерит спеку в ноль
diff'а, и `jq '.paths | keys'` показывает полный домен.

## TL;DR (простыми словами)

Было: три роута (создать, список без страниц, получить по id) поверх Postgres. Стало:
полный REST — обновление и удаление тикета, отдельный эндпоинт перехода статуса, который
сверяется с матрицей разрешённых переходов и отвечает 409 на недопустимый, пагинация
`{items, total, page, limit}` с фильтром по статусу, и команда `make seed`, наполняющая
базу 30 тикетами сколько угодно раз без дублей. Добавили три кусочка: чистый
domain-модуль `src/domain/ticket-status.ts` с матрицей переходов, seed-скрипт
`prisma/seed.ts` и общую фабрику Prisma-клиента `src/db.ts`.

## Что это за техника

Незнакомых кластеров в итерации нет (по спеке — сборка), но четыре микро-приёма стоят
ликбеза:

- **`z.strictObject` ≈ Pydantic `model_config = ConfigDict(extra="forbid")`.** Обычный
  `z.object()` в Zod молча выбрасывает неизвестные ключи из результата парсинга — как
  Pydantic по умолчанию игнорирует лишние поля. `strictObject` вместо этого отвечает
  ошибкой валидации. Здесь это защита state machine: PATCH с `status` в теле получает
  явный 400, а не тихий стрип, после которого клиент уверен, что статус поменялся.

- **State machine как чистая domain-функция ≈ доменный модуль без импортов Django/DRF.**
  Матрица переходов живёт в `src/domain/ticket-status.ts` и не импортирует ни Fastify,
  ни Prisma (правило 6) — это обычная функция `canTransition(from, to)`, которую unit-тест
  гоняет по всем 16 парам статусов без БД и HTTP. Zod-схема статуса строится **из**
  доменного списка `TICKET_STATUSES` — схема зависит от домена, не наоборот.

- **Prisma `P2025` ≈ `except ObjectDoesNotExist`.** Атомарные `update`/`delete` Prisma
  кидают типизированную ошибку с кодом `P2025`, когда записи нет — один запрос к БД
  вместо пары `findUnique` + мутация. Хендлеры ловят её и превращают в канонный 404, как
  в Django ловят `DoesNotExist` вместо предварительного `get()`.

- **Seed через upsert ≈ `manage.py loaddata` с фиксированными pk.** У Prisma нет встроенных
  фикстур — seed это просто скрипт, зарегистрированный в `prisma.config.ts`
  (`migrations.seed: "tsx prisma/seed.ts"`) и вызываемый `prisma db seed`. Идемпотентность
  делается руками: у каждого тикета фиксированный UUID, запись пишется `upsert`'ом —
  повторный прогон не плодит дублей, а **возвращает канон** (перекрашенный вручную
  seed-тикет вернётся к исходному статусу).

## Поток данных

Поток запускает агент поддержки (в демо — `curl`), решивший перевести тикет по жизненному
циклу: `POST /tickets/:id/transition {"to": "..."}`. Чтобы до бизнес-логики доходили
только осмысленные запросы, первым стоит Zod-слой: `TransitionSchema` отвергает
неизвестный статус (400) ещё до хендлера. Дальше хендлеру нужен текущий статус тикета —
без него матрицу не спросить — поэтому он делает `findUnique` (нет тикета → 404 в
envelope). Теперь можно спросить домен: чистая функция `canTransition(from, to)` сверяет
пару с матрицей; запрещённый переход не трогает БД и уходит клиенту как
409 `CONFLICT` в том же envelope. И только разрешённый переход доезжает до
`prisma.ticket.update`, а обновлённый тикет сериализуется по `TicketSchema` обратно.

```text
агент (curl / будущий UI)
  │  POST /tickets/:id/transition {"to":"closed"}
  ▼
Zod: TransitionSchema ──неизвестный статус──▶ 400 VALIDATION_ERROR
  ▼
handler: prisma.findUnique ──нет тикета──▶ 404 NOT_FOUND
  ▼
domain: canTransition(from, to) ──false──▶ 409 CONFLICT   (БД не тронута)
  ▼ true
prisma.ticket.update({status: to}) ──▶ Postgres (таблица Ticket)
  ▼
TicketSchema-сериализация ──▶ 200 + тикет
```

Сама матрица (контракт №1, заморожена):

```text
open ──▶ in_progress ──▶ resolved ──▶ closed (терминал)
                ▲            │
                └── reopen ──┘
```

Второй поток запускает разработчик командой `make seed`, чтобы очередь не была пустой:

```text
make seed → pnpm db:seed → prisma db seed (конфиг prisma.config.ts)
  → tsx prisma/seed.ts → $transaction из 30 upsert'ов → Postgres
```

| Инструмент | Что делает | Куда пишет |
|---|---|---|
| `TransitionSchema` / `UpdateTicketSchema` (Zod) | валидируют вход; strict-PATCH отвергает `status` | 400 в envelope клиенту |
| `canTransition` (`src/domain/ticket-status.ts`) | чистая проверка пары статусов по матрице | никуда — pure function |
| хендлеры `routes/tickets.ts` | оркестрируют: findUnique → домен → мутация; P2025 → 404 | Postgres через `app.prisma` |
| `prisma/seed.ts` | 30 upsert'ов с фиксированными id одной транзакцией | таблица `Ticket` в Postgres |
| `openapi:emit` | пересобирает спеку со всеми новыми роутами | `api/openapi.json` (коммитится) |

Честные оговорки: UI по-прежнему нет (список и кнопки переходов — iter 6), CI-гейта на
дрифт контракта нет (iter 7), и проверка перехода **не атомарна** — между `findUnique` и
`update` другой запрос теоретически может успеть поменять статус; для фикстуры это
осознанно принято (см. learnings).

## Карта «где в коде»

Номера строк — ориентир на момент итерации; надёжнее искать по именам символов.

1. **Domain state machine** — `api/src/domain/ticket-status.ts:15-24`. Модуль объявляет
   канонический список статусов `TICKET_STATUSES` (из него Zod и строит enum) и матрицу
   `ALLOWED_TRANSITIONS`; функция `canTransition` — единственный способ спросить,
   разрешён ли переход. Импортов Fastify/Prisma в файле нет — правило 6 соблюдено
   буквально, unit-тест `ticket-status.test.ts` перебирает все 16 пар.

   ```ts
   const ALLOWED_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
   	open: ["in_progress"],
   	in_progress: ["resolved"],
   	resolved: ["closed", "in_progress"],
   	closed: [],
   };

   export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
   	return ALLOWED_TRANSITIONS[from].includes(to);
   }
   ```

2. **Strict-DTO для PATCH** — `UpdateTicketSchema` в `api/src/schemas/ticket.ts:25-31`.
   Схема собрана из полей `TicketSchema`, но через `strictObject` + `.partial()`: все
   поля опциональны, а любое лишнее (в первую очередь `status`) — это 400, потому что
   статус меняется только через `/transition`.

   ```ts
   export const UpdateTicketSchema = z
   	.strictObject({
   		subject: TicketSchema.shape.subject,
   		body: TicketSchema.shape.body,
   		priority: TicketPrioritySchema,
   	})
   	.partial();
   ```

3. **Пагинация списка** — GET-хендлер в `api/src/routes/tickets.ts:44-67`. Запрос
   описан `ListTicketsQuerySchema` (`z.coerce` превращает строки query в числа, `limit`
   ограничен сотней), а хендлер параллельно берёт страницу и общий счётчик; порядок —
   `orderBy id`, потому что `createdAt` в замороженном домене нет.

   ```ts
   const [items, total] = await Promise.all([
   	app.prisma.ticket.findMany({ where, orderBy: { id: "asc" },
   		skip: (page - 1) * limit, take: limit }),
   	app.prisma.ticket.count({ where }),
   ]);
   return { items, total, page, limit };
   ```

4. **PATCH/DELETE через атомарные мутации** — `api/src/routes/tickets.ts:92-143`. Оба
   хендлера зовут `update`/`delete` сразу, без предварительного `findUnique`, и
   превращают Prisma-ошибку «запись не найдена» в канонный 404 через предикат
   `isRecordNotFound` (`error.code === "P2025"`).

   ```ts
   const isRecordNotFound = (error: unknown) =>
   	error instanceof Prisma.PrismaClientKnownRequestError &&
   	error.code === "P2025";
   ```

5. **Transition-эндпоинт** — `api/src/routes/tickets.ts:147-181`. Единственное место,
   где статус меняется (контракт №1): хендлер читает тикет, спрашивает домен и либо
   отвечает 409 с человекочитаемым сообщением, либо обновляет статус.

   ```ts
   if (!canTransition(ticket.status, to)) {
   	return reply.code(409).send(errorBody("CONFLICT",
   		`Cannot transition ticket from '${ticket.status}' to '${to}'`));
   }
   return app.prisma.ticket.update({ where: { id }, data: { status: to } });
   ```

6. **`CONFLICT` в словаре кодов** — `ErrorCode` в `api/src/schemas/error.ts:15-20`
   пополнился пятым машинным кодом; envelope и `errorBody` не изменились.

7. **Чистка 204 в спеке** — `transformObject` в `api/src/app.ts:78-92`. DELETE отвечает
   204 без тела, но `fastify-type-provider-zod` сериализует `z.null()` в псевдо-content
   `{enum: [null]}` — хук вычищает `content` у всех 204-ответов, чтобы спека не обещала
   Orval JSON-тело, которого нет. Правится один источник — и `openapi.json`
   (`openapi:emit`), и `/docs` получают одинаково чистый документ.

8. **Общая фабрика Prisma-клиента** — `createPrismaClient` в `api/src/db.ts:7-11`.
   До итерации `app.ts` и `test-setup.ts` собирали клиент двумя копиями одного кода;
   с появлением третьего потребителя (seed) сборка вынесена в фабрику — env по-прежнему
   течёт только через `loadConfig` (правило 6).

   ```ts
   export function createPrismaClient() {
   	return new PrismaClient({
   		adapter: new PrismaPg({ connectionString: loadConfig().databaseUrl }),
   	});
   }
   ```

9. **Идемпотентный seed** — `api/prisma/seed.ts:12-13,207-219`. Тридцать осмысленных
   английских тикетов (материал для AI-итераций) с фиксированными UUID вида
   `00000000-0000-4000-8000-…N`; каждый пишется `upsert`'ом, все тридцать — одной
   `$transaction` (один round-trip и атомарность). Регистрация — `migrations.seed:
   "tsx prisma/seed.ts"` в `api/prisma.config.ts`, запуск — `make seed`.

   ```ts
   const seedId = (n: number) =>
   	`00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

   await prisma.$transaction(
   	TICKETS.map((ticket, i) => {
   		const id = seedId(i + 1);
   		return prisma.ticket.upsert({ where: { id }, create: { id, ...ticket },
   			update: ticket });
   	}),
   );
   ```

10. **Тесты итерации** — `api/src/tickets.test.ts` вырос до полного покрытия домена:
    пагинация со стабильными непересекающимися страницами, strict-PATCH (400 на
    `status`), DELETE → 204 → 404, полный жизненный цикл переходов, reopen и 409 с
    проверкой, что тикет не изменился; `api/src/domain/ticket-status.test.ts` держит
    матрицу unit-тестом без БД.
