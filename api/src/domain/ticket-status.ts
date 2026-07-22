// State machine статусов (контракт №1) — чистый domain-модуль без Fastify/Prisma
// (правило 6). Zod-схема статуса в schemas/ticket.ts строится из TICKET_STATUSES:
// схема зависит от домена, не наоборот.
export const TICKET_STATUSES = [
	"open",
	"in_progress",
	"resolved",
	"closed",
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

// open → in_progress → resolved → closed, reopen: resolved → in_progress.
// Терминал — closed. Матрица заморожена (ROADMAP → «Сквозные контракты» №1).
const ALLOWED_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
	open: ["in_progress"],
	in_progress: ["resolved"],
	resolved: ["closed", "in_progress"],
	closed: [],
};

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
	return ALLOWED_TRANSITIONS[from].includes(to);
}
