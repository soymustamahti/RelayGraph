import { describe, expect, it } from "bun:test";
import { slugify } from "../../src/utils/text";

describe("Text Utilities", () => {
  describe("slugify", () => {
    it("should convert to lowercase", () => {
      expect(slugify("HELLO")).toBe("hello");
    });

    it("should replace spaces with hyphens", () => {
      expect(slugify("hello world")).toBe("hello-world");
    });

    it("should remove special characters", () => {
      expect(slugify("hello@world!")).toBe("helloworld");
    });

    it("should handle multiple spaces", () => {
      expect(slugify("hello    world")).toBe("hello-world");
    });

    it("should trim whitespace", () => {
      expect(slugify("  hello  ")).toBe("hello");
    });

    it("should handle mixed case and spaces", () => {
      expect(slugify("Hello World Test")).toBe("hello-world-test");
    });

    it("should remove consecutive hyphens", () => {
      expect(slugify("hello--world")).toBe("hello-world");
    });

    it("should handle empty string", () => {
      expect(slugify("")).toBe("");
    });

    it("should handle numbers", () => {
      expect(slugify("test123")).toBe("test123");
    });

    it("should handle underscores", () => {
      expect(slugify("hello_world")).toBe("hello_world");
    });
  });
});
