# Notification System Design

## Stage 1

### REST API Contract for Notification Platform

#### Core Actions
1. Fetch all notifications for a student (with pagination and type filter)
2. Fetch a single notification by ID
3. Mark a notification as read
4. Mark all notifications as read
5. Get unread notification count
6. Get priority inbox (top N by weight + recency)

#### API Endpoints

**GET /api/notifications**
- Headers: `Authorization: Bearer <token>`
- Query: `?type=Placement|Result|Event|All&page=1&limit=10`
- Response:
```json
{
  "notifications": [
    { "ID": "uuid", "Type": "Placement", "Message": "Amazon hiring", "Timestamp": "2026-06-25 10:00:00", "isRead": false }
  ],
  "total": 100, "page": 1, "totalPages": 10
}
```

**GET /api/notifications/:id**
- Headers: `Authorization: Bearer <token>`
- Response: `{ "ID": "uuid", "Type": "...", "Message": "...", "Timestamp": "...", "isRead": false }`

**PATCH /api/notifications/:id/read**
- Headers: `Authorization: Bearer <token>`
- Response: `{ "success": true }`

**PATCH /api/notifications/read-all**
- Headers: `Authorization: Bearer <token>`
- Response: `{ "updated": 42 }`

**GET /api/notifications/unread-count**
- Headers: `Authorization: Bearer <token>`
- Response: `{ "count": 5 }`

**GET /api/notifications/priority?n=10**
- Headers: `Authorization: Bearer <token>`
- Response: `{ "notifications": [...], "count": 10 }`

#### Real-Time Notification Mechanism

Use **WebSockets** (Socket.IO). On new notification creation:
1. Backend emits `new-notification` event to the student's socket room.
2. Frontend listener appends the notification to state without page reload.

Alternative: **Server-Sent Events (SSE)** — simpler, one-directional, suitable for read-only streams.

---

## Stage 2

### Persistent Storage Choice: PostgreSQL

**Why PostgreSQL:**
- Fixed, well-defined schema suits a relational DB.
- ACID guarantees — no notification lost or double-counted.
- Rich query support: filter, sort, paginate, range queries.
- Native ENUM support for notification types.
- Scales well with proper indexing for 50,000 students.

### DB Schema

```sql
CREATE TYPE notification_type AS ENUM ('Placement', 'Result', 'Event');

CREATE TABLE students (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT UNIQUE NOT NULL,
  name       TEXT NOT NULL,
  roll_no    TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE notifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  notification_type notification_type NOT NULL,
  message           TEXT NOT NULL,
  is_read           BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_student_id ON notifications(student_id);
CREATE INDEX idx_notifications_type ON notifications(notification_type);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX idx_notifications_student_unread ON notifications(student_id, is_read) WHERE is_read = FALSE;
```

### Problems as Data Volume Increases

| Problem | Solution |
|---|---|
| Slow reads as rows grow to millions | Composite index on (student_id, is_read, created_at) |
| DB overwhelmed by per-page-load queries | Redis caching with 60s TTL |
| Bulk inserts slow during placement season | Message queue + batch workers |
| Table too large | Partition notifications by created_at (monthly) |
| Cross-student analytics slow | Read replica for OLAP queries |

### Sample Queries

```sql
-- Unread notifications for a student
SELECT * FROM notifications
WHERE student_id = $1 AND is_read = FALSE
ORDER BY created_at DESC
LIMIT 10 OFFSET $2;

-- Mark as read
UPDATE notifications SET is_read = TRUE WHERE id = $1 AND student_id = $2;
```

---

## Stage 3

### Query Analysis

```sql
SELECT * FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt ASC;
```

**Is it accurate?** Functionally yes, but `ASC` ordering shows oldest first — `DESC` is better UX for a notification inbox.

**Why is it slow?** No index on `(studentID, isRead)` means a full table scan of 5,000,000 rows for every request. The DB reads all rows, filters them in memory, then sorts.

**Fix — add a partial composite index:**
```sql
CREATE INDEX idx_notifications_student_unread
ON notifications(student_id, is_read, created_at DESC)
WHERE is_read = FALSE;
```

**Computation cost:** Without index: O(5,000,000) scan. With index: O(log N + K) where K = result count.

**Should you index every column?** No. Each index speeds up reads but slows down every INSERT/UPDATE/DELETE (the index must be updated too). With high write volume during placement season, indexing every column would degrade write performance significantly. Only index columns used in WHERE, ORDER BY, or JOIN clauses.

### Query: Students with a Placement notification in the last 7 days

```sql
SELECT DISTINCT s.id, s.name, s.email
FROM students s
JOIN notifications n ON n.student_id = s.id
WHERE n.notification_type = 'Placement'
  AND n.created_at >= NOW() - INTERVAL '7 days';
```

---

## Stage 4

### DB Overwhelmed on Every Page Load

**Solutions and Tradeoffs:**

**1. Redis Caching (Recommended)**
- Cache notification list per student per filter per page: key = `notifs:{student_id}:{type}:{page}`, TTL = 60s.
- On new notification insert, invalidate that student's cache.
- Tradeoff: Up to 60s staleness. Acceptable for notifications.

**2. HTTP Cache Headers**
- Return `Cache-Control: max-age=30` from the API.
- Browser avoids re-fetching on each page load.
- Tradeoff: Simple to implement but no server-side invalidation control.

**3. Pagination**
- Already implemented — fetch only 10 at a time instead of all records.
- Drastically reduces per-request query cost.

**4. Read Replica**
- Route all SELECT queries to a replica; primary handles writes only.
- Tradeoff: Replication lag (~100ms); more infrastructure complexity.

**Best approach:** Pagination + Redis cache with targeted invalidation on write.

---

## Stage 5

### Pseudocode Shortcomings

```
function notify_all(student_ids: array, message: string):
    for student_id in student_ids:
        send_email(student_id, message)
        save_to_db(student_id, message)
        push_to_app(student_id, message)
```

**Shortcomings:**
1. **Sequential — too slow**: 50,000 × 100ms = ~83 minutes end-to-end.
2. **No fault tolerance**: When `send_email` fails for 200 students midway, those students are silently skipped with no retry.
3. **Tight coupling**: Email failure blocks DB save and app push, even though they are independent.
4. **No transactional safety**: If DB save fails after email is sent, state is inconsistent.

**What now (200 failed midway)?** No record of who failed — must re-send to all 50,000 and risk duplicates, or implement pre-tracking.

**Should DB save and email happen together?** No — they must be decoupled. Save to DB first (creates a durable record), then send email asynchronously so failures can be retried from the record.

**Redesigned pseudocode (message queue approach):**

```
function notify_all(student_ids: array, message: string):
    for student_id in student_ids:
        save_to_db(student_id, message, status="pending")  // durable record first
        enqueue({ student_id, message })                   // async queue

// N parallel workers:
function worker():
    while true:
        job = dequeue()
        try:
            send_email(job.student_id, job.message)
            push_to_app(job.student_id, job.message)
            mark_db_status(job.student_id, "sent")
        except EmailError:
            requeue(job, delay=30s, max_retries=3)         // retry with backoff
```

This approach: processes all 50,000 in parallel, retries failures automatically, and keeps a durable record at every step.

---

## Stage 6

### Priority Inbox Implementation

**Priority Formula:**
- Type weight: `Placement = 3`, `Result = 2`, `Event = 1`
- Recency score: normalize timestamps to [0, 1] — most recent = 1
- Final score: `type_weight × 1000 + recency × 999`

The 1000× multiplier ensures type always dominates: a Placement always outranks a Result regardless of timestamp. Within the same type, recency determines order.

**Algorithm (O(N log N)):**
1. Fetch all notifications from the Notification API.
2. Compute score for each.
3. Sort descending by score.
4. Return top N.

**Maintaining top 10 efficiently as new notifications arrive:**
Use a **min-heap** of size N. For each new notification, compute its score and push to heap. If heap exceeds N, pop the minimum. The heap always contains the top N highest-priority items in O(log N) per insert.

See implementation in `notification-app-be/routes/notifications.js` — the `/api/notifications/priority` endpoint.
