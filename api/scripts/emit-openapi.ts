import { writeFile } from "node:fs/promises";
import { buildApp } from "../src/app.js";

const app = await buildApp();
await app.ready();

const spec = JSON.stringify(app.swagger(), null, 2);
await writeFile(new URL("../openapi.json", import.meta.url), `${spec}\n`);

await app.close();
