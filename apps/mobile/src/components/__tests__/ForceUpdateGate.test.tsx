/**
 * #233 · Force-update gate — mobile UI slice.
 * Blocks the whole app when the API (#232) reports the build is below the
 * minimum supported version; renders nothing otherwise; the CTA opens the store.
 * (Version comparison itself is server-side / #232 — mocked here via the hook.)
 */
import React from "react";
import { Linking } from "react-native";
import { screen, fireEvent } from "@testing-library/react-native";
import ForceUpdateGate from "../ForceUpdateGate";
import { renderWithProviders } from "../../test-utils";

let mockState: {
  updateRequired: boolean;
  updateAvailable: boolean;
  storeUrl: string | null;
  isLoading: boolean;
};

jest.mock("@/hooks/useForceUpdate", () => ({
  useForceUpdate: () => mockState,
}));

const STORE_URL = "https://apps.apple.com/app/id6786614139";

describe("ForceUpdateGate (#233)", () => {
  beforeEach(() => {
    mockState = {
      updateRequired: false,
      updateAvailable: false,
      storeUrl: STORE_URL,
      isLoading: false,
    };
    jest.spyOn(Linking, "openURL").mockResolvedValue(true as never);
  });

  afterEach(() => jest.restoreAllMocks());

  it("renders nothing when no update is required (fail-open)", () => {
    renderWithProviders(<ForceUpdateGate />);
    expect(screen.queryByText("Güncelleme gerekli")).toBeNull();
  });

  it("blocks with an update screen when the build is below minimum", () => {
    mockState.updateRequired = true;
    renderWithProviders(<ForceUpdateGate />);
    expect(screen.getByText("Güncelleme gerekli")).toBeTruthy();
    expect(screen.getByText("Şimdi güncelle")).toBeTruthy();
  });

  it("opens the store URL when the update button is pressed", () => {
    mockState.updateRequired = true;
    renderWithProviders(<ForceUpdateGate />);
    fireEvent.press(screen.getByText("Şimdi güncelle"));
    expect(Linking.openURL).toHaveBeenCalledWith(STORE_URL);
  });
});
