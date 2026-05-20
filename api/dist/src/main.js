import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import { apiRouter } from "./routes/index.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { startScheduler } from "./services/scheduler.js";
const app = express();
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));
app.use(rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: "draft-7",
    legacyHeaders: false
}));
app.use("/api", apiRouter);
app.use(notFoundHandler);
app.use(errorHandler);
app.listen(env.API_PORT, () => {
    console.log(`AutoNews AI API listening on http://localhost:${env.API_PORT}/api`);
    startScheduler();
});
