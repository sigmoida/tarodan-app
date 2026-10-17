import { TextLink } from "@/components/TextLink";
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
    <TextLink href={href} external className="block">
      <TruncatedText>{label || href}</TruncatedText>
    </TextLink>
  );
}
