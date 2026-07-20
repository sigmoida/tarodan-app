import Image from "next/image";

function getInitials(value?: string | null): string {
  if (!value?.trim()) return "?";
  const parts = value.trim().split(/\s+/);
  return (
    parts.length > 1
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`
      : value.slice(0, 2)
  ).toUpperCase();
}

const SIZE_STYLES = {
  sm: { box: "h-6 w-6 text-xs", sizes: "24px" },
  lg: { box: "h-14 w-14 text-lg", sizes: "56px" },
} as const;

/**
 * Server-friendly avatar for the home spotlights/collections: renders the image
 * when a usable URL is present, otherwise falls back to the name's initials.
 */
export default function HomeAvatar({
  name,
  avatarUrl,
  size = "lg",
  className = "",
}: {
  name?: string | null;
  avatarUrl?: string | null;
  size?: "sm" | "lg";
  className?: string;
}) {
  const hasImage =
    !!avatarUrl &&
    (avatarUrl.startsWith("/") || /^https?:\/\//.test(avatarUrl));
  const style = SIZE_STYLES[size];

  return (
    <div
      className={`relative flex ${style.box} flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-500 font-bold text-inverted ${className}`}
    >
      {hasImage ? (
        <Image
          src={avatarUrl}
          alt={name || "Avatar"}
          fill
          className="object-cover"
          sizes={style.sizes}
          unoptimized
        />
      ) : (
        getInitials(name)
      )}
    </div>
  );
}
