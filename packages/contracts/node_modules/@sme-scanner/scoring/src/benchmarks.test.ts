import { describe, it, expect } from "vitest";
import { getBenchmark } from "./benchmarks";

describe("getBenchmark — trust keys", () => {
  it("returns review_count_min for 餐飲", () => {
    expect(getBenchmark("餐飲", "trust.review_count_min")).toBe(20);
  });

  it("returns review_count_avg for 餐飲", () => {
    expect(getBenchmark("餐飲", "trust.review_count_avg")).toBe(50);
  });

  it("returns rating_min for 美容", () => {
    expect(getBenchmark("美容", "trust.rating_min")).toBe(4.0);
  });

  it("returns rating_avg for 美容", () => {
    expect(getBenchmark("美容", "trust.rating_avg")).toBe(4.2);
  });

  it("returns ig_followers_min for 本地服務", () => {
    expect(getBenchmark("本地服務", "trust.ig_followers_min")).toBe(150);
  });

  it("returns ig_followers_avg for 本地服務", () => {
    expect(getBenchmark("本地服務", "trust.ig_followers_avg")).toBe(400);
  });

  it("falls back to 其他 for unknown industry", () => {
    expect(getBenchmark("unknown", "trust.review_count_min")).toBe(10);
  });

  it("falls back to 其他 for null industry", () => {
    expect(getBenchmark(null, "trust.ig_followers_avg")).toBe(300);
  });

  it("old trust.review_count key returns review_count_min", () => {
    expect(getBenchmark("餐飲", "trust.review_count")).toBe(20);
  });
});
