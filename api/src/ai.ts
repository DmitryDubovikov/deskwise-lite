import OpenAI from "openai";
import { loadConfig } from "./config.js";
import type { AiDeps } from "./plugins/openai.js";

// Единственная фабрика реального OpenAI-клиента (зеркало createPrismaClient):
// ключ и пиннёный снапшот — только через config (правило 6, контракт №4).
// Клиент ленив — сети нет, пока нет вызова (openapi:emit и тесты не платят).
export function createAiDeps(): AiDeps {
	const config = loadConfig();
	return {
		client: new OpenAI({ apiKey: config.openaiApiKey }),
		model: config.openaiModel,
	};
}
