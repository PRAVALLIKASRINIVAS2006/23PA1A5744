import express from "express";
import cors from "cors";
import { PORT } from "./config.js";
import { Log } from "../logging-middleware/index.js";
import notificationsRouter from "./routes/notifications.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use(async (req, _res, next) => {
  await Log("backend", "debug", "middleware", `${req.method} ${req.path}`);
  next();
});

app.use("/api/notifications", notificationsRouter);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.listen(PORT, async () => {
  await Log("backend", "info", "config", `Notification backend running on port ${PORT}`);
  console.log(`Server running on http://localhost:${PORT}`);
});
