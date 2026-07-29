"use client";

import { Button, Checkbox } from "@tarodan/ui";
import {
  useCookiePreferences,
  type CookiePreferences,
} from "../_hooks/useCookiePreferences";

const COOKIE_CATEGORIES = [
  {
    id: "necessary",
    name: "Zorunlu Çerezler",
    description:
      "Platformun temel işlevleri için gereklidir. Devre dışı bırakılamaz.",
    required: true,
    cookies: [
      {
        name: "session_id",
        purpose: "Oturum yönetimi",
        duration: "Oturum süresi",
      },
      {
        name: "csrf_token",
        purpose: "Güvenlik (CSRF koruması)",
        duration: "Oturum süresi",
      },
      {
        name: "cookie_consent",
        purpose: "Çerez tercihlerinin saklanması",
        duration: "1 yıl",
      },
    ],
  },
  {
    id: "functional",
    name: "İşlevsel Çerezler",
    description:
      "Tercihlerinizi hatırlamamıza ve daha iyi deneyim sunmamıza yardımcı olur.",
    required: false,
    cookies: [
      {
        name: "user_preferences",
        purpose: "Dil ve tema tercihleri",
        duration: "1 yıl",
      },
      {
        name: "recent_searches",
        purpose: "Son aramalarınız",
        duration: "30 gün",
      },
      {
        name: "cart_items",
        purpose: "Sepet içeriği (misafir)",
        duration: "7 gün",
      },
    ],
  },
  {
    id: "analytics",
    name: "Analitik Çerezler",
    description:
      "Platformun nasıl kullanıldığını anlamamıza ve iyileştirmemize yardımcı olur.",
    required: false,
    cookies: [
      {
        name: "_ga",
        purpose: "Google Analytics - Kullanıcı kimliği",
        duration: "2 yıl",
      },
      {
        name: "_gid",
        purpose: "Google Analytics - Oturum kimliği",
        duration: "24 saat",
      },
      { name: "analytics_user", purpose: "Dahili analitik", duration: "1 yıl" },
    ],
  },
  {
    id: "marketing",
    name: "Pazarlama Çerezleri",
    description: "Kişiselleştirilmiş reklamlar göstermek için kullanılır.",
    required: false,
    cookies: [
      { name: "_fbp", purpose: "Facebook Pixel", duration: "90 gün" },
      { name: "ads_prefs", purpose: "Reklam tercihleri", duration: "1 yıl" },
    ],
  },
] as const;

export default function CookiePreferencesPanel({
  saveLabel,
  acceptAllLabel,
}: {
  saveLabel: string;
  acceptAllLabel: string;
}) {
  const { preferences, togglePreference, savePreferences, acceptAll } =
    useCookiePreferences();

  return (
    <>
      <div className="space-y-6">
        {COOKIE_CATEGORIES.map((category) => (
          <div
            key={category.id}
            className="border border-border rounded-xl overflow-hidden"
          >
            <div className="p-4 bg-surface flex items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold text-heading">{category.name}</h3>
                <p className="text-sm text-muted">{category.description}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                <Checkbox
                  checked={
                    category.required ||
                    preferences[category.id as keyof CookiePreferences]
                  }
                  onChange={() =>
                    !category.required && togglePreference(category.id)
                  }
                  disabled={category.required}
                  className="sr-only peer"
                />
                <div
                  className={`w-11 h-6 rounded-full peer ${
                    category.required
                      ? "bg-subtle cursor-not-allowed"
                      : "bg-border-subtle peer-checked:bg-primary-500"
                  } peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-surface-elevated after:rounded-full after:h-5 after:w-5 after:transition-all`}
                />
              </label>
            </div>
            <div className="p-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="pb-2">Çerez Adı</th>
                    <th className="pb-2">Amaç</th>
                    <th className="pb-2">Süre</th>
                  </tr>
                </thead>
                <tbody className="text-body">
                  {category.cookies.map((cookie) => (
                    <tr
                      key={cookie.name}
                      className="border-t border-border-subtle"
                    >
                      <td className="py-2 font-mono text-xs">{cookie.name}</td>
                      <td className="py-2">{cookie.purpose}</td>
                      <td className="py-2">{cookie.duration}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button variant="primary" onClick={savePreferences}>
          {saveLabel}
        </Button>
        <Button variant="secondary" onClick={acceptAll}>
          {acceptAllLabel}
        </Button>
      </div>
    </>
  );
}
