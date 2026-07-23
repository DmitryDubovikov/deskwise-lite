.PHONY: dev web-dev stop reinstall test check openapi generate db-up db-down up migrate seed

dev:
	cd api && pnpm dev

# Фронт в dev-режиме (Vite :5173, прокси /api → localhost:3000 — нужен `make dev` рядом)
web-dev:
	cd web && pnpm dev

# Полный стек: nginx :8080 (статика web + прокси /api/) + api + db.
# Без дефолтных provenance-аттестаций BuildKit: они встраивают timestamp сборки,
# из-за чего кэшированный билд давал бы новый image ID и повторный `make up`
# пересоздавал бы контейнеры вместо no-op (compose `provenance: false` не помог).
up:
	BUILDX_NO_DEFAULT_ATTESTATIONS=1 docker compose up -d --build

# Postgres из docker-compose.yml (сервис db) — нужен для тестов и dev (DW_DATABASE_URL).
db-up:
	docker compose up -d db

db-down:
	docker compose down

migrate:
	cd api && pnpm db:migrate

# Идемпотентный seed ~30 тикетов (фиксированные id + upsert)
seed:
	cd api && pnpm db:seed

# Заглушить dev-сервер (tsx-watch), поднятый `make dev`. tsx поднимает дерево процессов
# (watch-обёртка + дочерний слушатель порта), у которых в командной строке нет строки
# "tsx watch" целиком — поэтому бьём по абсолютному пути ЭТОГО репо + src/index.ts:
# паттерн ловит всё дерево и только его. `|| true` — чтобы цель не падала, когда сервер
# не запущен (pkill без совпадений возвращает ненулевой код).
stop:
	pkill -f "$(CURDIR)/api.*src/index.ts" || true

# Чистая переустановка зависимостей api/ (снести node_modules и поставить заново из lock).
reinstall:
	cd api && rm -rf node_modules && pnpm install

openapi:
	cd api && pnpm openapi:emit

# Контракт-пайплайн целиком: openapi.json → Orval-клиент (drift-gate iter 7 гоняет это же)
generate: openapi
	cd web && pnpm generate:api

test:
	cd api && pnpm test

check:
	cd api && pnpm check
	cd web && pnpm check
