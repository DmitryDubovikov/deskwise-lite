import { useQueryClient } from "@tanstack/react-query";
import {
	getGetTicketQueryKey,
	getListTicketsQueryKey,
	useGetTicket,
	useSummarizeTicket,
	useTransitionTicket,
} from "../generated/api/tickets/tickets";
import { STATUS_VALUES } from "../lib/ticket-statuses";
import { useSuggestReplyStream } from "../lib/use-suggest-reply-stream";

export function TicketDetail({ id }: { id: string }) {
	const queryClient = useQueryClient();
	const query = useGetTicket(id);
	const transition = useTransitionTicket({
		mutation: {
			onSuccess: () => {
				// Точечная инвалидация: деталь + все страницы/фильтры списка
				// (ключ без params — префикс всех listTickets-ключей)
				void queryClient.invalidateQueries({
					queryKey: getGetTicketQueryKey(id),
				});
				void queryClient.invalidateQueries({
					queryKey: getListTicketsQueryKey(),
				});
			},
		},
	});
	// AI-эндпоинт через тот же сгенерённый typed-хук, что и CRUD (красная нить iter 8)
	const summarize = useSummarizeTicket();
	// SSE-стрим — ручной хук вне автогена (красная нить iter 9, заметка №6)
	const suggestReply = useSuggestReplyStream(id);
	const ticket = query.data?.status === 200 ? query.data.data : undefined;
	const summary =
		summarize.data?.status === 200 ? summarize.data.data.summary : undefined;

	if (query.isPending) {
		return (
			<section className="detail">
				<p>Loading…</p>
			</section>
		);
	}
	if (query.isError) {
		return (
			<section className="detail">
				<p className="error">{query.error.error.message}</p>
			</section>
		);
	}
	if (!ticket) {
		return null;
	}

	return (
		<section className="detail">
			<h2>{ticket.subject}</h2>
			<p className="meta">
				<span className={`badge status-${ticket.status}`}>{ticket.status}</span>
				<span className={`badge prio-${ticket.priority}`}>
					{ticket.priority}
				</span>
			</p>
			<p className="body">{ticket.body}</p>
			<div className="ai-action">
				<button
					type="button"
					disabled={summarize.isPending}
					onClick={() => summarize.mutate({ id })}
				>
					{summarize.isPending ? "Summarizing…" : "Summarize"}
				</button>
				{summary && <p className="summary">{summary}</p>}
				{summarize.isError && (
					<p className="error">{summarize.error.error.message}</p>
				)}
			</div>
			<div className="ai-action">
				<button
					type="button"
					disabled={suggestReply.isStreaming}
					onClick={() => void suggestReply.start()}
				>
					{suggestReply.isStreaming ? "Streaming…" : "Suggest reply"}
				</button>
				{suggestReply.text && <p className="reply">{suggestReply.text}</p>}
				{suggestReply.error && <p className="error">{suggestReply.error}</p>}
			</div>
			{/* Матрица переходов живёт только в домене api: кнопки не фильтруются,
			    недопустимый переход честно показывает 409 из envelope (№1/№2) */}
			<div className="transitions">
				{STATUS_VALUES.filter((value) => value !== ticket.status).map((to) => (
					<button
						key={to}
						type="button"
						disabled={transition.isPending}
						onClick={() => transition.mutate({ id, data: { to } })}
					>
						→ {to}
					</button>
				))}
			</div>
			{transition.isError && (
				<p className="error">{transition.error.error.message}</p>
			)}
		</section>
	);
}
