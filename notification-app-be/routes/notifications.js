import { Router } from "express";
import { getAuthToken } from "../auth.js";
import { Log } from "../../logging-middleware/index.js";
import { BASE_URL } from "../config.js";

const router = Router();

const TYPE_WEIGHT = { Placement: 3, Result: 2, Event: 1 };

async function fetchAllNotifications() {
  await Log("backend", "info", "service", "Fetching notifications from test server");
  const token = await getAuthToken();
  const res = await fetch(`${BASE_URL}/notifications`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    await Log("backend", "error", "service", `Test server returned ${res.status}`);
    throw new Error("Failed to fetch notifications: " + res.status);
  }
  const data = await res.json();
  await Log("backend", "info", "service", `Fetched ${data.notifications.length} notifications`);
  return data.notifications;
}

function prioritize(notifications, n) {
  const timestamps = notifications.map((n) => new Date(n.Timestamp).getTime());
  const minTs = Math.min(...timestamps);
  const maxTs = Math.max(...timestamps);
  const tsRange = maxTs - minTs || 1;

  return notifications
    .map((notif) => {
      const ts = new Date(notif.Timestamp).getTime();
      const recency = (ts - minTs) / tsRange;
      const weight = TYPE_WEIGHT[notif.Type] ?? 1;
      const score = weight * 1000 + recency * 999;
      return { ...notif, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map(({ score, ...notif }) => notif);
}

// GET /api/notifications?type=Placement&page=1&limit=10
router.get("/", async (req, res) => {
  await Log("backend", "info", "handler", `GET /api/notifications query=${JSON.stringify(req.query)}`);
  try {
    const { type, page = "1", limit = "10" } = req.query;
    let notifications = await fetchAllNotifications();

    if (type && type !== "All") {
      notifications = notifications.filter((n) => n.Type === type);
      await Log("backend", "debug", "handler", `Filtered to ${notifications.length} notifications of type ${type}`);
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const total = notifications.length;
    const totalPages = Math.ceil(total / limitNum);
    const start = (pageNum - 1) * limitNum;
    const paginated = notifications.slice(start, start + limitNum);

    await Log("backend", "info", "handler", `Returning page ${pageNum}/${totalPages} with ${paginated.length} items`);
    res.json({ notifications: paginated, total, page: pageNum, totalPages });
  } catch (err) {
    await Log("backend", "error", "handler", `Failed to get notifications: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/notifications/priority?n=10
router.get("/priority", async (req, res) => {
  const n = parseInt(req.query.n ?? "10", 10);
  await Log("backend", "info", "handler", `GET /api/notifications/priority n=${n}`);
  try {
    const all = await fetchAllNotifications();
    const top = prioritize(all, n);
    await Log("backend", "info", "handler", `Returning top ${top.length} priority notifications`);
    res.json({ notifications: top, count: top.length });
  } catch (err) {
    await Log("backend", "error", "handler", `Failed to get priority notifications: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

export default router;
