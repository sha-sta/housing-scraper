import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { NotificationSchema, type Notification } from "@housing/shared";
import type { Db } from "../client.ts";
import { notifications, outboxHolds, pushBudget } from "../schema.ts";

export interface HoldRecord {
  id: string;
  profileId: string;
  notificationId: string;
  reason: "quiet" | "budget";
  title: string;
  body: string;
  click: string | null;
  createdAt: string;
}

export function createNotifyRepo(db: Db) {
  return {
    list(unreadOnly: boolean, limit: number): Notification[] {
      return db
        .select()
        .from(notifications)
        .where(unreadOnly ? isNull(notifications.readAt) : undefined)
        .orderBy(desc(notifications.createdAt))
        .limit(limit)
        .all()
        .map((row) => NotificationSchema.parse(row));
    },

    insert(notification: Notification): void {
      db.insert(notifications).values(notification).run();
    },

    setPushed(id: string, pushed: boolean): void {
      db.update(notifications).set({ pushed }).where(eq(notifications.id, id)).run();
    },

    markRead(ids: string[] | null, at: string): void {
      if (ids === null) {
        db.update(notifications).set({ readAt: at }).where(isNull(notifications.readAt)).run();
        return;
      }
      if (ids.length === 0) return;
      db.update(notifications).set({ readAt: at }).where(inArray(notifications.id, ids)).run();
    },

    countUnread(): number {
      return (
        db.select({ n: sql<number>`count(*)` }).from(notifications).where(isNull(notifications.readAt)).get()?.n ?? 0
      );
    },

    hold(record: HoldRecord): void {
      db.insert(outboxHolds).values({ ...record, releasedAt: null }).run();
    },

    pendingHolds(profileId: string, reason: HoldRecord["reason"]): HoldRecord[] {
      return db
        .select()
        .from(outboxHolds)
        .where(
          and(eq(outboxHolds.profileId, profileId), eq(outboxHolds.reason, reason), isNull(outboxHolds.releasedAt)),
        )
        .orderBy(outboxHolds.createdAt)
        .all()
        .map((row) => ({
          id: row.id,
          profileId: row.profileId,
          notificationId: row.notificationId,
          reason: row.reason === "budget" ? "budget" : "quiet",
          title: row.title,
          body: row.body,
          click: row.click,
          createdAt: row.createdAt,
        }));
    },

    profilesWithHolds(reason: HoldRecord["reason"]): string[] {
      const rows = db
        .select({ profileId: outboxHolds.profileId })
        .from(outboxHolds)
        .where(and(eq(outboxHolds.reason, reason), isNull(outboxHolds.releasedAt)))
        .groupBy(outboxHolds.profileId)
        .all();
      return rows.map((r) => r.profileId);
    },

    releaseHolds(ids: string[], at: string): void {
      if (ids.length === 0) return;
      db.update(outboxHolds).set({ releasedAt: at }).where(inArray(outboxHolds.id, ids)).run();
    },

    /** ntfy.sh caps a free topic at 250 messages a day, so the counter is per UTC day. */
    pushesToday(day: string): number {
      return db.select().from(pushBudget).where(eq(pushBudget.day, day)).get()?.count ?? 0;
    },

    recordPush(day: string): number {
      const row = db
        .insert(pushBudget)
        .values({ day, count: 1 })
        .onConflictDoUpdate({ target: pushBudget.day, set: { count: sql`${pushBudget.count} + 1` } })
        .returning({ count: pushBudget.count })
        .get();
      return row?.count ?? 0;
    },
  };
}

export type NotifyRepo = ReturnType<typeof createNotifyRepo>;
