import { Log } from "logging-middleware";

export async function fetchNotifications({ type, page = 1, limit = 10 } = {}) {
  await Log("frontend", "info", "api", `Fetching notifications type=${type ?? "All"} page=${page}`);
  const params = new URLSearchParams({ page, limit });
  if (type && type !== "All") params.set("type", type);

  const res = await fetch(`/api/notifications?${params}`);
  if (!res.ok) {
    await Log("frontend", "error", "api", `Failed to fetch notifications: ${res.status}`);
    throw new Error("Failed to fetch notifications");
  }
  const data = await res.json();
  await Log("frontend", "info", "api", `Received ${data.notifications.length} notifications`);
  return data;
}

export async function fetchPriorityNotifications(n = 10) {
  await Log("frontend", "info", "api", `Fetching top ${n} priority notifications`);
  const res = await fetch(`/api/notifications/priority?n=${n}`);
  if (!res.ok) {
    await Log("frontend", "error", "api", `Failed to fetch priority notifications: ${res.status}`);
    throw new Error("Failed to fetch priority notifications");
  }
  return res.json();
}
