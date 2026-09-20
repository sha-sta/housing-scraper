import { describe, expect, it } from "vitest";
import { render, templateVariables } from "../src/outreach/render.ts";
import { makeListing, makeProfile } from "./helpers.ts";

describe("render", () => {
  it("substitutes plain placeholders", () => {
    expect(render("Hello {{name}}, about {{place}}.", { name: "Dana", place: "3210 Guilford Ave" })).toBe(
      "Hello Dana, about 3210 Guilford Ave.",
    );
  });

  it("accepts whitespace inside the braces", () => {
    expect(render("Hi {{ name }}", { name: "Dana" })).toBe("Hi Dana");
  });

  it("renders a missing variable as an empty string", () => {
    expect(render("Hi {{name}}, welcome", {})).toBe("Hi, welcome");
  });

  it("drops a line that held nothing but an empty variable", () => {
    const out = render("Hello\n{{me.phone}}\nThanks", {});
    expect(out).toBe("Hello\nThanks");
  });

  it("keeps a line whose other variables filled in", () => {
    const out = render("{{me.fullName}}\n{{me.email}}\n{{me.phone}}", {
      "me.fullName": "Sam",
      "me.email": "c@example.edu",
      "me.phone": "",
    });
    expect(out).toBe("Sam\nc@example.edu");
  });

  it("removes the whitespace and punctuation an empty variable leaves behind", () => {
    expect(render("I am {{name}}, a student at {{school}}.", { name: "Chris", school: "" })).toBe(
      "I am Chris, a student at.",
    );
    expect(render("Call me at {{phone}} or {{email}} today.", { phone: "", email: "c@x.edu" })).toBe(
      "Call me at or c@x.edu today.",
    );
  });

  it("collapses the blank lines left by dropped lines", () => {
    const out = render("One\n\n{{gone}}\n\nTwo", {});
    expect(out).toBe("One\n\nTwo");
  });

  it("leaves a fully populated template untouched", () => {
    const template = "Line one\n\n  indented two\nLine {{n}}";
    expect(render(template, { n: "three" })).toBe("Line one\n\n  indented two\nLine three");
  });

  it("leaves an unknown placeholder name empty rather than printing the braces", () => {
    expect(render("{{nope}}x", {})).toBe("x");
  });
});

describe("templateVariables", () => {
  it("supplies every variable the contract documents", () => {
    const listing = makeListing({ price: 3000, beds: 5 });
    const profile = makeProfile();
    const variables = templateVariables(listing, profile, {
      fullName: "Sam Rivera",
      email: "c@example.edu",
      phone: "(410) 555-0000",
      school: "Johns Hopkins University",
      blurb: "We are four juniors.",
    });

    expect(Object.keys(variables).sort()).toEqual(
      [
        "contact.company",
        "contact.name",
        "group.size",
        "listing.address",
        "listing.availableDate",
        "listing.beds",
        "listing.price",
        "listing.priceText",
        "listing.title",
        "listing.url",
        "me.blurb",
        "me.email",
        "me.fullName",
        "me.phone",
        "me.school",
        "profile.moveIn",
        "profile.name",
      ].sort(),
    );
    expect(variables["listing.price"]).toBe("$3,000");
    expect(variables["listing.priceText"]).toBe("$3,000 a month");
    expect(variables["listing.availableDate"]).toBe("June 1, 2027");
    expect(variables["listing.url"]).toBe("https://example.com/unit-1");
  });

  it("says per room when the price rents one bedroom", () => {
    const variables = templateVariables(
      makeListing({ price: 850, priceBasis: "room", beds: 5 }),
      makeProfile(),
      { fullName: "", email: "", phone: "", school: "", blurb: "" },
    );
    expect(variables["listing.priceText"]).toBe("$850 per room");
  });

  it("leaves a missing date and a missing contact name empty", () => {
    const variables = templateVariables(makeListing({ availableDate: null }), makeProfile(), {
      fullName: "",
      email: "",
      phone: "",
      school: "",
      blurb: "",
    });
    expect(variables["listing.availableDate"]).toBe("");
    expect(variables["contact.name"]).toBe("");
  });
});
