import { Avatar } from "@tarodan/ui";
import { TruncatedText } from "@/components/table";

/**
 * Marka / üretici satırının ilk hücresi: logo (yoksa baş harf) + ad + slug.
 * İki tablo aynı hücreyi çizer; tek kaynak burası.
 */
export function LogoNameCell({
  name,
  slug,
  logo,
}: {
  name: string;
  slug: string;
  logo?: string | null;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar
        src={logo ?? undefined}
        alt={name}
        fallback={name.charAt(0).toUpperCase()}
      />
      <div className="min-w-0">
        <TruncatedText className="font-medium text-heading">{name}</TruncatedText>
        <TruncatedText className="text-xs text-muted">{slug}</TruncatedText>
      </div>
    </div>
  );
}
