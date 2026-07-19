import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeEach } from "vitest";
import { loadConfig } from "./config.js";
import { PrismaClient } from "./generated/prisma/client.js";

// Один общий PrismaClient/pg-пул на весь тестовый прогон (не по одному на
// buildApp()) — тесты, которым нужна реальная БД, передают его явно как
// deps.prisma. Таблицу чистим перед каждым тестом, чтобы прогоны не зависели
// друг от друга и от порядка.
export const prisma = new PrismaClient({
	adapter: new PrismaPg({ connectionString: loadConfig().databaseUrl }),
});

beforeEach(async () => {
	await prisma.ticket.deleteMany();
});

afterAll(async () => {
	await prisma.$disconnect();
});
