/** @format */

import { describe, expect, it, vi } from "vitest";

const get = vi.hoisted(() => vi.fn());

vi.mock("./client", () => ({ api: { get } }));

import { MANUFACTURERS_WITH_LISTINGS_PATH, manufacturersApi } from "./catalog";

describe("manufacturersApi", () => {
  it("vitrin listesi yalnız aktif ilanı olan üreticileri ister", async () => {
    await manufacturersApi.findAll();

    expect(MANUFACTURERS_WITH_LISTINGS_PATH).toBe(
      "/manufacturers?hasListings=true",
    );
    expect(get).toHaveBeenCalledWith(MANUFACTURERS_WITH_LISTINGS_PATH);
  });
});
