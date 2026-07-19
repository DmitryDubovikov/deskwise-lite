import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		setupFiles: ["./src/test-setup.ts"],
		// Тесты общего файла Ticket в реальном Postgres — beforeEach чистит таблицу,
		// параллельные файлы гонялись бы друг с другом за одни и те же строки.
		fileParallelism: false,
	},
});
