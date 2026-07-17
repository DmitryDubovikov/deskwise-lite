import { describe, expect, it } from "vitest";
import { buildServer } from "./server.js";

const validBody = {
	subject: "Missing items in order #4821",
	body: "Two of the five stapler boxes were not in the parcel.",
};

describe("POST /tickets", () => {
	it("creates a ticket with defaults from the schema", async () => {
		const app = await buildServer();

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
		const app = await buildServer();

		const response = await app.inject({
			method: "POST",
			url: "/tickets",
			payload: { subject: "" },
		});

		expect(response.statusCode).toBe(400);
	});
});

describe("GET /tickets", () => {
	it("filters by status", async () => {
		const app = await buildServer();
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
		const app = await buildServer();

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
		const app = await buildServer();
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
		const app = await buildServer();

		const response = await app.inject({
			method: "GET",
			url: `/tickets/${crypto.randomUUID()}`,
		});

		expect(response.statusCode).toBe(404);
	});
});

describe("openapi spec", () => {
	it("is generated without a listening server", async () => {
		const app = await buildServer();
		await app.ready();

		const spec = app.swagger();

		expect(spec).toHaveProperty("openapi");
		expect(Object.keys(spec.paths ?? {})).toEqual(
			expect.arrayContaining(["/health", "/tickets", "/tickets/{id}"]),
		);
	});
});
