import fp from "fastify-plugin";

// Событие стрима — ровно то, что читает suggest-reply: у дельт текста есть
// delta, служебные события (created/completed/…) отфильтровываются по type.
export interface ResponseStreamEventLike {
	type: string;
	delta?: string;
}

// Узкий структурный интерфейс — ровно то, что зовут хендлеры. Официальный
// OpenAI-клиент ему соответствует, а фейк в тестах — три строки без сети и
// кастов (мок на границе, правило 4). Стриминг — отдельным методом stream()
// (есть у SDK), а не create({stream: true}): оверлоады в узком интерфейсе
// заставили бы фейк кастовать.
export interface OpenAIResponsesClient {
	responses: {
		create(params: {
			model: string;
			input: string;
			temperature: number;
		}): Promise<{ output_text: string }>;
		stream(params: {
			model: string;
			input: string;
			temperature: number;
		}): AsyncIterable<ResponseStreamEventLike>;
	};
}

// Клиент и пиннёный снапшот ездят вместе: модель — часть зависимости,
// а не параметр каждого вызова из env (контракт №4: env только в config).
export interface AiDeps {
	client: OpenAIResponsesClient;
	model: string;
}

declare module "fastify" {
	interface FastifyInstance {
		ai: AiDeps;
	}
}

// fastify-plugin, как у prisma: декоратор ложится в контекст, ГДЕ плагин
// зарегистрирован (tickets-скоуп в app.ts), и выше не протекает.
export const openaiPlugin = fp<AiDeps>(
	async (app, opts) => {
		app.decorate("ai", { client: opts.client, model: opts.model });
	},
	{ name: "openai" },
);
