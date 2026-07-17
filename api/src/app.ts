import fastifySwagger from "@fastify/swagger";
import Fastify from "fastify";
import {
	jsonSchemaTransform,
	serializerCompiler,
	validatorCompiler,
	type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { type TicketStore, ticketStorePlugin } from "./plugins/ticket-store.js";
import { healthRoutes } from "./routes/health.js";
import { ticketRoutes } from "./routes/tickets.js";

export interface AppDeps {
	ticketStore?: TicketStore;
}

// Composition root (правило 6): дерево плагинов; зависимости — аргументами и декораторами.
export async function buildApp(deps: AppDeps = {}) {
	const app = Fastify().withTypeProvider<ZodTypeProvider>();

	app.setValidatorCompiler(validatorCompiler);
	app.setSerializerCompiler(serializerCompiler);

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

	await app.register(healthRoutes);

	// Инкапсулированный tickets-скоуп: store (fp-плагин) виден роутам-сиблингам
	// внутри скоупа, но не корню приложения — тест на инкапсуляцию держится за это.
	await app.register(async (tickets) => {
		await tickets.register(ticketStorePlugin, {
			store: deps.ticketStore ?? new Map(),
		});
		await tickets.register(ticketRoutes);
	});

	return app;
}
