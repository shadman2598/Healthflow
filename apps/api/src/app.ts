import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import morgan from "morgan";
import { env } from "./config/env";
import { errorHandler, notFound } from "./middleware/error-handler";
import { apiRouter } from "./routes";

export const app = express();

app.use(
  cors({
    origin: env.WEB_ORIGIN,
    credentials: true
  })
);
app.use(morgan("dev"));
app.use(express.json());
app.use(cookieParser());

app.use("/", apiRouter);

app.use(notFound);
app.use(errorHandler);
