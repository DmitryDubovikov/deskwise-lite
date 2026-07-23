import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// dw-lite: web без тестов → vitest+MSW (срез спеки 06; типы держит tsc, механику — смок)

// Dev-прокси повторяет прод-nginx (контракт №6): /api/* → :3000/* со срезом префикса,
// чтобы customFetch работал одинаково в dev и за nginx.
export default defineConfig({
	plugins: [react()],
	server: {
		proxy: {
			"/api": {
				target: "http://localhost:3000",
				rewrite: (path) => path.replace(/^\/api/, ""),
			},
		},
	},
});
