import { z } from "zod";

// Единый envelope ошибок (контракт №2): {"error": {"code", "message"}}.
// dw-lite: envelope → RFC 9457 problem+json — зафиксированный не-апгрейд.
// .meta({id}) кладёт схему в zod-реестр → components/schemas + $ref в спеке
// (jsonSchemaTransformObject в app.ts) → именованный тип у Orval.
export const ErrorResponseSchema = z
	.object({
		error: z.object({
			code: z.string(),
			message: z.string(),
		}),
	})
	.meta({ id: "ErrorResponse" });

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// Контрактный словарь машинных кодов.
// STREAM_ERROR — единственный код вне HTTP-статусов: ошибка ПОСЛЕ старта
// SSE-стрима (200 уже ушёл) едет кадром event: error с тем же envelope.
export type ErrorCode =
	| "VALIDATION_ERROR"
	| "REQUEST_ERROR"
	| "NOT_FOUND"
	| "CONFLICT"
	| "STREAM_ERROR"
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
