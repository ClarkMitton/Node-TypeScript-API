import app from "./app";
import { logger } from "./lib/logger";

// On Vercel (and other serverless platforms) the runtime imports this module and
// uses the exported Express `app` as the request handler — it does not set PORT
// and must not have a server calling listen(). Only start a listening server when
// running as a normal long-lived process (local dev / self-hosted / container).
if (!process.env["VERCEL"]) {
  const rawPort = process.env["PORT"] ?? "3000";
  const port = Number(rawPort);

  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

export default app;
