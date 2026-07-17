import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
	ErrorResponseSchema,
	errorBody,
	errorResponses,
} from "../schemas/error.js";
import {
	CreateTicketSchema,
	type Ticket,
	TicketSchema,
	TicketStatusSchema,
} from "../schemas/ticket.js";

export const ticketRoutes: FastifyPluginAsyncZod = async (app) => {
	app.post(
		"/tickets",
		{
			schema: {
				body: CreateTicketSchema,
				response: { 201: TicketSchema, ...errorResponses },
			},
		},
		async (request, reply) => {
			const ticket: Ticket = {
				...request.body,
				id: crypto.randomUUID(),
				status: "open",
			};
			app.ticketStore.set(ticket.id, ticket);
			return reply.code(201).send(ticket);
		},
	);

	app.get(
		"/tickets",
		{
			schema: {
				querystring: z.object({ status: TicketStatusSchema.optional() }),
				// dw-lite: голый массив → {items, total, page, limit} (контракт №5, iter 5)
				response: { 200: z.array(TicketSchema), ...errorResponses },
			},
		},
		async (request) => {
			const all = [...app.ticketStore.values()];
			const { status } = request.query;
			return status ? all.filter((ticket) => ticket.status === status) : all;
		},
	);

	app.get(
		"/tickets/:id",
		{
			schema: {
				params: TicketSchema.pick({ id: true }),
				response: {
					200: TicketSchema,
					404: ErrorResponseSchema,
					...errorResponses,
				},
			},
		},
		async (request, reply) => {
			const ticket = app.ticketStore.get(request.params.id);
			if (!ticket) {
				return reply.code(404).send(errorBody("NOT_FOUND", "Ticket not found"));
			}
			return ticket;
		},
	);
};
