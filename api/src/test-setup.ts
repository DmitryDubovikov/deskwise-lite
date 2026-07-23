import { afterAll, beforeEach } from "vitest";
import type { App } from "./app.js";
import { createPrismaClient } from "./db.js";
import type { Ticket } from "./schemas/ticket.js";

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

// Общая фикстура и хелпер создания тикета — один источник для всех *.test.ts
export const validBody = {
	subject: "Missing items in order #4821",
	body: "Two of the five stapler boxes were not in the parcel.",
};

export async function createTicket(app: App) {
	const response = await app.inject({
		method: "POST",
		url: "/tickets",
		payload: validBody,
	});
	return response.json<Ticket>();
}
