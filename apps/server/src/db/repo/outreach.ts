import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { DraftSchema, TemplateSchema, type Draft, type Template } from "@housing/shared";
import type { Db } from "../client.ts";
import { drafts, templates } from "../schema.ts";

type DraftRow = typeof drafts.$inferSelect;

function toDraft(row: DraftRow): Draft {
  return DraftSchema.parse({
    id: row.id,
    listingId: row.listingId,
    profileId: row.profileId,
    channel: row.channel,
    to: row.to,
    subject: row.subject,
    body: row.body,
    status: row.status,
    generatedBy: row.generatedBy,
    error: row.error,
    createdAt: row.createdAt,
    sentAt: row.sentAt,
  });
}

export function createOutreachRepo(db: Db) {
  return {
    listDrafts(status?: Draft["status"]): Draft[] {
      return db
        .select()
        .from(drafts)
        .where(status === undefined ? undefined : eq(drafts.status, status))
        .orderBy(desc(drafts.createdAt))
        .all()
        .map(toDraft);
    },

    getDraft(id: string): Draft | null {
      const row = db.select().from(drafts).where(eq(drafts.id, id)).get();
      return row === undefined ? null : toDraft(row);
    },

    draftIdsFor(listingIds: string[]): Map<string, string[]> {
      const out = new Map<string, string[]>();
      if (listingIds.length === 0) return out;
      const rows = db
        .select({ id: drafts.id, listingId: drafts.listingId })
        .from(drafts)
        .where(inArray(drafts.listingId, listingIds))
        .all();
      for (const row of rows) {
        const bucket = out.get(row.listingId);
        if (bucket === undefined) out.set(row.listingId, [row.id]);
        else bucket.push(row.id);
      }
      return out;
    },

    findStaged(listingId: string, profileId: string): Draft | null {
      const row = db
        .select()
        .from(drafts)
        .where(and(eq(drafts.listingId, listingId), eq(drafts.profileId, profileId), eq(drafts.status, "staged")))
        .get();
      return row === undefined ? null : toDraft(row);
    },

    /** Backs the rule that one address never gets two emails for one listing. */
    hasSentTo(listingId: string, to: string): boolean {
      const row = db
        .select({ n: sql<number>`count(*)` })
        .from(drafts)
        .where(
          and(
            eq(drafts.listingId, listingId),
            eq(drafts.to, to),
            inArray(drafts.status, ["sending", "sent"]),
          ),
        )
        .get();
      return (row?.n ?? 0) > 0;
    },

    insertDraft(draft: Draft): void {
      db.insert(drafts).values(draft).run();
    },

    updateDraft(draft: Draft): void {
      db
        .update(drafts)
        .set({
          channel: draft.channel,
          to: draft.to,
          subject: draft.subject,
          body: draft.body,
          status: draft.status,
          generatedBy: draft.generatedBy,
          error: draft.error,
          sentAt: draft.sentAt,
        })
        .where(eq(drafts.id, draft.id))
        .run();
    },

    countStaged(): number {
      return db.select({ n: sql<number>`count(*)` }).from(drafts).where(eq(drafts.status, "staged")).get()?.n ?? 0;
    },

    listTemplates(): Template[] {
      return db.select().from(templates).all().map((row) => TemplateSchema.parse(row));
    },

    getTemplate(id: string): Template | null {
      const row = db.select().from(templates).where(eq(templates.id, id)).get();
      return row === undefined ? null : TemplateSchema.parse(row);
    },

    insertTemplate(template: Template): void {
      db.insert(templates).values(template).run();
    },

    updateTemplate(template: Template): void {
      db
        .update(templates)
        .set({ name: template.name, subject: template.subject, body: template.body })
        .where(eq(templates.id, template.id))
        .run();
    },

    removeTemplate(id: string): void {
      db.delete(templates).where(eq(templates.id, id)).run();
    },

    countTemplates(): number {
      return db.select({ n: sql<number>`count(*)` }).from(templates).get()?.n ?? 0;
    },
  };
}

export type OutreachRepo = ReturnType<typeof createOutreachRepo>;
