import { createPrismaClient } from "../src/db.js";
// Seed пишет в БД — типы enum'ов берём из generated-клиента (её слой), не из domain
import type {
	TicketPriority,
	TicketStatus,
} from "../src/generated/prisma/enums.js";

// Seed ~30 синтетических тикетов Fernwood Supplies (ROADMAP → «Домен / фикстура»).
// Фиксированные id + upsert → идемпотентность: повторный прогон возвращает канон,
// дублей не плодит. Тела осмысленные — материал для summarize/suggest-reply (iter 8–9).

const seedId = (n: number) =>
	`00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

interface SeedTicket {
	subject: string;
	body: string;
	status: TicketStatus;
	priority: TicketPriority;
}

const TICKETS: SeedTicket[] = [
	{
		subject: "Missing items in order #4913",
		body: "I received my delivery today but two of the five stapler boxes are missing from the parcel. The packing slip lists all five. Could you send the missing two or refund the difference?",
		status: "open",
		priority: "high",
	},
	{
		subject: "Damaged whiteboard on arrival",
		body: "The 120x90 cm magnetic whiteboard from order #4790 arrived with a cracked corner and a deep scratch across the surface. The outer box was visibly dented. I need a replacement before our office opening next week.",
		status: "open",
		priority: "high",
	},
	{
		subject: "Wrong paper size delivered",
		body: "We ordered 20 reams of A4 80gsm copy paper but received A5 instead. Our printers cannot use A5. Please arrange a swap; we are happy to hand the A5 reams back to the courier.",
		status: "in_progress",
		priority: "normal",
	},
	{
		subject: "Invoice needed for order #4756",
		body: "Our accounting department requires a VAT invoice for order #4756 placed on June 30th. The order confirmation email only contains a receipt. Could you email a proper invoice to accounting@brightdesk.example?",
		status: "resolved",
		priority: "normal",
	},
	{
		subject: "Bulk discount for 200 notebooks",
		body: "We are planning to order around 200 spiral notebooks (ref FN-1123) for a conference in September. Do you offer tiered pricing for orders of this size, and what would the lead time be?",
		status: "open",
		priority: "normal",
	},
	{
		subject: "Ink cartridges leaking in the box",
		body: "Three of the ten black ink cartridges from order #4802 were leaking inside their blister packs. The ink stained the rest of the shipment. I have photos if that helps with the claim.",
		status: "in_progress",
		priority: "high",
	},
	{
		subject: "Cancel duplicate order #4835",
		body: "I accidentally submitted my basket twice and now have two identical orders, #4834 and #4835. Please cancel #4835 before it ships — the payment has already been charged for both.",
		status: "resolved",
		priority: "high",
	},
	{
		subject: "Question about eco-friendly pen range",
		body: "Your catalogue mentions a recycled-plastic pen line but the product pages do not say what percentage of the material is recycled. Do you have certificates or spec sheets you could share? We have a sustainability policy for procurement.",
		status: "open",
		priority: "low",
	},
	{
		subject: "Late delivery for order #4744",
		body: "Order #4744 was placed twelve days ago with an estimated delivery of five working days. The tracking page has shown 'in transit' for over a week with no updates. Where is my parcel?",
		status: "in_progress",
		priority: "normal",
	},
	{
		subject: "Return unopened label printer",
		body: "We bought a label printer (ref FN-8802) two weeks ago but ended up standardising on a different model office-wide. The unit is unopened in its original packaging. What is the return procedure and is there a restocking fee?",
		status: "open",
		priority: "normal",
	},
	{
		subject: "Stapler jams constantly",
		body: "The heavy-duty stapler from order #4711 jams on almost every second use, even with the recommended 24/6 staples. I have cleared it a dozen times following the manual. This looks like a defective unit.",
		status: "resolved",
		priority: "normal",
	},
	{
		subject: "Update billing address on account",
		body: "Our company moved offices last month and invoices still show the old address, which our auditors flag. Please update the billing address on our account to 42 Harbour Road, Unit 7, and confirm.",
		status: "closed",
		priority: "low",
	},
	{
		subject: "Missing free shipping promo",
		body: "Your homepage banner advertised free shipping on orders over 50 for July, but order #4841 was charged 6.90 for delivery despite a 72 total. Could you refund the shipping fee?",
		status: "open",
		priority: "normal",
	},
	{
		subject: "Sticky notes arrived in wrong colours",
		body: "We ordered the pastel assortment of sticky notes but received the neon assortment instead. Not urgent, but the pastel set was specifically requested by our design team for a workshop. Can we exchange them?",
		status: "closed",
		priority: "low",
	},
	{
		subject: "Paper shredder stopped working",
		body: "The cross-cut shredder (ref FN-5540) purchased three months ago powers on but the blades no longer turn. It handled only light use, well below the stated duty cycle. I assume this is covered by the two-year warranty.",
		status: "in_progress",
		priority: "high",
	},
	{
		subject: "Request for product catalogue 2026",
		body: "We are reviewing suppliers for the next fiscal year. Could you send the full 2026 product catalogue with trade pricing as a PDF? We are particularly interested in desk organisation and archiving products.",
		status: "closed",
		priority: "low",
	},
	{
		subject: "Charged twice for order #4808",
		body: "My card statement shows two identical charges for order #4808 on the same day. Only one order confirmation was received. Please refund the duplicate charge as soon as possible.",
		status: "in_progress",
		priority: "high",
	},
	{
		subject: "Which toner fits LaserJet M404?",
		body: "I want to reorder toner but your listing shows three compatible cartridges for the HP LaserJet M404 series at very different prices. What is the difference between them, and which one do you recommend for roughly 2,000 pages a month?",
		status: "resolved",
		priority: "low",
	},
	{
		subject: "Desk lamp flickering",
		body: "The LED desk lamp from order #4762 has started flickering at the lowest brightness setting after two weeks of use. At full brightness it works fine. Is this a known issue, and can I get a replacement?",
		status: "open",
		priority: "normal",
	},
	{
		subject: "Wrong quantity of binders received",
		body: "Order #4826 was for 25 lever-arch binders but the parcel contained only 10. The invoice inside the box correctly says 25. Please ship the remaining 15 binders.",
		status: "in_progress",
		priority: "normal",
	},
	{
		subject: "Subscription order frequency change",
		body: "We have a monthly recurring order for coffee-corner and kitchen supplies. Our team has shrunk, so we would like to switch the subscription to every two months starting from August. How do I change this?",
		status: "resolved",
		priority: "low",
	},
	{
		subject: "Chair armrest broke after a month",
		body: "The left armrest of the ergonomic office chair (ref FN-9310) snapped at the mounting point after about a month of normal use. The chair is otherwise great. Can you send a replacement armrest or arrange a repair?",
		status: "open",
		priority: "high",
	},
	{
		subject: "Custom stamp text typo",
		body: "The self-inking stamp we ordered arrived with 'Recieved' instead of 'Received'. I double-checked my order form and the text I submitted was spelled correctly, so the error happened in production. Please remake the stamp.",
		status: "in_progress",
		priority: "normal",
	},
	{
		subject: "Quote for office move supplies",
		body: "We are relocating a 40-person office in October and need moving boxes, bubble wrap, packing tape, and archive boxes in bulk. Could a sales representative contact me with a quote and delivery options?",
		status: "open",
		priority: "normal",
	},
	{
		subject: "Loyalty points not credited",
		body: "According to your loyalty programme, order #4795 should have earned 145 points, but my account balance has not changed since May. Could you check and credit the missing points?",
		status: "closed",
		priority: "low",
	},
	{
		subject: "Highlighters dried out",
		body: "Half of the 20-pack of yellow highlighters from order #4787 were completely dry out of the box. The caps were all sealed, so it seems like an old batch. I would like replacements or a partial refund.",
		status: "resolved",
		priority: "normal",
	},
	{
		subject: "API access for procurement system",
		body: "Our purchasing department uses an internal procurement tool and we would like to integrate your ordering system with it. Do you provide an API or EDI interface for business customers, and where can I find the documentation?",
		status: "open",
		priority: "low",
	},
	{
		subject: "Parcel delivered to wrong address",
		body: "Tracking for order #4830 says 'delivered — signed by resident', but nothing arrived at our office and reception has no record of it. I suspect it went to the building next door. Please investigate with the courier.",
		status: "in_progress",
		priority: "high",
	},
	{
		subject: "Feedback: great packaging",
		body: "Just wanted to say the new plastic-free packaging on our last order was excellent — everything arrived intact and the crumpled-paper filler went straight into our recycling bin. Keep it up! No action needed.",
		status: "closed",
		priority: "low",
	},
	{
		subject: "Price match request for monitors stand",
		body: "You list the dual-monitor stand (ref FN-7014) at 89.90 while a competitor currently offers the identical model for 74.50. Your website mentions a price-match policy. Can you match this price on an order of four units?",
		status: "open",
		priority: "normal",
	},
];

const prisma = createPrismaClient();

try {
	// Один батч-round-trip вместо 30 последовательных запросов (+ атомарность)
	await prisma.$transaction(
		TICKETS.map((ticket, i) => {
			const id = seedId(i + 1);
			return prisma.ticket.upsert({
				where: { id },
				create: { id, ...ticket },
				update: ticket,
			});
		}),
	);
	console.log(`Seeded ${TICKETS.length} tickets`);
} finally {
	await prisma.$disconnect();
}
