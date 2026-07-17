import { describe, expect, it } from "vitest";
import { buildServer } from "./server.js";

describe("GET /health", () => {
	it("returns ok status", async () => {
		const app = await buildServer();

		const response = await app.inject({ method: "GET", url: "/health" });

		expect(response.statusCode).toBe(200);
		expect(response.json()).toEqual({ status: "ok" });
	});
});
