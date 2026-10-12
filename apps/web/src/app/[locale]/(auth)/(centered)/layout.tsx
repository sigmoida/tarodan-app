import { fetchHeroSlides } from "@/lib/api/hero";
import AuthHeroFrame from "./_components/AuthHeroFrame";

/**
 * Auth ekranlarının ortak iskeleti. Server Component: hero içeriğini panelden
 * (CMS) okur — `auth:hero` etiketiyle önbelleğe alınır, yayın değişince anında
 * tazelenir. Hangi hero'nun gösterileceği yola bağlı (kayıt → `auth_register`,
 * diğerleri → `auth_default`); yol yalnız istemcide bilindiğinden iki yerleşim
 * de çekilip çerçeveye verilir. Hero tanımlı değilse form tek başına çizilir.
 */
export default async function AuthHeroLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [register, fallback] = await Promise.all([
    fetchHeroSlides("auth_register"),
    fetchHeroSlides("auth_default"),
  ]);

  return (
    <AuthHeroFrame
      heroes={{ register: register[0] ?? null, default: fallback[0] ?? null }}
    >
      {children}
    </AuthHeroFrame>
  );
}
