import { expect, test } from "vitest";
import { mergeMessages } from "./messageMerge";

test("appends a new message in createdAt order", () => {
  const existing = [{ id: "a", createdAt: "2026-06-19T10:00:00Z" }];
  const incoming = { id: "b", createdAt: "2026-06-19T10:01:00Z" };
  const result = mergeMessages(existing, incoming);
  expect(result.map((m) => m.id)).toEqual(["a", "b"]);
});

test("dedupes by id (no duplicate)", () => {
  const existing = [{ id: "a", createdAt: "2026-06-19T10:00:00Z" }];
  const incoming = { id: "a", createdAt: "2026-06-19T10:00:00Z" };
  const result = mergeMessages(existing, incoming);
  expect(result.length).toBe(1);
});

test("inserts out-of-order message at correct position", () => {
  const existing = [
    { id: "a", createdAt: "2026-06-19T10:00:00Z" },
    { id: "c", createdAt: "2026-06-19T10:02:00Z" },
  ];
  const incoming = { id: "b", createdAt: "2026-06-19T10:01:00Z" };
  const result = mergeMessages(existing, incoming);
  expect(result.map((m) => m.id)).toEqual(["a", "b", "c"]);
});
