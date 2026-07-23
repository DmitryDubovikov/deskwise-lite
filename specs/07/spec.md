# Итерация 07 — CI contract-drift gate

> 🎯 Тот же инженерный стандарт, другой рантайм. Existence-gate, не accuracy-gate.

## Цель
Сделать контракт api↔web **защищаемым**, а не декларативным: CI регенерит `openapi.json` и
Orval-клиент и требует пустой diff — рассинхрон схемы и закоммиченного контракта краснит PR.

## 🧵 Красная нить (резюме)
**«CI contract-drift gate»** — Actions: biome + vitest (postgres service) + регенерация
`openapi.json` и Orval-клиента + `git diff --exit-code`; branch protection; демо: правка
Zod-схемы без регенерации → PR красный; докам — «почему коммитим сгенерённое».

## Питоний аналог
Eval-gate CI сиблингов (triagewise/authwise): CI-джоба, которая воспроизводит артефакт и
падает на расхождении. Разница по формуле ROADMAP — «артефакт вместо пути»: гейт держится
за закоммиченный `openapi.json` + `web/src/generated`, а не за трассу агента.

## Новая концепция (и минимальный объём)
- **Contract-drift gate** — регенерация закоммиченных сгенерённых артефактов в CI +
  `git diff --exit-code` как механическая замена shared-типам (правило 5). Механика
  GitHub Actions + postgres service container знакома (бесплатна, правило 2); CI **зеркалит
  Makefile** (`make check`, `make generate`), а не изобретает свои команды.

## Done-gate (по факту существования)
- `.github/workflows/ci.yml`, три джобы на `pull_request` + `push` в `main`:
  1. **api** — pnpm install → biome → tsc → `prisma migrate deploy` → vitest
     (postgres:17 service container, `DW_DATABASE_URL` на него);
  2. **web** — pnpm install → biome → tsc (Orval-клиент уже в git);
  3. **contract-drift** — `openapi:emit` → `generate:api` → `git diff --exit-code` по
     `api/openapi.json` и `web/src/generated` (включая новые/удалённые файлы).
- Branch protection на `main`: required status checks = три джобы; `enforce_admins` выкл —
  прямой push владельца (рабочий цикл семьи) жив.
- Идемпотентность: повторный `make generate` на чистом дереве → пустой diff
  (проверено до написания CI — иначе гейт врал бы).
- **Демо красного PR** — на `/iterationClose` (workflow должен сначала попасть в `main`,
  а коммитит пользователь): ветка с правкой Zod-схемы без регенерации → contract-drift
  красный. Дока «почему коммитим сгенерённое» — в `docs/iterations/07/` при close.
+ ревью-пайплайн чист (CRITICAL/BUG = 0).

## Шаги
1. `.github/workflows/ci.yml` — три джобы, команды 1:1 из Makefile/package.json.
2. Локальная симуляция шагов CI (`make check`, `make generate` + чистый diff).
3. Branch protection через `gh api` (команду задокументировать в спеке/доке — она
   воспроизводима, не кликомышь).
4. Ревью-пайплайн (general + constitution → аудитор → фиксы → `/simplify`).

## Branch protection (применено 2026-07-23, воспроизводимо)
```sh
gh api -X PUT repos/DmitryDubovikov/deskwise-lite/branches/main/protection --input - <<'EOF'
{
  "required_status_checks": { "strict": false, "contexts": ["api", "web", "contract-drift"] },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null
}
EOF
```

## Вне scope
Docker-build в CI · деплой · coverage/отчёты · dependabot/renovate · кэш-тюнинг сверх
штатного `setup-node` cache · сам красный демо-PR (close-смок) · любые правки домена/API.
