import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * A phone camera needs dark on white whatever the dashboard theme is, so the code
 * always sits on its own white card.
 */
export function QrCode({ value, size = 148, label }: { value: string; size?: number; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setFailed(false);
    QRCode.toDataURL(value, { margin: 1, width: size * 2, color: { dark: "#000000", light: "#ffffff" } })
      .then((url) => {
        if (live) setSrc(url);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [value, size]);

  if (failed) {
    return <p className="text-[12.5px] text-ink-2">The code could not be drawn. Use the link instead.</p>;
  }
  if (!src) {
    return <span className="block rounded-[6px] bg-surface-2" style={{ width: size, height: size }} />;
  }
  return (
    <img
      src={src}
      alt={label}
      width={size}
      height={size}
      className="rounded-[6px] bg-white p-1.5"
      data-testid="qr-code"
    />
  );
}
