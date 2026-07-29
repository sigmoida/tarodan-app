/** @format */

const SOCIAL = [
  {
    name: "Instagram",
    href: "https://www.instagram.com/tarodan.com.tr/",
    handle: "/tarodan.com.tr",
  },
  {
    name: "Facebook",
    href: "https://www.facebook.com/tarodan.com.tr/",
    handle: "/tarodan.com.tr",
  },
  {
    name: "TikTok",
    href: "https://www.tiktok.com/@tarodan.com.tr",
    handle: "/tarodan.com.tr",
  },
];

export default function SocialLinks({ title }: { title?: string }) {
  return (
    <div>
      {title && <p className="mb-2 text-sm font-medium text-body">{title}</p>}
      <div className="flex flex-col divide-y divide-border-subtle border-y border-border-subtle">
        {SOCIAL.map((s) => (
          <a
            key={s.name}
            href={s.href}
            aria-label={s.name}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 items-center justify-between gap-4 py-2 text-sm transition-colors hover:text-primary-700"
          >
            <span className="font-medium text-heading">{s.name}</span>
            <span className="text-muted">{s.handle}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
