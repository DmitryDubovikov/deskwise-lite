import Fastify from "fastify";

export function buildServer() {
	const app = Fastify();

	app.get("/health", async () => ({ status: "ok" }));

	return app;
}
