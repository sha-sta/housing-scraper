import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Link } from "react-router";

export interface ToastInput {
  title: string;
  body?: string;
  to?: string;
  tone?: "plain" | "bad";
}

interface ToastItem extends ToastInput {
  id: number;
}

interface ToastValue {
  push: (input: ToastInput) => void;
}

const ToastContext = createContext<ToastValue>({ push: () => {} });

const LIFETIME_MS = 6000;
let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((input: ToastInput) => {
    const id = nextId++;
    setItems((previous) => [...previous.slice(-2), { ...input, id }]);
    window.setTimeout(() => {
      setItems((previous) => previous.filter((item) => item.id !== id));
    }, LIFETIME_MS);
  }, []);

  const dismiss = useCallback((id: number) => {
    setItems((previous) => previous.filter((item) => item.id !== id));
  }, []);

  const value = useMemo<ToastValue>(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[72px] z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end"
        role="status"
        aria-live="polite"
      >
        {items.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={() => dismiss(item.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const body = (
    <>
      <span className="semi block text-[14px] leading-tight">{item.title}</span>
      {item.body ? (
        <span className="mt-0.5 block text-[13px] text-ink-2 leading-snug">{item.body}</span>
      ) : null}
    </>
  );

  const tone =
    item.tone === "bad"
      ? "border-brick bg-brick-soft text-ink"
      : "border-rule-strong bg-surface text-ink";

  return (
    <div
      className={`enter-up pointer-events-auto flex w-full max-w-[420px] items-start gap-3 rounded-[var(--radius-ctl)] border px-3 py-2.5 shadow-[0_6px_24px_-12px_rgb(0_0_0/0.45)] ${tone}`}
      data-testid="toast"
    >
      <span
        aria-hidden="true"
        className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
        style={{ background: item.tone === "bad" ? "var(--brick)" : "var(--moss)" }}
      />
      <div className="min-w-0 flex-1">
        {item.to ? (
          <Link to={item.to} onClick={onDismiss} className="block">
            {body}
          </Link>
        ) : (
          body
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="-mr-1 -mt-1 shrink-0 px-2 py-1 text-[13px] text-ink-2 hover:text-ink"
        aria-label="Dismiss"
      >
        Close
      </button>
    </div>
  );
}

export function useToast(): ToastValue {
  return useContext(ToastContext);
}
