/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import { NavigationMenuLink } from "@tarodan/ui";
import NavPanel from "./NavPanel";

export default function ScalesPanel({
  title,
  scales,
}: {
  title: string;
  scales: string[];
}) {
  return (
    <NavPanel>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
        {title}
      </h3>
      <div className="flex flex-wrap gap-2">
        {scales.map((scale) => (
          <NavigationMenuLink asChild key={scale}>
            <Link
              href={`/listings?scale=${encodeURIComponent(scale)}`}
              className="rounded-full border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-primary-200 hover:bg-surface-alt hover:text-primary-600"
            >
              {scale}
            </Link>
          </NavigationMenuLink>
        ))}
      </div>
    </NavPanel>
  );
}
