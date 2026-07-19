import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { prisma } from "./test-setup.js";

describe("GET /health", () => {
	it("returns ok status", async () => {
		const app = await buildApp({ prisma });

		const response = await app.inject({ method: "GET", url: "/health" });

		expect(response.statusCode).toBe(200);
		expect(response.json()).toEqual({ status: "ok" });
	});
});

describe("plugin encapsulation", () => {
	it("keeps prisma invisible outside the tickets scope", async () => {
		const app = await buildApp({ prisma });
		await app.ready();

		expect(app.hasDecorator("prisma")).toBe(false);
	});
});

describe("openapi spec", () => {
	it("is generated without a listening server", async () => {
		const app = await buildApp({ prisma });
		await app.ready();

		const spec = app.swagger();

		expect(spec).toHaveProperty("openapi");
		expect(Object.keys(spec.paths ?? {})).toEqual(
			expect.arrayContaining(["/health", "/tickets", "/tickets/{id}"]),
		);
	});
});
