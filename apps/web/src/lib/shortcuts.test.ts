import { describe, expect, it } from "vitest";
import { SHORTCUTS, isTypingTarget, nextHighlight } from "./shortcuts.ts";

function element(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  const first = host.firstElementChild;
  if (!(first instanceof HTMLElement)) throw new Error("No element in the markup");
  return first;
}

describe("typing beats shortcuts", () => {
  it("keeps out of every field a reader types in", () => {
    expect(isTypingTarget(element("<input />"))).toBe(true);
    expect(isTypingTarget(element("<textarea></textarea>"))).toBe(true);
    expect(isTypingTarget(element("<select></select>"))).toBe(true);
    expect(isTypingTarget(element('<div contenteditable="true"></div>'))).toBe(true);
  });

  it("fires everywhere else", () => {
    expect(isTypingTarget(element("<article></article>"))).toBe(false);
    expect(isTypingTarget(element("<button></button>"))).toBe(false);
    expect(isTypingTarget(element('<div contenteditable="false"></div>'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("the feed highlight", () => {
  it("starts on the first row whichever way you press", () => {
    expect(nextHighlight(null, 1, 6)).toBe(0);
    expect(nextHighlight(null, -1, 6)).toBe(0);
  });

  it("moves one row at a time", () => {
    expect(nextHighlight(2, 1, 6)).toBe(3);
    expect(nextHighlight(2, -1, 6)).toBe(1);
  });

  it("stops at both ends", () => {
    expect(nextHighlight(0, -1, 6)).toBe(0);
    expect(nextHighlight(5, 1, 6)).toBe(5);
  });

  it("has nowhere to go in an empty feed", () => {
    expect(nextHighlight(null, 1, 0)).toBe(null);
    expect(nextHighlight(3, 1, 0)).toBe(null);
  });
});

describe("the shortcuts sheet", () => {
  it("writes every line in plain words", () => {
    expect(SHORTCUTS.length).toBeGreaterThan(0);
    for (const line of SHORTCUTS) {
      expect(line.keys).toBeTruthy();
      expect(line.what[0]).toBe(line.what[0]?.toUpperCase());
      expect(line.what).not.toContain(String.fromCharCode(0x2014));
    }
  });
});
