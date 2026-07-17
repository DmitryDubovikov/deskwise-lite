import { z } from "zod";

// Единственное место чтения env (правило 6, контракт №4: префикс DW_).
// Аналог pydantic Settings: схема = валидация + дефолты.
const ConfigSchema = z.object({
	DW_PORT: z.coerce.number().int().positive().default(3000),
	DW_LOG_LEVEL: z.string().default("info"),
});

export interface Config {
	port: number;
	logLevel: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
	const parsed = ConfigSchema.parse(env);
	return {
		port: parsed.DW_PORT,
		logLevel: parsed.DW_LOG_LEVEL,
	};
}
