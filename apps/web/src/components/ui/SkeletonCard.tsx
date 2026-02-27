interface SkeletonCardProps {
  layout?: 'grid' | 'list';
}

export default function SkeletonCard({ layout = 'grid' }: SkeletonCardProps) {
  if (layout === 'list') {
    return (
      <div className="bg-white rounded-md border border-gray-100 flex gap-4 p-4 animate-pulse">
        <div className="w-32 h-32 flex-shrink-0 skeleton rounded-lg" />
        <div className="flex-1 space-y-3 py-1">
          <div className="skeleton h-4 w-3/4 rounded" />
          <div className="skeleton h-3 w-1/2 rounded" />
          <div className="skeleton h-5 w-1/3 rounded mt-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-md border border-gray-100 overflow-hidden">
      <div className="aspect-square skeleton" />
      <div className="p-3 space-y-2.5">
        <div className="skeleton h-4 w-3/4 rounded" />
        <div className="skeleton h-3 w-1/2 rounded" />
        <div className="skeleton h-5 w-1/3 rounded" />
      </div>
    </div>
  );
}
