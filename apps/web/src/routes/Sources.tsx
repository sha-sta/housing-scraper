import { useEffect, useState } from "react";
import type { SourceStatus } from "@housing/shared";
import { Chip, Empty, ErrorNote, PageHeader, Spinner } from "../components/ui.tsx";
import { IconChevron, IconExternal, IconRefresh, IconWarn } from "../components/icons.tsx";
import { useSourceMutations, useSources } from "../lib/queries.ts";
import { formatDateTime, formatInterval, relativeTime } from "../lib/format.ts";
import { listToText, textToList } from "../lib/prefs-form.ts";

type Health = "off" | "setup" | "failing" | "stale" | "good";

function health(source: SourceStatus): Health {
  if (!source.enabled) return "off";
  if (source.needsSetup) return "setup";
  if (source.consecutiveFailures > 0) return "failing";
  if (source.lastSuccessAt === null) return "stale";
  return "good";
}

const HEALTH_COLOR: Record<Health, string> = {
  off: "var(--ink-3)",
  setup: "var(--stage-contacted)",
  failing: "var(--brick)",
  stale: "var(--ink-3)",
  good: "var(--moss)",
};

const HEALTH_WORD: Record<Health, string> = {
  off: "Turned off",
  setup: "Needs setup",
  failing: "Failing",
  stale: "Never finished a run",
  good: "Healthy",
};

const KIND_WORD: Record<SourceStatus["kind"], string> = {
  http: "Plain fetch",
  browser: "Headless browser",
  account: "Your logged-in browser",
};

function ConfigEditor({
  source,
  onSave,
  saving,
}: {
  source: SourceStatus;
  onSave: (config: Record<string, unknown>) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState<Record<string, unknown>>(source.config);
  const [newKey, setNewKey] = useState("");
  useEffect(() => setDraft(source.config), [source.config]);

  const entries = Object.entries(draft);

  function set(key: string, value: unknown) {
    setDraft((previous) => ({ ...previous, [key]: value }));
  }

  return (
    <div className="flex flex-col gap-3">
      {entries.length === 0 ? (
        <p className="text-[12.5px] text-ink-2">This source takes no settings.</p>
      ) : null}

      {entries.map(([key, value]) => {
        const id = `${source.id}-${key}`;
        if (typeof value === "boolean") {
          return (
            <div key={key} className="flex items-center gap-2.5">
              <input
                id={id}
                type="checkbox"
                checked={value}
                onChange={(e) => set(key, e.currentTarget.checked)}
              />
              <label htmlFor={id} className="med text-[13px]">
                {key}
              </label>
            </div>
          );
        }
        if (typeof value === "number") {
          return (
            <label key={key} className="flex flex-col gap-1.5">
              <span className="med text-[13px]">{key}</span>
              <input
                id={id}
                className="field text-[14px]"
                type="number"
                value={value}
                onChange={(e) => set(key, Number(e.currentTarget.value))}
              />
            </label>
          );
        }
        if (Array.isArray(value)) {
          return (
            <label key={key} className="flex flex-col gap-1.5">
              <span className="med text-[13px]">{key}</span>
              <textarea
                id={id}
                className="field text-[14px]"
                rows={3}
                value={listToText(value.map((item) => String(item)))}
                onChange={(e) => set(key, textToList(e.currentTarget.value))}
              />
              <span className="text-[12px] text-ink-2">One per line.</span>
            </label>
          );
        }
        if (typeof value === "string") {
          return (
            <label key={key} className="flex flex-col gap-1.5">
              <span className="med text-[13px]">{key}</span>
              <input
                id={id}
                className="field text-[14px]"
                value={value}
                onChange={(e) => set(key, e.currentTarget.value)}
              />
            </label>
          );
        }
        return (
          <label key={key} className="flex flex-col gap-1.5">
            <span className="med text-[13px]">{key}</span>
            <textarea
              id={id}
              className="field text-[14px]"
              rows={3}
              value={JSON.stringify(value, null, 2)}
              onChange={(e) => {
                try {
                  set(key, JSON.parse(e.currentTarget.value) as unknown);
                } catch {
                  set(key, e.currentTarget.value);
                }
              }}
            />
            <span className="text-[12px] text-ink-2">JSON.</span>
          </label>
        );
      })}

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="med text-[13px]">Add a setting</span>
          <input
            className="field text-[14px]"
            value={newKey}
            placeholder="name"
            onChange={(e) => setNewKey(e.currentTarget.value)}
          />
        </label>
        <button
          type="button"
          className="ctl med text-[13.5px]"
          disabled={newKey.trim() === "" || newKey in draft}
          onClick={() => {
            set(newKey.trim(), "");
            setNewKey("");
          }}
        >
          Add
        </button>
        <button
          type="button"
          className="ctl-primary semi px-4 text-[13.5px]"
          disabled={saving}
          onClick={() => onSave(draft)}
        >
          {saving ? "Saving" : "Save settings"}
        </button>
      </div>
    </div>
  );
}

function SourceRow({ source }: { source: SourceStatus }) {
  const { patch, run } = useSourceMutations();
  const [open, setOpen] = useState(false);
  const [interval, setInterval] = useState(String(source.intervalSec));
  useEffect(() => setInterval(String(source.intervalSec)), [source.intervalSec]);
  const state = health(source);

  return (
    <div className="bg-surface" data-testid="source-row" data-source-id={source.id}>
      <div className="flex items-start gap-3 px-4 py-3 lg:px-6">
        <span
          aria-hidden="true"
          className="mt-[7px] h-[9px] w-[9px] shrink-0 rounded-full"
          style={{ background: HEALTH_COLOR[state] }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <h2 className="semi text-[15px]">{source.name}</h2>
            <span className="text-[12px] text-ink-2">{HEALTH_WORD[state]}</span>
            <a
              href={source.homepage}
              target="_blank"
              rel="noreferrer noopener"
              className="tap flex items-center justify-center text-ink-3 hover:text-ink-2"
              aria-label={`Open ${source.name} in a new tab`}
            >
              <IconExternal className="h-[14px] w-[14px]" />
            </a>
          </div>

          <dl className="num mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px] sm:grid-cols-4">
            <div>
              <dt className="text-ink-3">Last run</dt>
              <dd>{source.lastRunAt ? relativeTime(source.lastRunAt) : "never"}</dd>
            </div>
            <div>
              <dt className="text-ink-3">Last success</dt>
              <dd>{source.lastSuccessAt ? relativeTime(source.lastSuccessAt) : "never"}</dd>
            </div>
            <div>
              <dt className="text-ink-3">Found last run</dt>
              <dd>{source.lastRunCount}</dd>
            </div>
            <div>
              <dt className="text-ink-3">Total listings</dt>
              <dd>{source.totalListings}</dd>
            </div>
          </dl>

          {source.consecutiveFailures > 0 ? (
            <p className="num mt-1.5 text-[12.5px] text-brick">
              {source.consecutiveFailures} failed{" "}
              {source.consecutiveFailures === 1 ? "run" : "runs"} in a row
            </p>
          ) : null}

          {source.lastError ? (
            <p className="mt-1 break-words text-[12.5px] text-ink-2">{source.lastError}</p>
          ) : null}

          {source.needsSetup && source.setupHint ? (
            <div className="mt-2 rounded-[8px] border px-3 py-2" style={{ borderColor: "var(--stage-contacted)" }}>
              <p className="semi flex items-center gap-1.5 text-[13px]">
                <IconWarn className="h-4 w-4" />
                Set this up first
              </p>
              <p className="mt-1 whitespace-pre-line text-[12.5px] text-ink-2">
                {source.setupHint}
              </p>
            </div>
          ) : null}

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <label className="flex min-h-[44px] items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={source.enabled}
                onChange={(e) => patch.mutate({ id: source.id, patch: { enabled: e.currentTarget.checked } })}
              />
              Enabled
            </label>

            <label className="flex min-h-[44px] items-center gap-2 text-[13px]">
              <span className="sr-only">Run every, in seconds</span>
              <input
                className="field num w-[92px] text-[13.5px]"
                type="number"
                min={30}
                step={30}
                value={interval}
                onChange={(e) => setInterval(e.currentTarget.value)}
                onBlur={() => {
                  const parsed = Number(interval);
                  if (Number.isFinite(parsed) && parsed >= 30 && parsed !== source.intervalSec) {
                    patch.mutate({ id: source.id, patch: { intervalSec: Math.round(parsed) } });
                  }
                }}
              />
              <span className="text-ink-2">sec, now {formatInterval(source.intervalSec)}</span>
            </label>

            <button
              type="button"
              className="ctl med flex items-center gap-1.5 text-[13.5px]"
              disabled={run.isPending}
              onClick={() => run.mutate(source.id)}
              data-testid={`run-${source.id}`}
            >
              <IconRefresh className="h-4 w-4" />
              {run.isPending ? "Running" : "Run now"}
            </button>

            <Chip tone="quiet">{KIND_WORD[source.kind]}</Chip>

            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
              className="med flex min-h-[44px] items-center gap-1 px-2 text-[13.5px] text-ink-2"
            >
              Settings
              <IconChevron className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {open ? (
        <div className="border-t border-rule bg-surface-2 px-4 py-4 lg:px-6">
          <ConfigEditor
            source={source}
            saving={patch.isPending}
            onSave={(config) => patch.mutate({ id: source.id, patch: { config } })}
          />
          <p className="mt-3 text-[12px] text-ink-3">
            Last run finished {formatDateTime(source.lastRunAt)}.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function Sources() {
  const sources = useSources();
  const items = sources.data ?? [];

  return (
    <div>
      <PageHeader
        title="Sources"
        hint="Each site runs on its own clock. A red dot means the last run failed and the reason is printed under it."
      />

      {sources.isError ? <ErrorNote error={sources.error} /> : null}
      {sources.isPending ? <Spinner label="Loading sources" /> : null}

      {!sources.isPending && items.length === 0 ? (
        <Empty
          title="No sources registered"
          next="The server registers sources at startup. Start it with DEMO=1 to see the demo source here."
        />
      ) : null}

      <div className="row-stack border-t border-rule">
        {items.map((source) => (
          <SourceRow key={source.id} source={source} />
        ))}
      </div>
    </div>
  );
}
