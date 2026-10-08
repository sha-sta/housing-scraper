export interface Point {
  lat: number;
  lon: number;
}

export interface Platform {
  platform?: string;
  userAgent?: string;
}

/**
 * An iPhone, an iPad or a Mac opens maps.apple.com in Maps, and everything else lands on
 * a web page nobody asked for. navigator.platform is deprecated but still the clearest
 * signal, so the user agent backs it up.
 */
export function isApplePlatform(agent: Platform): boolean {
  const text = `${agent.platform ?? ""} ${agent.userAgent ?? ""}`;
  if (/android/i.test(text)) return false;
  return /iphone|ipad|ipod|mac/i.test(text);
}

const pair = (point: Point) => `${point.lat},${point.lon}`;

/** Walking directions from the profile anchor to a listing, in the device's own maps app. */
export function walkingDirectionsUrl(from: Point, to: Point, agent: Platform): string {
  if (isApplePlatform(agent)) {
    return `https://maps.apple.com/?saddr=${pair(from)}&daddr=${pair(to)}&dirflg=w`;
  }
  return `https://www.google.com/maps/dir/?api=1&origin=${pair(from)}&destination=${pair(to)}&travelmode=walking`;
}

/** What the browser knows about the device it is on. */
export function thisPlatform(): Platform {
  if (typeof navigator === "undefined") return {};
  return { platform: navigator.platform, userAgent: navigator.userAgent };
}
