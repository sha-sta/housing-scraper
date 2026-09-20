import { z } from "zod";
import {
  API_PREFIX,
  CampusPresetSchema,
  DraftSchema,
  ListingPageSchema,
  ListingViewSchema,
  NetworkInfoSchema,
  NotificationSchema,
  ProfilePreviewSchema,
  ProfileSchema,
  SettingsSchema,
  SourceStatusSchema,
  StatsSchema,
  TemplateSchema,
  TestResultSchema,
  type Draft,
  type DraftStatus,
  type ListingQuery,
  type ListingState,
  type ProfileWrite,
  type Settings,
  type Template,
} from "@housing/shared";

export const HealthSchema = z.object({ ok: z.literal(true), version: z.string() });

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const ErrorBodySchema = z.object({ error: z.string() });

async function readError(res: Response): Promise<ApiError> {
  const text = await res.text().catch(() => "");
  if (text) {
    const parsed = ErrorBodySchema.safeParse(safeJson(text));
    if (parsed.success) return new ApiError(res.status, parsed.data.error);
    return new ApiError(res.status, text.slice(0, 300));
  }
  return new ApiError(res.status, `${res.status} ${res.statusText}`);
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

type Body = Record<string, unknown> | undefined;

async function send(path: string, method: string, body: Body): Promise<Response> {
  const res = await fetch(`${API_PREFIX}${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw await readError(res);
  return res;
}

async function json<S extends z.ZodType>(
  path: string,
  schema: S,
  method = "GET",
  body?: Body,
): Promise<z.infer<S>> {
  const res = await send(path, method, body);
  const payload = (await res.json()) as unknown;
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError(
      res.status,
      `${method} ${path} did not match the shared schema: ${z.prettifyError(parsed.error)}`,
    );
  }
  return parsed.data;
}

async function empty(path: string, method: string, body?: Body): Promise<void> {
  await send(path, method, body);
}

export function listingQueryString(q: Partial<ListingQuery>): string {
  const params = new URLSearchParams();
  if (q.profileId) params.set("profileId", q.profileId);
  if (q.scope) params.set("scope", q.scope);
  if (q.stage) params.set("stage", q.stage);
  // starred, includeHidden and includeGone are coerced server side, where any non-empty
  // string reads as true. Only ever send them when the answer is yes.
  if (q.starred) params.set("starred", "true");
  if (q.includeHidden) params.set("includeHidden", "true");
  if (q.includeGone) params.set("includeGone", "true");
  if (q.sourceId) params.set("sourceId", q.sourceId);
  if (q.q) params.set("q", q.q);
  if (q.sort) params.set("sort", q.sort);
  if (q.limit !== undefined) params.set("limit", String(q.limit));
  if (q.offset) params.set("offset", String(q.offset));
  return params.toString();
}

export const api = {
  health: () => json("/health", HealthSchema),
  stats: () => json("/stats", StatsSchema),
  campuses: () => json("/campuses", z.array(CampusPresetSchema)),
  network: () => json("/network", NetworkInfoSchema),

  settings: () => json("/settings", SettingsSchema),
  patchSettings: (patch: Partial<Settings>) => json("/settings", SettingsSchema, "PATCH", patch),

  profiles: () => json("/profiles", z.array(ProfileSchema)),
  createProfile: (write: ProfileWrite) => json("/profiles", ProfileSchema, "POST", write),
  updateProfile: (id: string, write: ProfileWrite) =>
    json(`/profiles/${encodeURIComponent(id)}`, ProfileSchema, "PUT", write),
  deleteProfile: (id: string) => empty(`/profiles/${encodeURIComponent(id)}`, "DELETE"),
  previewProfile: (write: ProfileWrite) =>
    json("/profiles/preview", ProfilePreviewSchema, "POST", write),

  listings: (q: Partial<ListingQuery>) => {
    const qs = listingQueryString(q);
    return json(qs ? `/listings?${qs}` : "/listings", ListingPageSchema);
  },
  listing: (id: string) => json(`/listings/${encodeURIComponent(id)}`, ListingViewSchema),
  patchListingState: (id: string, patch: Partial<ListingState>) =>
    json(`/listings/${encodeURIComponent(id)}/state`, ListingViewSchema, "PATCH", patch),

  drafts: (status?: DraftStatus) =>
    json(status ? `/drafts?status=${status}` : "/drafts", z.array(DraftSchema)),
  draft: (id: string) => json(`/drafts/${encodeURIComponent(id)}`, DraftSchema),
  createDraft: (listingId: string, profileId: string) =>
    json(`/listings/${encodeURIComponent(listingId)}/drafts`, DraftSchema, "POST", { profileId }),
  patchDraft: (id: string, patch: { to?: string | null; subject?: string; body?: string }) =>
    json(`/drafts/${encodeURIComponent(id)}`, DraftSchema, "PATCH", patch),
  sendDraft: (id: string) => json(`/drafts/${encodeURIComponent(id)}/send`, DraftSchema, "POST"),
  markDraftSent: (id: string) =>
    json(`/drafts/${encodeURIComponent(id)}/mark-sent`, DraftSchema, "POST"),
  discardDraft: (id: string) => empty(`/drafts/${encodeURIComponent(id)}`, "DELETE"),

  templates: () => json("/templates", z.array(TemplateSchema)),
  createTemplate: (write: Omit<Template, "id">) => json("/templates", TemplateSchema, "POST", write),
  updateTemplate: (id: string, write: Omit<Template, "id">) =>
    json(`/templates/${encodeURIComponent(id)}`, TemplateSchema, "PUT", write),
  deleteTemplate: (id: string) => empty(`/templates/${encodeURIComponent(id)}`, "DELETE"),

  notifications: (unread?: boolean) =>
    json(unread ? "/notifications?unread=true" : "/notifications", z.array(NotificationSchema)),
  markRead: (ids?: string[]) => empty("/notifications/read", "POST", ids ? { ids } : {}),

  sources: () => json("/sources", z.array(SourceStatusSchema)),
  patchSource: (
    id: string,
    patch: { enabled?: boolean; intervalSec?: number; config?: Record<string, unknown> },
  ) => json(`/sources/${encodeURIComponent(id)}`, SourceStatusSchema, "PATCH", patch),
  runSource: (id: string) =>
    json(`/sources/${encodeURIComponent(id)}/run`, SourceStatusSchema, "POST"),

  testNtfy: (profileId: string) => json("/test/ntfy", TestResultSchema, "POST", { profileId }),
  testSmtp: () => json("/test/smtp", TestResultSchema, "POST"),
};
