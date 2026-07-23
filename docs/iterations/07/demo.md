# Демо 07 — contract-drift gate: рассинхрон контракта краснеет, синхрон — зелёный

Прогон доказывает **CI contract-drift gate**: регенерация закоммиченного контракта
(`api/openapi.json` + `web/src/generated/`) обязана давать пустой diff, и это проверяет не
дисциплина разработчика, а машина — required status check, без которого PR не мёржится.
Зачем это за пределами демо: у api и web нет shared-типов (правило 5), контракт течёт
только через `openapi.json`, и гейт — единственное, что делает это свойство защищаемым, а
не декларативным. Шаги 1–4 — локальная симуляция ровно тех команд, что гонит CI (workflow
попадает в git коммитом этой итерации, поэтому до push живого прогона ещё не было);
шаги 5–6 — живой GitHub: зелёный прогон на `main` и красный демо-PR. Все команды
запускаются из корня репо: `/Users/dd/projects/pet/deskwise-lite`.

## 1. Гейт на честном состоянии зелёный (и идемпотентный)

Сначала доказываем, что гейт не врёт на чистом дереве: регенерация контракта даёт пустой
diff, и повторный прогон — тоже (гейт, зелёный только на свежем чекауте, был бы враньём).

```bash
make generate && git diff --exit-code api/openapi.json web/src/generated && echo DRIFT-CLEAN-1
make generate && git diff --exit-code api/openapi.json web/src/generated && echo DRIFT-CLEAN-2
```

**Ожидаемо:** оба прогона печатают свой `DRIFT-CLEAN-N` — `tsx scripts/emit-openapi.ts` и
Orval оба раза перегенерили артефакты побайтно в то же содержимое.

## 2. Показать сам гейт, а не только его существование

Смотрим артефакт итерации глазами: три джобы и команду-сравнение — ту самую, что делает
PR красным.

```bash
grep -nE "^  (api|web|contract-drift):" .github/workflows/ci.yml
sed -n '108,112p' .github/workflows/ci.yml
```

**Ожидаемо:** три джобы (`api:` ~строка 21, `web:` ~59, `contract-drift:` ~77); хвост
файла — шаг `contract drift check`:

```
git add -A api/openapi.json web/src/generated
git diff --cached --exit-code
```

## 3. Красный путь локально: правка Zod-схемы без регенерации

Это ядро демо — воспроизводим руками ровно то, что джоба `contract-drift` сделает с
провинившимся PR. Правка сознательно не ломает эмит (ограничение поля, а не
переименование — см. learnings про два красных пути): добавляем `subject` максимум длины,
«забываем» закоммитить регенерированное — и гейт обязан это поймать.

```bash
perl -0pi -e 's/subject: z\.string\(\)\.min\(1\),/subject: z.string().min(1).max(200),/' api/src/schemas/ticket.ts
make generate
git add -A api/openapi.json web/src/generated
git diff --cached --exit-code api/openapi.json web/src/generated > /dev/null; echo "drift-exit=$?"
git diff --cached api/openapi.json | grep -B1 -A1 maxLength | head -8
```

**Ожидаемо:** `drift-exit=1` (в CI этот ненулевой код и есть красная джоба), а фрагмент
diff показывает сам дрифт — в спеку уехало то, чего нет в закоммиченной версии:

```
             "minLength": 1,
+            "maxLength": 200
```

Откат (обязательно — правка временная, домен заморожен). Обратным perl'ом и регенерацией,
затем убеждаемся, что гейт снова зелёный:

```bash
git restore --staged api/openapi.json web/src/generated
perl -0pi -e 's/subject: z\.string\(\)\.min\(1\)\.max\(200\),/subject: z.string().min(1),/' api/src/schemas/ticket.ts
make generate && git diff --exit-code api/openapi.json web/src/generated api/src/schemas/ticket.ts && echo RESTORED-CLEAN
```

**Ожидаемо:** `RESTORED-CLEAN` — схема, спека и клиент вернулись в закоммиченное состояние.

## 4. Branch protection делает джобы обязательными

Гейт без принуждения — просто красный крестик, который можно проигнорировать. Проверяем
(read-only), что `main` требует все три контекста и что владелец при этом не заперт.

```bash
gh api repos/DmitryDubovikov/deskwise-lite/branches/main/protection | jq '{contexts: .required_status_checks.contexts, strict: .required_status_checks.strict, enforce_admins: .enforce_admins.enabled}'
```

**Ожидаемо:**

```json
{
  "contexts": ["api", "web", "contract-drift"],
  "strict": false,
  "enforce_admins": false
}
```

`enforce_admins: false` — осознанно: прямой push владельца в `main` (рабочий цикл семьи)
жив, гейт обязателен для PR.

## 5. Живой зелёный прогон на main — после коммита итерации

*(Шаг выполняется после того, как пользователь закоммитил и запушил итерацию — workflow
должен попасть в `main`, а коммитит пользователь: правило 10.)*

Первый настоящий прогон CI: push в `main` триггерит все три джобы, и на честном состоянии
они обязаны быть зелёными.

```bash
gh run watch --exit-status
gh run list --branch main --limit 1
```

**Ожидаемо:** `gh run watch` доводит прогон до конца с нулевым exit-кодом; в списке —
workflow `CI` со статусом `completed success`, в деталях — зелёные `api`, `web`,
`contract-drift`.

## 6. Красный PR — кадр витрины

*(Тоже после коммита итерации; коммиты на демо-ветке делает пользователь.)*

Финальное доказательство красной нити: PR с правкой схемы без регенерации, который GitHub
отказывается мёржить. Это заявленный кадр витрины («Красный PR: contract-drift gate поймал
рассинхрон» — ROADMAP), поэтому PR после прогона закрываем, но не удаляем.

```bash
git switch -c demo/contract-drift
perl -0pi -e 's/subject: z\.string\(\)\.min\(1\),/subject: z.string().min(1).max(200),/' api/src/schemas/ticket.ts
git commit -am "demo: правка Zod-схемы без регенерации контракта"
git push -u origin demo/contract-drift
gh pr create --title "Demo: contract drift" --body "Правка Zod-схемы без make generate — гейт обязан покраснеть"
gh pr checks --watch
```

**Ожидаемо:** `api` и `web` зелёные (правка не ломает ни тесты, ни закоммиченный клиент),
`contract-drift` — **красный** (`make generate` дал непустой diff — тот же `maxLength`,
что в шаге 3); PR помечен «Merging is blocked» — required status check не пройден.

Уборка (PR остаётся закрытым как артефакт витрины, ветка гасится):

```bash
gh pr close demo/contract-drift --delete-branch
git switch main
```

**Ожидаемо:** локально и на remote ветки `demo/contract-drift` больше нет; закрытый PR
виден в списке `gh pr list --state closed`.
