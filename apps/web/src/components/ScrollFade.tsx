import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A horizontal strip that can overflow gives no sign of it on a phone, so a long profile
 * name silently hides the pill beside it. The fade appears only while there is more to
 * the right, and goes away once the reader reaches the end.
 */
export function ScrollFade({
  children,
  className,
  ...rest
}: { children: React.ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [more, setMore] = useState(false);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setMore(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [measure, children]);

  return (
    <div className="relative">
      <div ref={ref} onScroll={measure} className={`scroll-x ${className ?? ""}`} {...rest}>
        {children}
      </div>
      {more ? (
        <span
          aria-hidden="true"
          data-testid="scroll-fade"
          className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[var(--ground)] to-transparent"
        />
      ) : null}
    </div>
  );
}
