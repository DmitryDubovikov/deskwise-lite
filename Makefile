.PHONY: dev test check

dev:
	cd api && pnpm dev

test:
	cd api && pnpm test

check:
	cd api && pnpm check
