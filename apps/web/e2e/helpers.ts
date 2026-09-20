import type { Locator, Page } from "@playwright/test";

/**
 * Pill controls put the input under sr-only and let the label carry the hit area, which is
 * what a finger and a screen reader both use. Tests click the same thing.
 */
export function pill(scope: Page | Locator, text: string): Locator {
  return scope.locator("label").filter({ hasText: text }).first();
}
