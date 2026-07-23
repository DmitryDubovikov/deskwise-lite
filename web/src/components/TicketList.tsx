import { useState } from "react";
import { useListTickets } from "../generated/api/tickets/tickets";
import type { TicketStatus } from "../generated/schemas";
import { STATUS_VALUES } from "../lib/ticket-statuses";

const PAGE_LIMIT = 10;

interface TicketListPanelProps {
	selectedId: string | null;
	onSelect: (id: string) => void;
}

export function TicketListPanel({
	selectedId,
	onSelect,
}: TicketListPanelProps) {
	const [status, setStatus] = useState<TicketStatus | "">("");
	const [page, setPage] = useState(1);

	// Typed hook из Orval: params и ответ выведены из openapi.json (контракт №5)
	const query = useListTickets({
		page,
		limit: PAGE_LIMIT,
		...(status ? { status } : {}),
	});
	const list = query.data?.status === 200 ? query.data.data : undefined;
	const totalPages = list ? Math.max(1, Math.ceil(list.total / list.limit)) : 1;

	// Кламп при усыхании total (переход тикета под активным фильтром инвалидирует
	// список): guarded setState во время рендера — канонический adjust-on-change
	if (list && page > totalPages) {
		setPage(totalPages);
	}

	return (
		<section className="list">
			<div className="toolbar">
				<label>
					Status{" "}
					<select
						value={status}
						onChange={(event) => {
							setStatus(event.target.value as TicketStatus | "");
							setPage(1);
						}}
					>
						<option value="">all</option>
						{STATUS_VALUES.map((value) => (
							<option key={value} value={value}>
								{value}
							</option>
						))}
					</select>
				</label>
			</div>
			{query.isPending && <p>Loading…</p>}
			{query.isError && <p className="error">{query.error.error.message}</p>}
			{list && (
				<>
					<ul className="tickets">
						{list.items.map((ticket) => (
							<li key={ticket.id}>
								<button
									type="button"
									className={
										ticket.id === selectedId ? "ticket selected" : "ticket"
									}
									onClick={() => onSelect(ticket.id)}
								>
									<span className={`badge status-${ticket.status}`}>
										{ticket.status}
									</span>
									<span className="subject">{ticket.subject}</span>
									<span className={`badge prio-${ticket.priority}`}>
										{ticket.priority}
									</span>
								</button>
							</li>
						))}
					</ul>
					<nav className="pager">
						<button
							type="button"
							disabled={page <= 1}
							onClick={() => setPage(page - 1)}
						>
							←
						</button>
						<span>
							page {list.page} / {totalPages} · {list.total} tickets
						</span>
						<button
							type="button"
							disabled={page >= totalPages}
							onClick={() => setPage(page + 1)}
						>
							→
						</button>
					</nav>
				</>
			)}
		</section>
	);
}
