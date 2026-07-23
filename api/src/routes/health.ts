import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { ErrorResponseSchema } from "../schemas/error.js";

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
	app.get(
		"/health",
		{
			schema: {
				tags: ["health"],
				operationId: "getHealth",
				response: {
					200: z.object({ status: z.literal("ok") }),
					500: ErrorResponseSchema,
				},
			},
		},
		async () => ({ status: "ok" as const }),
	);
};
