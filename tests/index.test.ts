import { describe, expect, it } from "bun:test";
import { add, subtract } from "../src/index";

describe("Math functions", () => {
  it("should add two numbers", () => {
    expect(add(2, 3)).toBe(5);
  });

  it("should subtract two numbers", () => {
    expect(subtract(5, 3)).toBe(2);
  });
});
