import { digestThreshold, pushCountLine } from "../lib/format.ts";

/**
 * ntfy has a free daily ceiling, and a reader who hits it deserves to know before the
 * pushes go quiet. One bar, the count, and the sentence that says what changes.
 */
export function PushBudget({ today, budget }: { today: number; budget: number }) {
  if (budget <= 0) return null;
  const pct = Math.max(0, Math.min(100, (today / budget) * 100));

  return (
    <div data-testid="push-budget">
      <div className="flex items-center gap-3">
        <span className="num med shrink-0 text-[13.5px]">{pushCountLine(today, budget)}</span>
        <span className="h-[9px] flex-1 overflow-hidden rounded-full bg-surface-3">
          <span
            className="block h-full rounded-full"
            style={{ width: `${pct}%`, background: "var(--moss)" }}
          />
        </span>
      </div>
      <p className="mt-1.5 max-w-[62ch] text-[12.5px] text-ink-2">
        Past {digestThreshold(budget)}, only urgent matches push on their own and the rest arrive
        as one digest.
      </p>
    </div>
  );
}
