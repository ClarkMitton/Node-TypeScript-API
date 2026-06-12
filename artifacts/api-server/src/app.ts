import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { ensureSchema } from "@workspace/db";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure the database schema exists before handling any request. Idempotent and
// runs at most once per instance; needed because the deploy target only exposes
// the DB connection string at runtime (not build time), so we can't push during
// the build.
app.use((_req, _res, next) => {
  ensureSchema().then(() => next()).catch(next);
});

app.use("/api", router);

export default app;
