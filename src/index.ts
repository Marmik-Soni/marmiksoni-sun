import { env } from "./config/env.js";
import { buildServer } from "./server.js";

const server = await buildServer();

try {
  await server.listen({ port: env.PORT, host: env.HOST });
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
