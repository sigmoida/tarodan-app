/** @format */

import type { DailyPoint } from "../_lib/types";

/** Daily-views bar chart with hover tooltips. */
export default function SimpleBarChart({ data }: { data: DailyPoint[] }) {
  const maxViews = Math.max(...data.map((d) => d.views), 1);

  return (
    <div className="flex h-48 items-end gap-1">
      {data.map((item, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1">
          <div
            className="group relative w-full cursor-pointer rounded-t-lg bg-gradient-to-t from-primary-500 to-primary-400 transition-colors hover:from-primary-600 hover:to-primary-500"
            style={{
              height: `${(item.views / maxViews) * 100}%`,
              minHeight: "8px",
            }}
          >
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-heading px-2 py-1 text-xs text-inverted opacity-0 transition-opacity group-hover:opacity-100">
              {item.views} görüntüleme
            </div>
          </div>
          <span className="w-8 origin-top-left -rotate-45 truncate text-2xs text-subtle">
            {new Date(item.date).toLocaleDateString("tr-TR", {
              day: "numeric",
              month: "short",
            })}
          </span>
        </div>
      ))}
    </div>
  );
}
