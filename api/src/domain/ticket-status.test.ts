import { describe, expect, it } from "vitest";
import { canTransition, TICKET_STATUSES } from "./ticket-status.js";

// Полная матрица переходов (контракт №1) — единственный источник истины проверяется
// перебором всех пар, а не выборочными примерами.
const ALLOWED = new Set([
	"open→in_progress",
	"in_progress→resolved",
	"resolved→closed",
	"resolved→in_progress",
]);

describe("canTransition", () => {
	it.each(
		TICKET_STATUSES.flatMap((from) =>
			TICKET_STATUSES.map((to) => [from, to] as const),
		),
	)("%s → %s matches the frozen matrix", (from, to) => {
		expect(canTransition(from, to)).toBe(ALLOWED.has(`${from}→${to}`));
	});
});
