import { describe, expect, it } from "vitest";
import { type App, buildApp } from "./app.js";
import type { PrismaClient } from "./generated/prisma/client.js";
import type { Ticket } from "./schemas/ticket.js";
import { prisma } from "./test-setup.js";

const validBody = {
	subject: "Missing items in order #4821",
	body: "Two of the five stapler boxes were not in the parcel.",
};

async function createTicket(app: App) {
	const response = await app.inject({
		method: "POST",
		url: "/tickets",
		payload: validBody,
	});
	return response.json<Ticket>();
}

describe("POST /tickets", () => {
	it("creates a ticket with defaults from the schema", async () => {
		const app = await buildApp({ prisma });

		const response = await app.inject({
			method: "POST",
			url: "/tickets",
			payload: validBody,
		});

		expect(response.statusCode).toBe(201);
		expect(response.json()).toMatchObject({
			...validBody,
			status: "open",
			priority: "normal",
		});
	});

	it("rejects an invalid body with 400 automatically", async () => {
		const app = await buildApp({ prisma });

		const response = await app.inject({
			method: "POST",
			url: "/tickets",
			payload: { subject: "" },
		});

		expect(response.statusCode).toBe(400);
		expect(response.json().error.code).toBe("VALIDATION_ERROR");
	});
});

describe("GET /tickets", () => {
	it("returns the paginated envelope and filters by status", async () => {
		const app = await buildApp({ prisma });
		await createTicket(app);

		const open = await app.inject({
			method: "GET",
			url: "/tickets",
			query: { status: "open" },
		});
		const closed = await app.inject({
			method: "GET",
			url: "/tickets",
			query: { status: "closed" },
		});

		expect(open.json()).toMatchObject({ total: 1, page: 1, limit: 20 });
		expect(open.json().items).toHaveLength(1);
		expect(closed.json()).toMatchObject({ total: 0, items: [] });
	});

	it("splits results into pages of `limit` size", async () => {
		const app = await buildApp({ prisma });
		for (let i = 0; i < 3; i++) await createTicket(app);

		const page1 = await app.inject({
			method: "GET",
			url: "/tickets",
			query: { page: "1", limit: "2" },
		});
		const page2 = await app.inject({
			method: "GET",
			url: "/tickets",
			query: { page: "2", limit: "2" },
		});

		expect(page1.json()).toMatchObject({ total: 3, page: 1, limit: 2 });
		expect(page1.json().items).toHaveLength(2);
		expect(page2.json().items).toHaveLength(1);
		// Страницы не пересекаются — порядок стабилен (orderBy id)
		const ids = [...page1.json().items, ...page2.json().items].map(
			(t: Ticket) => t.id,
		);
		expect(new Set(ids).size).toBe(3);
	});

	it("rejects an unknown status with 400", async () => {
		const app = await buildApp({ prisma });

		const response = await app.inject({
			method: "GET",
			url: "/tickets",
			query: { status: "?" },
		});

		expect(response.statusCode).toBe(400);
	});
});

describe("GET /tickets/:id", () => {
	it("returns a created ticket by id", async () => {
		const app = await buildApp({ prisma });
		const created = await createTicket(app);

		const response = await app.inject({
			method: "GET",
			url: `/tickets/${created.id}`,
		});

		expect(response.statusCode).toBe(200);
		expect(response.json()).toEqual(created);
	});

	it("returns 404 for an unknown id", async () => {
		const app = await buildApp({ prisma });

		const response = await app.inject({
			method: "GET",
			url: `/tickets/${crypto.randomUUID()}`,
		});

		expect(response.statusCode).toBe(404);
		expect(response.json().error.code).toBe("NOT_FOUND");
	});
});

describe("PATCH /tickets/:id", () => {
	it("updates provided fields and keeps the rest", async () => {
		const app = await buildApp({ prisma });
		const created = await createTicket(app);

		const response = await app.inject({
			method: "PATCH",
			url: `/tickets/${created.id}`,
			payload: { priority: "high" },
		});

		expect(response.statusCode).toBe(200);
		expect(response.json()).toEqual({ ...created, priority: "high" });
	});

	it("rejects a status field with 400 (transitions only via /transition)", async () => {
		const app = await buildApp({ prisma });
		const created = await createTicket(app);

		const response = await app.inject({
			method: "PATCH",
			url: `/tickets/${created.id}`,
			payload: { status: "closed" },
		});

		expect(response.statusCode).toBe(400);
		expect(response.json().error.code).toBe("VALIDATION_ERROR");
	});

	it("returns 404 for an unknown id", async () => {
		const app = await buildApp({ prisma });

		const response = await app.inject({
			method: "PATCH",
			url: `/tickets/${crypto.randomUUID()}`,
			payload: { priority: "low" },
		});

		expect(response.statusCode).toBe(404);
	});
});

describe("DELETE /tickets/:id", () => {
	it("deletes a ticket and returns 204", async () => {
		const app = await buildApp({ prisma });
		const created = await createTicket(app);

		const del = await app.inject({
			method: "DELETE",
			url: `/tickets/${created.id}`,
		});
		const get = await app.inject({
			method: "GET",
			url: `/tickets/${created.id}`,
		});

		expect(del.statusCode).toBe(204);
		expect(get.statusCode).toBe(404);
	});

	it("returns 404 for an unknown id", async () => {
		const app = await buildApp({ prisma });

		const response = await app.inject({
			method: "DELETE",
			url: `/tickets/${crypto.randomUUID()}`,
		});

		expect(response.statusCode).toBe(404);
	});
});

describe("POST /tickets/:id/transition", () => {
	async function transition(app: App, id: string, to: string) {
		return app.inject({
			method: "POST",
			url: `/tickets/${id}/transition`,
			payload: { to },
		});
	}

	it("walks the full lifecycle open → in_progress → resolved → closed", async () => {
		const app = await buildApp({ prisma });
		const { id } = await createTicket(app);

		for (const to of ["in_progress", "resolved", "closed"]) {
			const response = await transition(app, id, to);
			expect(response.statusCode).toBe(200);
			expect(response.json().status).toBe(to);
		}
	});

	it("allows reopening: resolved → in_progress", async () => {
		const app = await buildApp({ prisma });
		const { id } = await createTicket(app);
		await transition(app, id, "in_progress");
		await transition(app, id, "resolved");

		const response = await transition(app, id, "in_progress");

		expect(response.statusCode).toBe(200);
		expect(response.json().status).toBe("in_progress");
	});

	it("rejects an invalid transition with 409 CONFLICT", async () => {
		const app = await buildApp({ prisma });
		const { id } = await createTicket(app);

		const response = await transition(app, id, "closed");

		expect(response.statusCode).toBe(409);
		expect(response.json().error.code).toBe("CONFLICT");
		// Тикет не изменился
		const get = await app.inject({ method: "GET", url: `/tickets/${id}` });
		expect(get.json().status).toBe("open");
	});

	it("rejects an unknown target status with 400", async () => {
		const app = await buildApp({ prisma });
		const { id } = await createTicket(app);

		const response = await transition(app, id, "archived");

		expect(response.statusCode).toBe(400);
	});

	it("returns 404 for an unknown id", async () => {
		const app = await buildApp({ prisma });

		const response = await transition(app, crypto.randomUUID(), "in_progress");

		expect(response.statusCode).toBe(404);
	});
});

describe("buildApp(deps) with a fake store", () => {
	it("serves tickets from the injected store without POST", async () => {
		const ticket: Ticket = {
			id: crypto.randomUUID(),
			subject: "Wrong paper size delivered",
			body: "Ordered A4, received A5 reams.",
			status: "in_progress",
			priority: "high",
		};
		const fakePrisma = {
			ticket: {
				findUnique: async ({ where }: { where: { id: string } }) =>
					where.id === ticket.id ? ticket : null,
			},
		} as unknown as PrismaClient;
		const app = await buildApp({ prisma: fakePrisma });

		const response = await app.inject({
			method: "GET",
			url: `/tickets/${ticket.id}`,
		});

		expect(response.statusCode).toBe(200);
		expect(response.json()).toEqual(ticket);
	});
});
