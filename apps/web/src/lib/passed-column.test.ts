import { beforeEach, describe, expect, it } from "vitest";
import { readPassedOpen, writePassedOpen } from "./passed-column.ts";

describe("the folded Passed column", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts folded away", () => {
    expect(readPassedOpen()).toBe(false);
  });

  it("remembers being opened", () => {
    writePassedOpen(true);
    expect(readPassedOpen()).toBe(true);
  });

  it("remembers being folded again", () => {
    writePassedOpen(true);
    writePassedOpen(false);
    expect(readPassedOpen()).toBe(false);
  });

  it("stays folded for a value it does not recognise", () => {
    window.localStorage.setItem("housing.pipelinePassed", "maybe");
    expect(readPassedOpen()).toBe(false);
  });
});
