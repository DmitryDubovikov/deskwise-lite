import { useQueryClient } from "@tanstack/react-query";
import {
	getGetTicketQueryKey,
	getListTicketsQueryKey,
	useGetTicket,
	useTransitionTicket,
} from "../generated/api/tickets/tickets";
import { STATUS_VALUES } from "../lib/ticket-statuses";

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
	const ticket = query.data?.status === 200 ? query.data.data : undefined;

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
