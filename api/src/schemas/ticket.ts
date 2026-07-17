import { z } from "zod";

export const TicketStatusSchema = z.enum([
	"open",
	"in_progress",
	"resolved",
	"closed",
]);

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

export type Ticket = z.infer<typeof TicketSchema>;
