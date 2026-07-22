import { afterAll, beforeEach } from "vitest";
import { createPrismaClient } from "./db.js";

// Один общий PrismaClient/pg-пул на весь тестовый прогон (не по одному на
// buildApp()) — тесты, которым нужна реальная БД, передают его явно как
// deps.prisma. Таблицу чистим перед каждым тестом, чтобы прогоны не зависели
// друг от друга и от порядка.
export const prisma = createPrismaClient();

beforeEach(async () => {
	await prisma.ticket.deleteMany();
});

afterAll(async () => {
	await prisma.$disconnect();
});
