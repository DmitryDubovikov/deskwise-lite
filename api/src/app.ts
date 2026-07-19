import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import { PrismaPg } from "@prisma/adapter-pg";
import Fastify, { type FastifyError, type FastifyServerOptions } from "fastify";
import {
	hasZodFastifySchemaValidationErrors,
	jsonSchemaTransform,
	serializerCompiler,
	validatorCompiler,
	type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { loadConfig } from "./config.js";
import { PrismaClient } from "./generated/prisma/client.js";
import { prismaPlugin } from "./plugins/prisma.js";
import { healthRoutes } from "./routes/health.js";
import { ticketRoutes } from "./routes/tickets.js";
import { errorBody } from "./schemas/error.js";

export interface AppDeps {
	prisma?: PrismaClient;
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
	});

	// Интерактивная страница из той же спеки — аналог /docs FastAPI
	await app.register(fastifySwaggerUi, { routePrefix: "/docs" });

	await app.register(healthRoutes);

	// Инкапсулированный tickets-скоуп: prisma (fp-плагин) виден роутам-сиблингам
	// внутри скоупа, но не корню приложения — тест на инкапсуляцию держится за это.
	await app.register(async (tickets) => {
		await tickets.register(prismaPlugin, {
			prisma:
				deps.prisma ??
				new PrismaClient({
					adapter: new PrismaPg({ connectionString: loadConfig().databaseUrl }),
				}),
		});
		await tickets.register(ticketRoutes);
	});

	return app;
}
