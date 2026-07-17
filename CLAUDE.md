# deskwise-lite — рабочая конституция

> 🎯 **Цель проекта:** добавить в резюме **Node.js/TypeScript-стек** минимальными затратами.
> Node для автора — **«запаска»**: работать на нём он не планирует, поэтому каждая итерация
> обязана оправдывать себя резюме-строкой, а скоуп режется безжалостно. Это **учебный**
> проект: развилки и термины объясняются с нуля, по одному, best practice сверяется с доками.

Это **шестой сиблинг** семьи *-lite. Семья и оси:

- **policywise-lite** — пассивный QA по статике (RAG, LangGraph, eval, observability).
- **dossier-lite** — активный агент, добывающий знание (crew, browser, граф знаний).
- **sentiment-mlops** — классический supervised MLOps (MLflow/Prefect/DVC).
- **triagewise-lite** — LLMOps control plane над одним вызовом (registry, eval-gate, drift, FinOps).
- **authwise-lite** — тот же control plane, объект измерения — путь агента по графу.
- **deskwise-lite** — **знакомые инженерные практики, воспроизведённые на новом рантайме
  (Node/TypeScript), full-stack.**

**Сдвиг сути (держим осознанно).** Пять сиблингов — Python/LLM-ops: там нов был *объект
измерения или техника*, инструменты переиспользовались. Здесь всё наоборот: **ново само
оборудование** (рантайм, язык, фреймворк), поэтому семейное правило «один новый инструмент
на проект» **инвертируется**: минимизируем новые **КОНЦЕПЦИИ**. Каждая концепция проекта
обязана иметь питоний аналог, через который она осваивается (Fastify ≈ FastAPI,
Zod ≈ Pydantic, Prisma ≈ SQLAlchemy+Alembic, vitest+`inject()` ≈ pytest+TestClient,
pino ≈ structlog). Девиз: **«тот же инженерный стандарт, другой рантайм»**.

---

## 🧵 Красная нить: что этот проект кладёт в резюме (north star)

> Главная цель и инвариант. Каждая итерация обязана продвинуть хотя бы один пункт.

**Net-new ПРАКТИКИ (нет ни в одном сиблинге):**

1. **Schema-first Node API** — Zod-схема на роуте = рантайм-валидация + статические типы
   хендлера + OpenAPI, из одного источника.
2. **End-to-end type safety** — сгенерённый Orval typed-клиент (react-query) из OpenAPI;
   изменение схемы на бэке ломает компиляцию фронта.
3. **CI contract-drift gate** — регенерация `openapi.json` + Orval-клиента в CI обязана дать
   пустой diff, иначе мёрдж красный (младший брат path-assertion gate из authwise).
4. **SSE token streaming** — стриминг LLM-токенов Fastify → React; витринная сила Node
   (async I/O), клиент руками — осознанное исключение из автогена.
5. **Fastify-архитектура** — plugin system, инкапсуляция, декораторы как замена
   DI-контейнера, composition root = дерево плагинов + фабрика `buildApp(deps)`.

**Net-new ИНСТРУМЕНТЫ: весь рантайм** (Node, TypeScript, Fastify, Zod, Prisma, React, Vite,
TanStack Query, Orval, vitest, Biome, pnpm) — это и есть позиционирование; правило «новый
инструмент → каркас на освоение» превращается в «одна незнакомая концепция-кластер на
итерацию» (правило 2).

**Что НЕ добавится — не дублировать в резюме:**
- Next.js — уже **nextjs-django-tutors**.
- LLM-ops (evals, промпт-реестры, drift, FinOps, кассеты) — территория **triagewise/authwise**.
- Классификационная AI-фича — рифма с **triagewise**, запрещена (правило 4).

**Резюме-строки, к которым идём (фиксируем сейчас, чтобы не уплыли):**
- *«Built a full-stack TypeScript app (Fastify + React/Vite behind nginx, Docker Compose):
  a schema-first API where Zod route schemas drive runtime validation, static handler types,
  and generated OpenAPI — consumed by an Orval-generated typed react-query client for
  end-to-end type safety, enforced by a CI contract-drift gate.»*
- *«Integrated OpenAI into the service: a typed JSON endpoint through the same generated
  contract, plus an SSE endpoint streaming completion tokens from Fastify to React.»*
- Стек-строка: `Node.js · TypeScript · Fastify · Zod · Prisma · PostgreSQL · React · Vite ·
  TanStack Query · Orval (OpenAPI codegen) · SSE · OpenAI API · nginx · Docker Compose ·
  Vitest · Biome · GitHub Actions`

---

## Главные правила

1. **Existence-gate, не accuracy-gate.** Итерация готова, когда техника *работает и видна*:
   спека генерится скриптом, CI реально краснеет на дрифте контракта, токены реально летят в
   UI. **Качество AI-ответов — НЕ ворота.** Сознательный срез помечай
   `# dw-lite: <потолок> → <апгрейд>`.

   **Красная линия (что gate НЕ разрешает резать):** корректность демонстрируемой техники;
   контракт api↔web только через `openapi.json` (правило 5); направление зависимостей
   (правило 6); утечка секретов; честность резюме-строк.

2. **Одна незнакомая концепция-кластер на итерацию.** Незнакомое — то, чего нет в
   Python-опыте автора (tsconfig/ESM, type provider, инкапсуляция плагинов, Prisma-цикл,
   SSE-стриминг). Знакомое оборудование (docker, nginx, compose, Postgres, Makefile,
   GitHub Actions) — **бесплатно**, вводится там, где удобно, и итерацию не нагружает.
   Объём кода ≠ когнитивная нагрузка: «много печатания, ноль нового» — не повод делить.

3. **Домен — фикстура.** Вымышленная компания **Fernwood Supplies** (интернет-магазин
   канцтоваров), поток — тикеты клиентской поддержки (English product, Russian docs).
   Тикеты: `subject`, `body`, `status`, `priority`; **state machine статусов заморожена**
   (матрица переходов — ROADMAP → «Сквозные контракты»), переход — отдельный не-CRUD
   эндпоинт. **Домен заморожен после iter 5:** новых сущностей и полей не добавляем,
   масштаб — числом тикетов в seed.

4. **AI — фича фикстуры, не ось.** Официальный `openai` npm SDK напрямую, один дешёвый
   **пиннёный снапшот** (имя матчит `-\d{4}-\d{2}-\d{2}$` — пин-гейт семьи), `temperature=0`,
   промпты — константы в коде. Фичи **генеративные** (summarize, suggest-reply), не
   классификация. Никаких LangChain / evals / промпт-реестров / кассет record-replay:
   в тестах OpenAI **мокается на границе** (фейковый клиент аргументом в `buildApp`),
   CI — без сети и $0. Live-вызовы — копейки (весь проект <$1), но перед батч-прогонами
   с расходом — спросить.

5. **Контракт api↔web — только `openapi.json`.** `web/` никогда не импортирует TypeScript
   из `api/`; общих (shared) пакетов нет — **это дизайн-фича, а не ограничение**: типы фронта
   рождаются из спеки (Orval), иначе герой-пайплайн — декорация. Следствия: без pnpm
   workspaces (`api/` и `web/` — независимые пакеты, свои lockfile, Makefile сверху,
   тривиальные Dockerfile); **DTO ≠ модель БД** — Zod-схемы пишутся руками, автогенераторы
   Zod-из-Prisma запрещены (API-контракт и схема хранения обязаны уметь расходиться).

6. **Слои и швы (фиксируем один раз).** Composition root — дерево плагинов в `app.ts` +
   фабрика `buildApp(deps)`; зависимости (Prisma-клиент, OpenAI-клиент) — аргументами и
   декораторами Fastify, **DI-контейнеров нет** (awilix и т.п. — не тащим). Domain-логика
   (state machine переходов и пр.) — чистые функции без импорта Fastify/Prisma; хендлеры
   тонкие: валидация — схемой, логика — в domain/сервисе, I/O — через декорированных
   клиентов. Env читается **только** в config-модуле (аналог `Settings`), префикс `DW_`.

7. **Наглядность — свойство финала, не итераций.** Итерации не обязаны производить
   визуальные артефакты, но обязаны не закрывать путь к кадрам витрины
   (ROADMAP → «Витрина»). Материал собирается один раз, при сборке showcase-README.

8. **Verify the artifact, not the vibe.** Спека — фактом сгенерённого `openapi.json` и его
   diff'ом; гейт — фактом красного CI; стриминг — `curl -N`; UI — для витрины.

9. **`jq` вместо `python3 -c`** для разбора JSON в shell.

10. **Коммиты:** автор — пользователь. Никогда не добавляй `Co-Authored-By: Claude`.

## Цикл итерации

Как в семье: `/iterationStart N` (спека `specs/NN/spec.md` → реализация → ревью-пайплайн →
`/simplify`) → `/iterationClose N` (церемония: `make check` → доки `docs/iterations/NN/` →
ROADMAP → стейдж + предложенный commit-месседж) → пользователь коммитит. Скиллы и
ревью-агенты **портируются из authwise-lite и адаптируются под Node** (make-цели, структура)
в рамках iter 0. Каждая спека цитирует строку «🧵 красная нить» из ROADMAP и следует
сквозным контрактам (ROADMAP → «Сквозные контракты») — локально переизобретать их нельзя.

## Что осознанно НЕ делаем

NestJS/Express (выбран Fastify — Стек) · Next.js (дубль tutors) · **auth/JWT/роли** (решение
2026-07-12: не окупается для «запаски») · DI-контейнер · pnpm workspaces / Turborepo / Nx ·
shared-пакет типов между api и web (правило 5) · автоген Zod из Prisma (правило 5) ·
LangChain / evals / промпт-реестры / LLM-кассеты (правило 4) · классификационная AI-фича ·
WebSockets (SSE достаточно) · SQLite (enum Prisma не поддерживает — Postgres везде) ·
ESLint+Prettier (Biome — один инструмент) · prod-deploy / k8s · GraphQL / tRPC.

## Стек: развилки уже решены (2026-07-12)

- **Fastify** (не NestJS — учили бы фреймворк, а не Node; не Express — schema-first и
  автоген OpenAPI умирают). Аналог FastAPI: схема на роуте → валидация + типы + спека.
- **Zod v4 через `fastify-type-provider-zod`** (+ `jsonSchemaTransform` для
  `@fastify/swagger`), не TypeBox: резюме-частотность Zod несравнимо выше, конверсия в
  JSON Schema с v4 — строка сетапа. Перформанс TypeBox для фикстуры не играет.
- **Prisma + PostgreSQL везде** (dev/тесты/CI — GH Actions service container): у Prisma нет
  enum на SQLite, два диалекта = враньё в тестах.
- **React + Vite SPA** (Next уже в tutors) + **TanStack Query** (клиент генерит Orval).
- **Orval** (`react-query`, `tags-split`, `customFetch`-мутатор — конфиг переносится из
  nextjs-django-tutors почти дословно), вход — закоммиченный `api/openapi.json`.
- **SSE** для стриминга suggest-reply; клиент этого одного эндпоинта — руками
  (OpenAPI/Orval стриминг не описывают — фиксируем как осознанное исключение и материал
  для доки «почему»).
- **nginx** — единая точка входа: статика `web/` + прокси `/api/` (compose).
- **vitest + `fastify.inject()`** — pytest + TestClient; **Biome** — линт+формат одним
  инструментом; **pnpm** без workspaces; **tsx** — dev-watch.
- **openai** npm SDK напрямую, снапшот пиннится в env (`DW_OPENAI_MODEL`).

**Не пересматривать без явного решения.**
