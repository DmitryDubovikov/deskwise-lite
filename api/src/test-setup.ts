import { afterAll, beforeEach } from "vitest";
import type { App } from "./app.js";
import { createPrismaClient } from "./db.js";
import type { AiDeps } from "./plugins/openai.js";
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

// Мок на границе (правило 4, контракт №7): фейк реализует узкий интерфейс
// плагина — ни сети, ни каста; захватывает параметры вызовов. Один фейк на оба
// метода границы: summarize зовёт create (text), suggest-reply — stream (deltas;
// fail — упасть после выдачи всех deltas, для ошибки посреди стрима).
export function fakeAi(opts: {
	text?: string;
	deltas?: string[];
	fail?: boolean;
}) {
	const calls: Array<{ model: string; input: string; temperature: number }> =
		[];
	const ai: AiDeps = {
		model: "gpt-fake-0000-00-00",
		client: {
			responses: {
				create: async (params) => {
					calls.push(params);
					return { output_text: opts.text ?? "" };
				},
				stream: (params) => {
					calls.push(params);
					return (async function* () {
						yield { type: "response.created" };
						for (const delta of opts.deltas ?? []) {
							yield { type: "response.output_text.delta", delta };
						}
						if (opts.fail) {
							throw new Error("upstream connection lost");
						}
						yield { type: "response.completed" };
					})();
				},
			},
		},
	};
	return { ai, calls };
}
