import express, { type Express } from "express";
import cors from "cors";
import session from "express-session";
import pinoHttp from "pino-http";
import router from "./routes";
import { publicSeoRouter } from "./routes/seo";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pgSession = require("connect-pg-simple")(session);

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set");
}

const app: Express = express();

// nginx リバースプロキシ経由でも secure Cookie・X-Forwarded-Proto を正しく扱う
app.set("trust proxy", 1);

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

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json({
  // OCR sends a Base64-encoded document. The browser compresses photos first,
  // while this limit still leaves room for larger PDFs behind nginx's 20M cap.
  limit: "20mb",
  verify: (req: any, _res, buf) => {
    req.rawBody = buf.toString("utf8");
  },
}));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

app.use(
  session({
    store: new pgSession({
      pool,
      tableName: "sessions",
      createTableIfMissing: false,
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
);

// 検索エンジンが要求する標準URLでも動的なサイトマップとrobotsを返す。
app.use("/", publicSeoRouter);
app.use("/api", router);

export default app;
