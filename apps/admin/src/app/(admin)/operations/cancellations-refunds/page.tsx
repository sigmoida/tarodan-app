import { redirect } from "next/navigation";
import { isLegacyRefundsView, refundsHref } from "../refunds/_lib/screenTabs";
import { CancellationsScreen } from "./_components/CancellationsScreen";

/**
 * İptaller. İadeler artık kendi ekranı (`/operations/refunds`): eski
 * `?view=refunds` adresi (yer imleri, panonun kuyruk linkleri) filtreleriyle
 * birlikte oraya yönlenir.
 */
export default async function CancellationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  if (isLegacyRefundsView(query)) redirect(refundsHref(query));
  return <CancellationsScreen />;
}
