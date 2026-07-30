import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  HOME_TOUR_VERSION,
  ONBOARDING_TOURS,
  resolvePreferredLocale,
  shouldStartHomeTour,
  shouldStartTour,
} from "../src/lib/userExperiencePolicy.mjs";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("starts the current home tour only for an authenticated ready user", () => {
  assert.equal(
    shouldStartHomeTour({
      isAuthenticated: true,
      isLoading: false,
      completedVersion: 0,
    }),
    true,
  );
  assert.equal(
    shouldStartHomeTour({
      isAuthenticated: false,
      isLoading: false,
      completedVersion: 0,
    }),
    false,
  );
  assert.equal(
    shouldStartHomeTour({
      isAuthenticated: true,
      isLoading: true,
      completedVersion: 0,
    }),
    false,
  );
});

test("does not repeat a completed home tour", () => {
  assert.equal(
    shouldStartHomeTour({
      isAuthenticated: true,
      isLoading: false,
      completedVersion: HOME_TOUR_VERSION,
    }),
    false,
  );
});

test("resolves a supported saved language only when navigation is needed", () => {
  assert.equal(resolvePreferredLocale("en", "tr"), "en");
  assert.equal(resolvePreferredLocale("tr", "en"), "tr");
  assert.equal(resolvePreferredLocale("tr", "tr"), null);
  assert.equal(resolvePreferredLocale("de", "tr"), null);
  assert.equal(resolvePreferredLocale(undefined, "tr"), null);
});

test("keeps stable home tour targets in the rendered marketplace controls", () => {
  const header = readFileSync(
    join(webRoot, "src/components/layout/Header.tsx"),
    "utf8",
  );
  const search = readFileSync(
    join(webRoot, "src/components/layout/header/HeaderSearch.tsx"),
    "utf8",
  );
  const account = readFileSync(
    join(webRoot, "src/components/layout/header/AccountMenu.tsx"),
    "utf8",
  );
  const product = readFileSync(
    join(
      webRoot,
      "src/app/[locale]/(main)/_home/sections/HomeProductCard.tsx",
    ),
    "utf8",
  );

  assert.match(header, /data-tour="new-listing"/);
  assert.match(header, /data-tour="cart"/);
  assert.match(search, /data-tour="search"/);
  assert.match(account, /data-tour="account"/);
  assert.match(product, /data-tour=\{index === 0 \? "home-product"/);
});

test("exposes the saved language preference from the profile settings page", () => {
  const profilePage = readFileSync(
    join(webRoot, "src/app/[locale]/(main)/profile/page.tsx"),
    "utf8",
  );
  const userApi = readFileSync(join(webRoot, "src/lib/api/user.ts"), "utf8");

  assert.match(profilePage, /LanguagePreferenceSection/);
  assert.match(userApi, /preferredLanguage\?: "tr" \| "en"/);
  // Tur tamamlama artık tek uç üzerinden tur anahtarıyla gidiyor.
  assert.match(userApi, /me\/onboarding\/tour/);
});

test("her tanımlı tur kendi sürüm alanıyla bağımsız ilerler", () => {
  for (const [tour, config] of Object.entries(ONBOARDING_TOURS)) {
    assert.equal(
      shouldStartTour({
        isAuthenticated: true,
        isLoading: false,
        completedVersion: 0,
        tour,
      }),
      true,
      `${tour} turu hiç görülmemişse açılmalı`,
    );
    assert.equal(
      shouldStartTour({
        isAuthenticated: true,
        isLoading: false,
        completedVersion: config.version,
        tour,
      }),
      false,
      `${tour} turu tamamlanmışsa tekrar açılmamalı`,
    );
  }
});

test("bilinmeyen tur anahtarı turu açmaz", () => {
  assert.equal(
    shouldStartTour({
      isAuthenticated: true,
      isLoading: false,
      completedVersion: 0,
      tour: "nope",
    }),
    false,
  );
});

test("tur alanları API ile aynı adları taşır", () => {
  // Alan adı ayrışırsa tur ya hiç açılmaz ya her girişte tekrar açılır.
  assert.equal(ONBOARDING_TOURS.home.field, "homeTourVersion");
  assert.equal(ONBOARDING_TOURS.listing.field, "listingTourVersion");
});

test("ilan verme turunun hedefleri formda duruyor", () => {
  const newListing = readFileSync(
    join(
      webRoot,
      "src/app/[locale]/(main)/(catalog)/listings/new/NewListingClient.tsx",
    ),
    "utf8",
  );

  for (const anchor of [
    "listing-basics",
    "listing-details",
    "listing-pricing",
    "listing-images",
    "listing-submit",
  ]) {
    assert.match(newListing, new RegExp(`data-tour="${anchor}"`));
  }
});

test("tur kaydırma ofseti sticky başlığı ölçüyor", () => {
  // Ofset sabitlenirse kategori barı göründüğünde spotlight yine başlığın
  // altında kalır; ölçüm tutamağının kaybolmaması kritik.
  const header = readFileSync(
    join(webRoot, "src/components/layout/Header.tsx"),
    "utf8",
  );
  const theme = readFileSync(
    join(webRoot, "src/components/onboarding/tourTheme.ts"),
    "utf8",
  );

  assert.match(header, /data-sticky-header/);
  assert.match(theme, /\[data-sticky-header\]/);
});
