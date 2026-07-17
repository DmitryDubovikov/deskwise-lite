import fp from "fastify-plugin";
import type { Ticket } from "../schemas/ticket.js";

// dw-lite: in-memory Map → Prisma-клиент (iter 4)
export type TicketStore = Map<string, Ticket>;

declare module "fastify" {
	interface FastifyInstance {
		ticketStore: TicketStore;
	}
}

interface TicketStoreOptions {
	store: TicketStore;
}

// fastify-plugin снимает инкапсуляцию с самого плагина: декоратор ложится в контекст,
// ГДЕ плагин зарегистрирован (tickets-скоуп в app.ts), и выше не протекает.
export const ticketStorePlugin = fp<TicketStoreOptions>(
	async (app, opts) => {
		app.decorate("ticketStore", opts.store);
	},
	{ name: "ticket-store" },
);
