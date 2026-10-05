import { Empty, TruncatedText } from "@/components/table";

/**
 * Herkese açık (storefront) adres hücresi. `CellLink` yalnız panel içi
 * yollara bağlar; bu adresler başka bir uygulamaya aittir, yeni sekmede açılır.
 */
export function ExternalUrlCell({
  href,
  label,
}: {
  href: string | null;
  label?: string | null;
}) {
  if (!href) return <Empty />;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="block text-primary-600 hover:underline"
    >
      <TruncatedText>{label || href}</TruncatedText>
    </a>
  );
}
