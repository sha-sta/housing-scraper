import { useId } from "react";
import { scoreBand, scoreWord } from "../lib/format.ts";

export function PageHeader({
  title,
  hint,
  actions,
}: {
  title: string;
  hint?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 px-4 pb-3 pt-4 lg:px-6 lg:pt-6">
      <div className="min-w-0">
        <h1 className="wide text-[19px] leading-tight lg:text-[22px]">{title}</h1>
        {hint ? <p className="mt-1 max-w-[62ch] text-[13px] text-ink-2">{hint}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Empty({
  title,
  next,
  action,
}: {
  title: string;
  next: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mx-4 my-6 rounded-[10px] border border-dashed border-rule-strong px-5 py-10 text-center lg:mx-6">
      <p className="semi text-[15px]">{title}</p>
      <p className="mx-auto mt-1.5 max-w-[46ch] text-[13.5px] text-ink-2">{next}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

/**
 * The one loud element in the app. A condensed numeral on a plate, the way a Baltimore
 * rowhome wears its house number, so a score is legible at arm's length while scrolling.
 */
export function ScorePlate({
  score,
  size = "md",
  title,
}: {
  score: number;
  size?: "sm" | "md" | "lg";
  title?: string;
}) {
  const band = scoreBand(score);
  const dims =
    size === "lg"
      ? "w-[64px] py-2 text-[30px]"
      : size === "sm"
        ? "w-[32px] py-0.5 text-[15px]"
        : "w-[42px] py-1 text-[21px]";
  return (
    <span
      className={`num cond inline-flex shrink-0 items-center justify-center rounded-[3px] leading-none tracking-tight ${dims}`}
      style={{ background: `var(--band-${band}-bg)`, color: `var(--band-${band}-fg)` }}
      title={title ?? `${scoreWord(score)}, score ${Math.round(score)} of 100`}
    >
      {Math.round(score)}
    </span>
  );
}

export function Chip({
  children,
  tone = "plain",
  as: As = "span",
  ...rest
}: {
  children: React.ReactNode;
  tone?: "plain" | "moss" | "brick" | "quiet";
  as?: "span" | "div";
} & React.HTMLAttributes<HTMLSpanElement>) {
  const tones = {
    plain: "border-rule-strong text-ink-2",
    quiet: "border-transparent bg-surface-2 text-ink-2",
    moss: "border-transparent bg-moss-soft text-ink",
    brick: "border-transparent bg-brick-soft text-brick",
  };
  return (
    <As
      {...rest}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-[3px] text-[11.5px] leading-[15px] ${tones[tone]} ${rest.className ?? ""}`}
    >
      {children}
    </As>
  );
}

export function Labeled({
  label,
  hint,
  children,
  id,
}: {
  label: string;
  hint?: string;
  children: (props: { id: string; "aria-describedby"?: string }) => React.ReactNode;
  id?: string;
}) {
  const generated = useId();
  const fieldId = id ?? generated;
  const hintId = `${fieldId}-hint`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="med text-[13px]">
        {label}
      </label>
      {children(hint ? { id: fieldId, "aria-describedby": hintId } : { id: fieldId })}
      {hint ? (
        <p id={hintId} className="text-[12px] text-ink-2">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Switch({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className="flex min-h-[44px] cursor-pointer items-start gap-3 py-2.5 text-[13.5px]"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
        className="mt-[2px] shrink-0"
      />
      <span className="min-w-0">
        <span className="med block">{label}</span>
        {hint ? <span className="mt-0.5 block text-[12px] text-ink-2">{hint}</span> : null}
      </span>
    </label>
  );
}

export function Section({
  title,
  hint,
  children,
  id,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="border-t border-rule px-4 py-5 first:border-t-0 lg:px-6">
      <h2 className="wide text-[15px]">{title}</h2>
      {hint ? <p className="mt-1 max-w-[62ch] text-[13px] text-ink-2">{hint}</p> : null}
      <div className="mt-3.5 flex flex-col gap-3.5">{children}</div>
    </section>
  );
}

/** A labelled bar, used for the score breakdown. Values are 0 to 100. */
export function Meter({
  label,
  value,
  weight,
}: {
  label: string;
  value: number;
  weight?: number;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-3">
      <span className="w-[74px] shrink-0 text-[12.5px] text-ink-2">{label}</span>
      {/* One fill colour. The bar length and the number already say how good it is, and a
          pale band colour disappeared against the track. */}
      <span className="h-[9px] flex-1 overflow-hidden rounded-full bg-surface-3">
        <span
          className="block h-full rounded-full"
          style={{ width: `${pct}%`, background: "var(--moss)" }}
        />
      </span>
      <span className="num w-[54px] shrink-0 text-right text-[12.5px] text-ink-2">
        {Math.round(value)}
        {weight === undefined ? "" : ` ×${weight}`}
      </span>
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <p className="px-4 py-8 text-[13px] text-ink-2 lg:px-6" role="status">
      {label}
    </p>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : "Something went wrong";
  return (
    <div className="mx-4 my-4 rounded-[8px] border border-brick bg-brick-soft px-4 py-3 lg:mx-6">
      <p className="semi text-[13.5px]">The server did not answer</p>
      <p className="mt-1 text-[12.5px] text-ink-2">{message}</p>
    </div>
  );
}
