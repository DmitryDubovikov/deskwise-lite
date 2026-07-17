import { writeFile } from "node:fs/promises";
import { buildServer } from "../src/server.js";

const app = await buildServer();
await app.ready();

const spec = JSON.stringify(app.swagger(), null, 2);
await writeFile(new URL("../openapi.json", import.meta.url), `${spec}\n`);

await app.close();
