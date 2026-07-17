import fastifySwagger from "@fastify/swagger";
import Fastify from "fastify";
import {
	jsonSchemaTransform,
	serializerCompiler,
	validatorCompiler,
	type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { z } from "zod";
import {
	CreateTicketSchema,
	type Ticket,
	TicketSchema,
	TicketStatusSchema,
} from "./schemas/ticket.js";

export async function buildServer() {
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

	// dw-lite: in-memory Map → Prisma/Postgres (iter 4)
	const tickets = new Map<string, Ticket>();

	app.get(
		"/health",
		{ schema: { response: { 200: z.object({ status: z.literal("ok") }) } } },
		async () => ({ status: "ok" as const }),
	);

	app.post(
		"/tickets",
		{ schema: { body: CreateTicketSchema, response: { 201: TicketSchema } } },
		async (request, reply) => {
			const ticket: Ticket = {
				...request.body,
				id: crypto.randomUUID(),
				status: "open",
			};
			tickets.set(ticket.id, ticket);
			return reply.code(201).send(ticket);
		},
	);

	app.get(
		"/tickets",
		{
			schema: {
				querystring: z.object({ status: TicketStatusSchema.optional() }),
				// dw-lite: голый массив → {items, total, page, limit} (контракт №5, iter 5)
				response: { 200: z.array(TicketSchema) },
			},
		},
		async (request) => {
			const all = [...tickets.values()];
			const { status } = request.query;
			return status ? all.filter((ticket) => ticket.status === status) : all;
		},
	);

	app.get(
		"/tickets/:id",
		{
			schema: {
				params: z.object({ id: z.uuid() }),
				response: {
					200: TicketSchema,
					// dw-lite: plain message → error envelope №2 (iter 3)
					404: z.object({ message: z.string() }),
				},
			},
		},
		async (request, reply) => {
			const ticket = tickets.get(request.params.id);
			if (!ticket) {
				return reply.code(404).send({ message: "Ticket not found" });
			}
			return ticket;
		},
	);

	return app;
}
