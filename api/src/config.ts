import "dotenv/config";
import { z } from "zod";

// Единственное место чтения env (правило 6, контракт №4: префикс DW_).
// dotenv здесь же наполняет process.env из .env — не отдельным шагом до config.ts,
// иначе граница правила 6 размывается на два места.
// Аналог pydantic Settings: схема = валидация + дефолты.
const ConfigSchema = z.object({
	DW_PORT: z.coerce.number().int().positive().default(3000),
	DW_LOG_LEVEL: z.string().default("info"),
	DW_DATABASE_URL: z.string().min(1),
	DW_OPENAI_API_KEY: z.string().min(1),
	// Пин-гейт семьи: только датированный снапшот (…-YYYY-MM-DD), никаких
	// плавающих алиасов вроде gpt-4.1-nano — ответы должны быть воспроизводимы
	DW_OPENAI_MODEL: z
		.string()
		.regex(/-\d{4}-\d{2}-\d{2}$/, "pinned snapshot required (…-YYYY-MM-DD)"),
});

export interface Config {
	port: number;
	logLevel: string;
	databaseUrl: string;
	openaiApiKey: string;
	openaiModel: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
	const parsed = ConfigSchema.parse(env);
	return {
		port: parsed.DW_PORT,
		logLevel: parsed.DW_LOG_LEVEL,
		databaseUrl: parsed.DW_DATABASE_URL,
		openaiApiKey: parsed.DW_OPENAI_API_KEY,
		openaiModel: parsed.DW_OPENAI_MODEL,
	};
}
