import fp from "fastify-plugin";
import type { PrismaClient } from "../generated/prisma/client.js";

declare module "fastify" {
	interface FastifyInstance {
		prisma: PrismaClient;
	}
}

interface PrismaPluginOptions {
	prisma: PrismaClient;
}

// fastify-plugin снимает инкапсуляцию с самого плагина: декоратор ложится в контекст,
// ГДЕ плагин зарегистрирован (tickets-скоуп в app.ts), и выше не протекает.
export const prismaPlugin = fp<PrismaPluginOptions>(
	async (app, opts) => {
		app.decorate("prisma", opts.prisma);
		app.addHook("onClose", async () => {
			await opts.prisma.$disconnect();
		});
	},
	{ name: "prisma" },
);
