// customFetch-мутатор для Orval-хуков (перенос из tutors, без auth).
// Префикс /api срезается прокси (Vite dev и nginx одинаково — контракт №6).

import type { ErrorResponse } from "../generated/schemas";

// implements ErrorResponse (type-only импорт — стирается при сборке, рантайм-цикла
// с generated/ нет): Orval типизирует ошибку хука как ErrorResponse, компилятор
// гарантирует, что рантайм-исключение совпадает с ним (query.error.error.message)
export class ApiError extends Error implements ErrorResponse {
	constructor(
		public status: number,
		public error: ErrorResponse["error"],
	) {
		super(`${error.code}: ${error.message}`);
		this.name = "ApiError";
	}
}

export async function customFetch<T>(
	url: string,
	options: RequestInit = {},
): Promise<T> {
	// Инвариант мутатора: всё, что из него вылетает, — ApiError формы ErrorResponse
	// (компоненты рендерят error.error.message без проверок). Поэтому и сетевой
	// отказ fetch (TypeError без .error) оборачивается здесь же.
	let response: Response;
	try {
		response = await fetch(`/api${url}`, {
			...options,
			headers: {
				...(options.body ? { "Content-Type": "application/json" } : {}),
				...options.headers,
			},
		});
	} catch (cause) {
		throw new ApiError(0, {
			code: "NETWORK_ERROR",
			message:
				cause instanceof Error ? cause.message : "Network request failed",
		});
	}

	if (!response.ok) {
		const body = (await response
			.json()
			.catch(() => null)) as ErrorResponse | null;
		throw new ApiError(
			response.status,
			body?.error ?? {
				code: "UNKNOWN",
				message: `HTTP ${response.status} ${response.statusText}`,
			},
		);
	}

	// 204 — без тела (DELETE)
	const data = response.status === 204 ? undefined : await response.json();
	return { data, status: response.status, headers: response.headers } as T;
}
