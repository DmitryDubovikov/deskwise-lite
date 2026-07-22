import { z } from "zod";

// Единый envelope ошибок (контракт №2): {"error": {"code", "message"}}.
// dw-lite: envelope → RFC 9457 problem+json — зафиксированный не-апгрейд.
export const ErrorResponseSchema = z.object({
	error: z.object({
		code: z.string(),
		message: z.string(),
	}),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// Контрактный словарь машинных кодов
export type ErrorCode =
	| "VALIDATION_ERROR"
	| "REQUEST_ERROR"
	| "NOT_FOUND"
	| "CONFLICT"
	| "INTERNAL_SERVER_ERROR";

export function errorBody(code: ErrorCode, message: string): ErrorResponse {
	return { error: { code, message } };
}

// Коды, которые может вернуть любой роут с валидируемым входом;
// специфичные (404/409) добавляются в response-мапу роута точечно
export const errorResponses = {
	400: ErrorResponseSchema,
	500: ErrorResponseSchema,
};
