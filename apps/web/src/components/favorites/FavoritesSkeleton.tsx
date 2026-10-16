/** @format */

export default function FavoritesSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="h-40 rounded bg-border-subtle sm:h-64" />
      ))}
    </div>
  );
}
