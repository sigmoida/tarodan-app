/** @format */

import { describe, expect, it } from "vitest";
import { isOptimizableImage } from "./imageHosts";

describe("isOptimizableImage", () => {
  it("izinli S3 sunucusunu optimize eder", () => {
    expect(
      isOptimizableImage(
        "https://amzn-tarodan.s3.eu-west-1.amazonaws.com/hero/a.png",
      ),
    ).toBe(true);
  });

  it("site-içi yolu optimize eder", () => {
    expect(isOptimizableImage("/img/a.png")).toBe(true);
  });

  it("izinli listede olmayan sunucuyu optimize etmez", () => {
    expect(isOptimizableImage("https://cdn.example.com/a.png")).toBe(false);
  });

  it("bozuk adreste optimize etmez", () => {
    expect(isOptimizableImage("https://")).toBe(false);
  });
});
