import { describe, expect, it } from "bun:test";
import { slugify } from "../../src/utils/text";

describe("slugify", () => {
  it("should convert text to lowercase", () => {
    expect(slugify("HELLO WORLD")).toBe("hello-world");
  });

  it("should replace spaces with hyphens", () => {
    expect(slugify("hello world")).toBe("hello-world");
  });

  it("should remove special characters", () => {
    expect(slugify("hello@world!")).toBe("helloworld");
  });

  it("should handle multiple spaces", () => {
    expect(slugify("hello   world")).toBe("hello-world");
  });

  it("should trim whitespace", () => {
    expect(slugify("  hello world  ")).toBe("hello-world");
  });

  it("should handle empty string", () => {
    expect(slugify("")).toBe("");
  });

  it("should handle names with apostrophes", () => {
    expect(slugify("John O'Brien")).toBe("john-obrien");
  });

  it("should handle unicode characters", () => {
    expect(slugify("Café Müller")).toBe("caf-mller");
  });

  it("should collapse multiple hyphens", () => {
    expect(slugify("hello---world")).toBe("hello-world");
  });

  it("should handle real-world entity names", () => {
    expect(slugify("Elon Musk")).toBe("elon-musk");
    expect(slugify("OpenAI Inc.")).toBe("openai-inc");
    expect(slugify("New York City")).toBe("new-york-city");
  });
});
