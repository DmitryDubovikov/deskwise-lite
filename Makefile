.PHONY: dev stop reinstall test check openapi

dev:
	cd api && pnpm dev

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

test:
	cd api && pnpm test

check:
	cd api && pnpm check
