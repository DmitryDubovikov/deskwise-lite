import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { createTicket, fakeAi, prisma } from "./test-setup.js";

// inject() копит весь SSE-ответ (стрим фейка конечен) — ассертим кадры целиком:
// порядок дельт, терминатор, wire-формат из спеки 09.
describe("POST /tickets/:id/suggest-reply", () => {
	it("streams delta frames in order and terminates with [DONE]", async () => {
		const { ai, calls } = fakeAi({ deltas: ["Hi ", "there", "!"] });
		const app = await buildApp({ prisma, ai });
		const ticket = await createTicket(app);

		const response = await app.inject({
			method: "POST",
			url: `/tickets/${ticket.id}/suggest-reply`,
		});

		expect(response.statusCode).toBe(200);
		expect(response.headers["content-type"]).toBe("text/event-stream");
		expect(response.body).toBe(
			'data: {"delta":"Hi "}\n\n' +
				'data: {"delta":"there"}\n\n' +
				'data: {"delta":"!"}\n\n' +
				"data: [DONE]\n\n",
		);
		// Детерминизм — контракт №7: пиннёный снапшот из deps, temperature=0,
		// тело тикета доехало до промпта.
		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatchObject({
			model: "gpt-fake-0000-00-00",
			temperature: 0,
		});
		expect(calls[0]?.input).toContain(ticket.subject);
		expect(calls[0]?.input).toContain(ticket.body);
	});

	it("emits an error frame instead of [DONE] when the stream fails midway", async () => {
		const { ai } = fakeAi({ deltas: ["Partial"], fail: true });
		const app = await buildApp({ prisma, ai });
		const ticket = await createTicket(app);

		const response = await app.inject({
			method: "POST",
			url: `/tickets/${ticket.id}/suggest-reply`,
		});

		// Статус 200 уже ушёл с первым кадром — ошибка едет SSE-кадром в envelope
		expect(response.statusCode).toBe(200);
		expect(response.body).toContain('data: {"delta":"Partial"}');
		expect(response.body).toContain(
			`event: error\ndata: ${JSON.stringify({
				error: { code: "STREAM_ERROR", message: "AI stream failed" },
			})}`,
		);
		expect(response.body).not.toContain("[DONE]");
	});

	it("returns 404 in the envelope without calling the AI client", async () => {
		const { ai, calls } = fakeAi({ deltas: ["should never stream"] });
		const app = await buildApp({ prisma, ai });

		const response = await app.inject({
			method: "POST",
			url: "/tickets/00000000-0000-0000-0000-000000000000/suggest-reply",
		});

		expect(response.statusCode).toBe(404);
		expect(response.json().error.code).toBe("NOT_FOUND");
		expect(calls).toHaveLength(0);
	});
});
