import type { FastifyPluginAsync } from "fastify";

// eslint-disable-next-line @typescript-eslint/require-await
const healthRoute: FastifyPluginAsync = async (app) => {
  app.get("/health", () => {
    return {
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  });
};

export default healthRoute;
