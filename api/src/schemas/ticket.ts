import { z } from "zod";
import { TICKET_STATUSES } from "../domain/ticket-status.js";

export const TicketStatusSchema = z.enum(TICKET_STATUSES);

export const TicketPrioritySchema = z.enum(["low", "normal", "high"]);

export const TicketSchema = z.object({
	id: z.uuid(),
	subject: z.string().min(1),
	body: z.string().min(1),
	status: TicketStatusSchema,
	priority: TicketPrioritySchema,
});

export const CreateTicketSchema = TicketSchema.pick({
	subject: true,
	body: true,
}).extend({
	priority: TicketPrioritySchema.default("normal"),
});

// strictObject: попытка патчить status (или любое лишнее поле) → явный 400,
// а не тихий стрип — статус меняется только через /transition (контракт №1).
export const UpdateTicketSchema = z
	.strictObject({
		subject: TicketSchema.shape.subject,
		body: TicketSchema.shape.body,
		priority: TicketPrioritySchema,
	})
	.partial();

export const TransitionSchema = z.object({
	to: TicketStatusSchema,
});

// Ответ списка — контракт №5: offset-пагинация {items, total, page, limit}.
export const TicketListSchema = z.object({
	items: z.array(TicketSchema),
	total: z.int().nonnegative(),
	page: z.int().positive(),
	limit: z.int().positive(),
});

export const ListTicketsQuerySchema = z.object({
	status: TicketStatusSchema.optional(),
	page: z.coerce.number().int().positive().default(1),
	limit: z.coerce.number().int().positive().max(100).default(20),
});

export type Ticket = z.infer<typeof TicketSchema>;
