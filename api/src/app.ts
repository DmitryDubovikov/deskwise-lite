import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyError, type FastifyServerOptions } from "fastify";
import {
	hasZodFastifySchemaValidationErrors,
	jsonSchemaTransform,
	jsonSchemaTransformObject,
	serializerCompiler,
	validatorCompiler,
	type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { createAiDeps } from "./ai.js";
import { createPrismaClient } from "./db.js";
import type { PrismaClient } from "./generated/prisma/client.js";
import { type AiDeps, openaiPlugin } from "./plugins/openai.js";
import { prismaPlugin } from "./plugins/prisma.js";
import { healthRoutes } from "./routes/health.js";
import { ticketRoutes } from "./routes/tickets.js";
import { errorBody } from "./schemas/error.js";

export interface AppDeps {
	prisma?: PrismaClient;
	// OpenAI-клиент + пиннёный снапшот; в тестах — фейк (мок на границе, правило 4)
	ai?: AiDeps;
	// Конфиг встроенного pino: false в тестах, JSON-лог с уровнем из config в проде
	logger?: FastifyServerOptions["logger"];
}

// Composition root (правило 6): дерево плагинов; зависимости — аргументами и декораторами.
export async function buildApp(deps: AppDeps = {}) {
	const app = Fastify({
		logger: deps.logger ?? false,
	}).withTypeProvider<ZodTypeProvider>();

	app.setValidatorCompiler(validatorCompiler);
	app.setSerializerCompiler(serializerCompiler);

	// Все ошибки — в envelope контракта №2; 500 не течёт внутренностями наружу.
	app.setErrorHandler<FastifyError>((error, request, reply) => {
		if (hasZodFastifySchemaValidationErrors(error)) {
			return reply.code(400).send(errorBody("VALIDATION_ERROR", error.message));
		}
		if (error.statusCode && error.statusCode < 500) {
			// Транспортные коды Fastify (FST_ERR_CTP_* — битый JSON, content-type)
			// не выносим в контрактный словарь кодов
			const code = error.code?.startsWith("FST_ERR_CTP")
				? "VALIDATION_ERROR"
				: "REQUEST_ERROR";
			return reply.code(error.statusCode).send(errorBody(code, error.message));
		}
		request.log.error({ err: error }, "unhandled error");
		return reply
			.code(500)
			.send(errorBody("INTERNAL_SERVER_ERROR", "Internal server error"));
	});

	app.setNotFoundHandler((request, reply) =>
		reply
			.code(404)
			.send(
				errorBody(
					"NOT_FOUND",
					`Route ${request.method} ${request.url} not found`,
				),
			),
	);

	// await: свагеровский onRoute-хук должен встать до объявления роутов,
	// иначе они не попадут в спеку
	await app.register(fastifySwagger, {
		openapi: {
			info: {
				title: "deskwise-lite API",
				description: "Support ticket API for Fernwood Supplies",
				version: "0.1.0",
			},
		},
		transform: jsonSchemaTransform,
		// Два шага над готовым документом:
		// 1) jsonSchemaTransformObject — схемы с .meta({id}) из zod-реестра →
		//    components/schemas + $ref (именованные типы у Orval);
		// 2) 204 по HTTP — без тела, но fastify-type-provider-zod сериализует z.null()
		//    в псевдо-content {enum: [null]} — вычищаем, иначе контракт обещает Orval
		//    JSON-тело, которого в ответе нет.
		// transformObject правит и openapi.json (openapi:emit), и /docs —
		// один источник, оба потребителя.
		transformObject: (doc) => {
			const spec = jsonSchemaTransformObject(doc);
			for (const pathItem of Object.values(spec.paths ?? {})) {
				for (const operation of Object.values(pathItem ?? {})) {
					const noContent = (
						operation as { responses?: Record<string, { content?: unknown }> }
					).responses?.[204];
					if (noContent) {
						noContent.content = undefined;
					}
				}
			}
			return spec;
		},
	});

	// Интерактивная страница из той же спеки — аналог /docs FastAPI
	await app.register(fastifySwaggerUi, { routePrefix: "/docs" });

	await app.register(healthRoutes);

	// Инкапсулированный tickets-скоуп: prisma (fp-плагин) виден роутам-сиблингам
	// внутри скоупа, но не корню приложения — тест на инкапсуляцию держится за это.
	await app.register(async (tickets) => {
		await tickets.register(prismaPlugin, {
			prisma: deps.prisma ?? createPrismaClient(),
		});
		await tickets.register(openaiPlugin, deps.ai ?? createAiDeps());
		await tickets.register(ticketRoutes);
	});

	return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
