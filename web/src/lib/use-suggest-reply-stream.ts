// Ручной SSE-клиент suggest-reply — ОСОЗНАННОЕ исключение из автогена (заметка
// №6 ROADMAP, спека 09): OpenAPI/Orval стриминг не описывают, роут скрыт из
// контракта — это граница контракт-подхода. fetch-reader, а не EventSource:
// EventSource умеет только GET и авто-reconnect'ом повторно триггерил бы платную
// генерацию. Wire-формат — из спеки 09: data: {"delta":…} / data: [DONE] /
// event: error + envelope.

import { useState } from "react";
import type { ErrorResponse } from "../generated/schemas";
import { API_PREFIX, ApiError, errorFromResponse } from "./api-client";

// Кадр wire-формата спеки 09 — максимум одна строка event и одна data
function parseFrame(raw: string) {
	let event = "message";
	let data = "";
	for (const line of raw.split("\n")) {
		if (line.startsWith("event: ")) {
			event = line.slice("event: ".length);
		} else if (line.startsWith("data: ")) {
			data = line.slice("data: ".length);
		}
	}
	return { event, data };
}

export function useSuggestReplyStream(id: string) {
	const [text, setText] = useState("");
	const [isStreaming, setIsStreaming] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const start = async () => {
		setText("");
		setError(null);
		setIsStreaming(true);
		try {
			const response = await fetch(
				`${API_PREFIX}/tickets/${id}/suggest-reply`,
				{ method: "POST" },
			);
			if (!response.ok || !response.body) {
				// До старта стрима ошибки — обычный JSON-envelope (404 и т.п.):
				// та же инфраструктура не-ok-ответов, что у customFetch
				throw await errorFromResponse(response);
			}
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";
			for (;;) {
				const { done, value } = await reader.read();
				if (done) {
					// Сюда попадаем только если тело кончилось БЕЗ [DONE]/error-кадра
					// (те выходят из start раньше) — обрыв, а не полный ответ
					throw new Error("Stream ended unexpectedly");
				}
				// Кадры разделены пустой строкой; хвост буфера — недокачанный кадр
				buffer += decoder.decode(value, { stream: true });
				const parts = buffer.split("\n\n");
				buffer = parts.pop() ?? "";
				for (const part of parts) {
					const frame = parseFrame(part);
					if (frame.event === "error") {
						const envelope = JSON.parse(frame.data) as ErrorResponse;
						throw new ApiError(response.status, envelope.error);
					}
					if (frame.data === "[DONE]") {
						return;
					}
					const { delta } = JSON.parse(frame.data) as { delta: string };
					setText((prev) => prev + delta);
				}
			}
		} catch (cause) {
			// ApiError несёт envelope — показываем его message, как компоненты
			setError(
				cause instanceof ApiError
					? cause.error.message
					: cause instanceof Error
						? cause.message
						: "Stream failed",
			);
		} finally {
			setIsStreaming(false);
		}
	};

	return { text, isStreaming, error, start };
}
