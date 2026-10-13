import { useEffect, useRef } from "react";
import { SHORTCUTS } from "../lib/shortcuts.ts";
import { IconClose } from "./icons.tsx";

/** The small card that answers "what were the keys again", opened with a question mark. */
export function ShortcutsSheet({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => closeRef.current?.focus(), []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      data-testid="shortcuts-sheet"
    >
      <button
        type="button"
        aria-label="Close the shortcuts"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-shade"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="enter-up relative w-[360px] max-w-full rounded-[10px] border border-rule bg-surface px-4 py-3"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="wide text-[15px]">Keyboard shortcuts</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close the shortcuts"
            className="tap flex items-center justify-center text-ink-2 hover:text-ink"
          >
            <IconClose />
          </button>
        </div>
        <dl className="mt-1 flex flex-col">
          {SHORTCUTS.map((line) => (
            <div key={line.keys} className="flex items-baseline gap-3 border-t border-rule py-2">
              <dt className="num med w-[86px] shrink-0 text-[12.5px]">{line.keys}</dt>
              <dd className="text-[13px] text-ink-2">{line.what}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
