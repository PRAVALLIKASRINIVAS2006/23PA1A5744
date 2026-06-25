import { useState, useEffect, useCallback } from "react";
import { fetchNotifications } from "../api/notifications";
import { Log } from "logging-middleware";

export function useNotifications(filter, page) {
  const [notifications, setNotifications] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    await Log("frontend", "debug", "hook", `Loading notifications filter=${filter} page=${page}`);
    try {
      const data = await fetchNotifications({ type: filter, page, limit: 10 });
      setNotifications(data.notifications ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
      await Log("frontend", "info", "hook", `Loaded ${data.notifications?.length} notifications`);
    } catch (err) {
      setError(err.message);
      await Log("frontend", "error", "hook", `Error loading notifications: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => {
    load();
  }, [load]);

  return { notifications, total, totalPages, loading, error };
}
