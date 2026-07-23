import { z } from "zod";
import { TICKET_STATUSES } from "../domain/ticket-status.js";

export const TicketStatusSchema = z.enum(TICKET_STATUSES);

export const TicketPrioritySchema = z.enum(["low", "normal", "high"]);

// .meta({id}) → components/schemas + $ref в openapi.json → именованные типы
// у Orval (Ticket, TicketList, …) вместо инлайновых listTickets200ItemsItem
export const TicketSchema = z
	.object({
		id: z.uuid(),
		subject: z.string().min(1),
		body: z.string().min(1),
		status: TicketStatusSchema,
		priority: TicketPrioritySchema,
		assignee: z.string().optional(),
	})
	.meta({ id: "Ticket" });

export const CreateTicketSchema = TicketSchema.pick({
	subject: true,
	body: true,
})
	.extend({
		priority: TicketPrioritySchema.default("normal"),
	})
	.meta({ id: "CreateTicket" });

// strictObject: попытка патчить status (или любое лишнее поле) → явный 400,
// а не тихий стрип — статус меняется только через /transition (контракт №1).
export const UpdateTicketSchema = z
	.strictObject({
		subject: TicketSchema.shape.subject,
		body: TicketSchema.shape.body,
		priority: TicketPrioritySchema,
	})
	.partial()
	.meta({ id: "UpdateTicket" });

// DTO summarize-ответа: summary не хранится в БД (домен заморожен, правило 3) —
// считается по требованию и живёт только в контракте.
export const TicketSummarySchema = z
	.object({
		summary: z.string(),
	})
	.meta({ id: "TicketSummary" });

export const TransitionSchema = z
	.object({
		to: TicketStatusSchema,
	})
	.meta({ id: "TransitionRequest" });

// Ответ списка — контракт №5: offset-пагинация {items, total, page, limit}.
export const TicketListSchema = z
	.object({
		items: z.array(TicketSchema),
		total: z.int().nonnegative(),
		page: z.int().positive(),
		limit: z.int().positive(),
	})
	.meta({ id: "TicketList" });

export const ListTicketsQuerySchema = z.object({
	status: TicketStatusSchema.optional(),
	page: z.coerce.number().int().positive().default(1),
	limit: z.coerce.number().int().positive().max(100).default(20),
});

export type Ticket = z.infer<typeof TicketSchema>;
