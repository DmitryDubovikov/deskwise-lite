import { buildApp } from "./app.js";

const app = await buildApp();

app.listen({ port: 3000, host: "0.0.0.0" }, (err, address) => {
	if (err) {
		app.log.error(err);
		process.exit(1);
	}
	app.log.info(`listening on ${address}`);
});
