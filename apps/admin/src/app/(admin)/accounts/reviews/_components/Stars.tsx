import { StarIcon } from '@heroicons/react/24/outline';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';

/** Five-star rating display (filled up to `score`). */
export function Stars({ score }: { score: number }) {
  return (
    <div className="flex text-warning-500">
      {[...Array(5)].map((_, i) =>
        i < score ? (
          <StarIconSolid key={i} className="h-4 w-4" />
        ) : (
          <StarIcon key={i} className="h-4 w-4" />
        ),
      )}
    </div>
  );
}
