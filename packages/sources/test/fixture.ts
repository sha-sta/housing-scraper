import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export function fixture(adapter: string, name: string): string {
  return readFileSync(join(here, "fixtures", adapter, name), "utf8");
}

export function fixtureJson(adapter: string, name: string): unknown {
  return JSON.parse(fixture(adapter, name));
}
