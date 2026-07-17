import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import type { Ticket } from "./schemas/ticket.js";

describe("error envelope (контракт №2)", () => {
	it("maps malformed JSON to 400 VALIDATION_ERROR, not FST_* codes", async () => {
		const app = await buildApp();

		const response = await app.inject({
			method: "POST",
			url: "/tickets",
			headers: { "content-type": "application/json" },
			payload: "{not json",
		});

		expect(response.statusCode).toBe(400);
		expect(response.json().error.code).toBe("VALIDATION_ERROR");
	});

	it("wraps unknown routes as 404 NOT_FOUND", async () => {
		const app = await buildApp();

		const response = await app.inject({ method: "GET", url: "/nope" });

		expect(response.statusCode).toBe(404);
		expect(response.json().error.code).toBe("NOT_FOUND");
	});

	it("wraps handler exceptions as 500 without leaking details", async () => {
		class ThrowingStore extends Map<string, Ticket> {
			override get(_id: string): Ticket | undefined {
				throw new Error("secret internal detail");
			}
		}
		const app = await buildApp({ ticketStore: new ThrowingStore() });

		const response = await app.inject({
			method: "GET",
			url: `/tickets/${crypto.randomUUID()}`,
		});

		expect(response.statusCode).toBe(500);
		expect(response.json()).toEqual({
			error: {
				code: "INTERNAL_SERVER_ERROR",
				message: "Internal server error",
			},
		});
	});
});

describe("structured logging", () => {
	it("writes JSON lines with a reqId for each request", async () => {
		const lines: string[] = [];
		const app = await buildApp({
			logger: {
				level: "info",
				stream: {
					write: (line: string) => {
						lines.push(line);
					},
				},
			},
		});

		await app.inject({ method: "GET", url: "/health" });

		const requestLines = lines
			.map((line) => JSON.parse(line))
			.filter((entry) => entry.reqId);
		expect(requestLines.length).toBeGreaterThan(0);
	});
});

describe("openapi error schemas", () => {
	it("documents the envelope on 400/404/500", async () => {
		const app = await buildApp();
		await app.ready();

		const spec = app.swagger();
		const responses = spec.paths?.["/tickets/{id}"]?.get?.responses ?? {};

		expect(Object.keys(responses)).toEqual(
			expect.arrayContaining(["200", "400", "404", "500"]),
		);
	});
});

describe("GET /docs", () => {
	it("serves the swagger-ui page from the same spec", async () => {
		const app = await buildApp();

		const response = await app.inject({ method: "GET", url: "/docs/" });

		expect(response.statusCode).toBe(200);
		expect(response.headers["content-type"]).toContain("text/html");
	});
});
