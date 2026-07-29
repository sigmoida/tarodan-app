/** @format */

/** Tiny sparkline of the last 7 points, used inside stat cards. */
export default function MiniChart({
  data,
  color,
}: {
  data: number[];
  color: string;
}) {
  if (data.length === 0) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  return (
    <div className="flex h-8 items-end gap-0.5">
      {data.slice(-7).map((value, i) => (
        <div
          key={i}
          className={`w-1.5 rounded-full ${color}`}
          style={{
            height: `${((value - min) / range) * 100}%`,
            minHeight: "4px",
            opacity: 0.3 + i / 10,
          }}
        />
      ))}
    </div>
  );
}
