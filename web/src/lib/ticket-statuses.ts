import { TicketStatus } from "../generated/schemas";

// Все статусы — рантайм-enum из контракта (не из api/: правило 5);
// общий список для фильтра списка и кнопок переходов
export const STATUS_VALUES = Object.values(TicketStatus);
