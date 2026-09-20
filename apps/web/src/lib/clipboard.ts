import { useCallback, useRef, useState } from "react";

/**
 * Copying is the main way outreach leaves this app, so every copy button has to say
 * plainly that it worked. One hook holds which button last succeeded.
 */
export function useCopy(resetMs = 1800) {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const copy = useCallback(
    async (key: string, text: string): Promise<boolean> => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        return false;
      }
      if (timer.current !== null) window.clearTimeout(timer.current);
      setCopied(key);
      timer.current = window.setTimeout(() => setCopied(null), resetMs);
      return true;
    },
    [resetMs],
  );

  return { copied, copy };
}
