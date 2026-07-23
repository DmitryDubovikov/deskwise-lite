import { defineConfig } from "orval";

// Конфиг перенесён из nextjs-django-tutors (react-query, tags-split, customFetch).
// Вход — закоммиченный api/openapi.json (файл, не URL — контракт №3);
// сгенерённое коммитится: это вход contract-drift-gate (iter 7).
export default defineConfig({
	deskwise: {
		input: {
			target: "../api/openapi.json",
		},
		output: {
			mode: "tags-split",
			target: "./src/generated/api",
			schemas: "./src/generated/schemas",
			client: "react-query",
			httpClient: "fetch",
			clean: true,
			override: {
				mutator: {
					path: "./src/lib/api-client.ts",
					name: "customFetch",
				},
				query: {
					signal: false,
				},
			},
		},
	},
});
