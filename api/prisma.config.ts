import "dotenv/config";
import { defineConfig } from "prisma/config";

// Env-конвенция проекта — префикс DW_ (контракт №4). Приложение читает env только
// в src/config.ts; здесь — исключение для Prisma CLI (migrate/generate), который
// работает вне рантайма приложения и не проходит через buildApp.
export default defineConfig({
	schema: "prisma/schema.prisma",
	migrations: {
		path: "prisma/migrations",
		seed: "tsx prisma/seed.ts",
	},
	datasource: {
		url: process.env.DW_DATABASE_URL,
	},
});
