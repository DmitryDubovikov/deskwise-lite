import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import type { Ticket } from "./schemas/ticket.js";

const validBody = {
	subject: "Missing items in order #4821",
	body: "Two of the five stapler boxes were not in the parcel.",
};

describe("POST /tickets", () => {
	it("creates a ticket with defaults from the schema", async () => {
		const app = await buildApp();

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
		const app = await buildApp();

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
	it("filters by status", async () => {
		const app = await buildApp();
		await app.inject({ method: "POST", url: "/tickets", payload: validBody });

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

		expect(open.json()).toHaveLength(1);
		expect(closed.json()).toHaveLength(0);
	});

	it("rejects an unknown status with 400", async () => {
		const app = await buildApp();

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
		const app = await buildApp();
		const created = await app.inject({
			method: "POST",
			url: "/tickets",
			payload: validBody,
		});
		const { id } = created.json();

		const response = await app.inject({ method: "GET", url: `/tickets/${id}` });

		expect(response.statusCode).toBe(200);
		expect(response.json()).toEqual(created.json());
	});

	it("returns 404 for an unknown id", async () => {
		const app = await buildApp();

		const response = await app.inject({
			method: "GET",
			url: `/tickets/${crypto.randomUUID()}`,
		});

		expect(response.statusCode).toBe(404);
		expect(response.json().error.code).toBe("NOT_FOUND");
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
		const app = await buildApp({
			ticketStore: new Map([[ticket.id, ticket]]),
		});

		const response = await app.inject({
			method: "GET",
			url: `/tickets/${ticket.id}`,
		});

		expect(response.statusCode).toBe(200);
		expect(response.json()).toEqual(ticket);
	});
});
