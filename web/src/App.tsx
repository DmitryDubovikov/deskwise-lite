import { useState } from "react";
import { TicketDetail } from "./components/TicketDetail";
import { TicketListPanel } from "./components/TicketList";

// dw-lite: master-detail на useState → react-router (срез спеки 06)
export function App() {
	const [selectedId, setSelectedId] = useState<string | null>(null);

	return (
		<>
			<header>
				<h1>Fernwood Supplies — Support</h1>
			</header>
			<main className="layout">
				<TicketListPanel selectedId={selectedId} onSelect={setSelectedId} />
				{selectedId ? (
					<TicketDetail id={selectedId} />
				) : (
					<section className="detail placeholder">
						<p>Select a ticket to see details.</p>
					</section>
				)}
			</main>
		</>
	);
}
