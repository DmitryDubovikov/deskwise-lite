import { PrismaPg } from "@prisma/adapter-pg";
import { loadConfig } from "./config.js";
import { PrismaClient } from "./generated/prisma/client.js";

// Единственная фабрика PrismaClient: app (fallback в deps), test-setup и seed
// собирают клиент одинаково. Env — по-прежнему только через config (правило 6).
export function createPrismaClient() {
	return new PrismaClient({
		adapter: new PrismaPg({ connectionString: loadConfig().databaseUrl }),
	});
}
