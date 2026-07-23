import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { canTransition } from "../domain/ticket-status.js";
import { Prisma } from "../generated/prisma/client.js";
import {
	ErrorResponseSchema,
	errorBody,
	errorResponses,
} from "../schemas/error.js";
import {
	CreateTicketSchema,
	ListTicketsQuerySchema,
	TicketListSchema,
	TicketSchema,
	TicketSummarySchema,
	TransitionSchema,
	UpdateTicketSchema,
} from "../schemas/ticket.js";

const IdParamsSchema = TicketSchema.pick({ id: true });

// Промпт — константа в коде (правило 4): без реестров и шаблонизаторов.
const SUMMARIZE_PROMPT =
	"You are a support assistant at Fernwood Supplies, an office-supplies " +
	"e-commerce store. Summarize the customer support ticket below in one or " +
	"two plain sentences for a busy support agent. Reply with the summary only.";

const TICKET_NOT_FOUND = errorBody("NOT_FOUND", "Ticket not found");

// P2025 — «запись не найдена» у атомарных update/delete: один запрос вместо
// пары findUnique+мутация; канон 404 для мутаций в этом файле.
const isRecordNotFound = (error: unknown) =>
	error instanceof Prisma.PrismaClientKnownRequestError &&
	error.code === "P2025";

export const ticketRoutes: FastifyPluginAsyncZod = async (app) => {
	app.post(
		"/tickets",
		{
			schema: {
				// tags+operationId — для потребителя контракта: tags-split-раскладка Orval
				// и человеческие имена хуков (useCreateTicket и т.д.)
				tags: ["tickets"],
				operationId: "createTicket",
				body: CreateTicketSchema,
				response: { 201: TicketSchema, ...errorResponses },
			},
		},
		async (request, reply) => {
			const ticket = await app.prisma.ticket.create({ data: request.body });
			return reply.code(201).send(ticket);
		},
	);

	app.get(
		"/tickets",
		{
			schema: {
				tags: ["tickets"],
				operationId: "listTickets",
				querystring: ListTicketsQuerySchema,
				response: { 200: TicketListSchema, ...errorResponses },
			},
		},
		async (request) => {
			const { status, page, limit } = request.query;
			const where = status ? { status } : undefined;
			// orderBy id — стабильный порядок страниц (createdAt нет: домен заморожен)
			const [items, total] = await Promise.all([
				app.prisma.ticket.findMany({
					where,
					orderBy: { id: "asc" },
					skip: (page - 1) * limit,
					take: limit,
				}),
				app.prisma.ticket.count({ where }),
			]);
			return { items, total, page, limit };
		},
	);

	app.get(
		"/tickets/:id",
		{
			schema: {
				tags: ["tickets"],
				operationId: "getTicket",
				params: IdParamsSchema,
				response: {
					200: TicketSchema,
					404: ErrorResponseSchema,
					...errorResponses,
				},
			},
		},
		async (request, reply) => {
			const ticket = await app.prisma.ticket.findUnique({
				where: { id: request.params.id },
			});
			if (!ticket) {
				return reply.code(404).send(TICKET_NOT_FOUND);
			}
			return ticket;
		},
	);

	app.patch(
		"/tickets/:id",
		{
			schema: {
				tags: ["tickets"],
				operationId: "updateTicket",
				params: IdParamsSchema,
				body: UpdateTicketSchema,
				response: {
					200: TicketSchema,
					404: ErrorResponseSchema,
					...errorResponses,
				},
			},
		},
		async (request, reply) => {
			try {
				return await app.prisma.ticket.update({
					where: { id: request.params.id },
					data: request.body,
				});
			} catch (error) {
				if (isRecordNotFound(error)) {
					return reply.code(404).send(TICKET_NOT_FOUND);
				}
				throw error;
			}
		},
	);

	app.delete(
		"/tickets/:id",
		{
			schema: {
				tags: ["tickets"],
				operationId: "deleteTicket",
				params: IdParamsSchema,
				response: {
					204: z.null(),
					404: ErrorResponseSchema,
					...errorResponses,
				},
			},
		},
		async (request, reply) => {
			try {
				await app.prisma.ticket.delete({ where: { id: request.params.id } });
			} catch (error) {
				if (isRecordNotFound(error)) {
					return reply.code(404).send(TICKET_NOT_FOUND);
				}
				throw error;
			}
			return reply.code(204).send(null);
		},
	);

	// Переход статуса — только здесь (контракт №1): матрица — чистая domain-функция,
	// недопустимый переход → 409 CONFLICT в envelope.
	app.post(
		"/tickets/:id/transition",
		{
			schema: {
				tags: ["tickets"],
				operationId: "transitionTicket",
				params: IdParamsSchema,
				body: TransitionSchema,
				response: {
					200: TicketSchema,
					404: ErrorResponseSchema,
					409: ErrorResponseSchema,
					...errorResponses,
				},
			},
		},
		async (request, reply) => {
			const { id } = request.params;
			const { to } = request.body;
			// findUnique нужен: canTransition требует текущий статус до мутации
			const ticket = await app.prisma.ticket.findUnique({ where: { id } });
			if (!ticket) {
				return reply.code(404).send(TICKET_NOT_FOUND);
			}
			if (!canTransition(ticket.status, to)) {
				return reply
					.code(409)
					.send(
						errorBody(
							"CONFLICT",
							`Cannot transition ticket from '${ticket.status}' to '${to}'`,
						),
					);
			}
			return app.prisma.ticket.update({ where: { id }, data: { status: to } });
		},
	);

	// AI-эндпоинт неотличим от обычного (красная нить iter 8): та же Zod-схема
	// ответа → та же спека → тот же Orval-хук. Детерминизм — контракт №7.
	app.post(
		"/tickets/:id/summarize",
		{
			schema: {
				tags: ["tickets"],
				operationId: "summarizeTicket",
				params: IdParamsSchema,
				response: {
					200: TicketSummarySchema,
					404: ErrorResponseSchema,
					...errorResponses,
				},
			},
		},
		async (request, reply) => {
			const ticket = await app.prisma.ticket.findUnique({
				where: { id: request.params.id },
			});
			if (!ticket) {
				return reply.code(404).send(TICKET_NOT_FOUND);
			}
			const response = await app.ai.client.responses.create({
				model: app.ai.model,
				input: `${SUMMARIZE_PROMPT}\n\nSubject: ${ticket.subject}\n\n${ticket.body}`,
				temperature: 0,
			});
			return { summary: response.output_text };
		},
	);
};
