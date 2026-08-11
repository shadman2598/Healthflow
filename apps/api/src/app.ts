import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import morgan from "morgan";
import { env } from "./config/env";
import { errorHandler, notFound } from "./middleware/error-handler";
import { apiRouter } from "./routes";

export const app = express();

const localhostOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (env.NODE_ENV === "development" && localhostOriginPattern.test(origin)) {
        callback(null, true);
        return;
      }
      if (origin === env.WEB_ORIGIN) {
        callback(null, true);
        return;
      }
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true
  })
);
app.use(morgan("dev"));
app.use(express.json());
app.use(cookieParser());

app.use("/", apiRouter);

app.use(notFound);
app.use(errorHandler);
