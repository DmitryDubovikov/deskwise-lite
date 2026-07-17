import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = await buildApp({ logger: { level: config.logLevel } });

try {
	await app.listen({ port: config.port, host: "0.0.0.0" });
} catch (err) {
	app.log.error(err);
	process.exit(1);
}
