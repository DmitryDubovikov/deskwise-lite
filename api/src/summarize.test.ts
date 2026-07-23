import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { createTicket, fakeAi, prisma } from "./test-setup.js";

describe("POST /tickets/:id/summarize", () => {
	it("returns the summary from the AI client for an existing ticket", async () => {
		const { ai, calls } = fakeAi({
			text: "Customer is missing two stapler boxes.",
		});
		const app = await buildApp({ prisma, ai });
		const ticket = await createTicket(app);

		const response = await app.inject({
			method: "POST",
			url: `/tickets/${ticket.id}/summarize`,
		});

		expect(response.statusCode).toBe(200);
		expect(response.json()).toEqual({
			summary: "Customer is missing two stapler boxes.",
		});
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

	it("returns 404 in the envelope without calling the AI client", async () => {
		const { ai, calls } = fakeAi({ text: "should never be produced" });
		const app = await buildApp({ prisma, ai });

		const response = await app.inject({
			method: "POST",
			url: "/tickets/00000000-0000-0000-0000-000000000000/summarize",
		});

		expect(response.statusCode).toBe(404);
		expect(response.json().error.code).toBe("NOT_FOUND");
		expect(calls).toHaveLength(0);
	});
});
