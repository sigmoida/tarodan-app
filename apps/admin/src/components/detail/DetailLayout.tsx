import { type ReactNode } from "react";
import { cn } from "@tarodan/ui";

/** Detay sayfası iskeleti: ana sütun (2/3) + isteğe bağlı yan sütun (1/3). */
export function DetailLayout({
  main,
  aside,
  className,
}: {
  main: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-1 gap-6 lg:grid-cols-3", className)}>
      <div
        className={cn("space-y-6", aside ? "lg:col-span-2" : "lg:col-span-3")}
      >
        {main}
      </div>
      {aside && <div className="space-y-6">{aside}</div>}
    </div>
  );
}
