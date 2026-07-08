/** @format */

'use client';

import { XMarkIcon } from '@heroicons/react/24/outline';
import { IconButton } from '@tarodan/ui';

export interface ImagePreviewGridProps {
	/** Resolved preview URLs, in display order. */
	urls: string[];
	/** Remove the image at `index`. */
	onRemove: (index: number) => void;
	className?: string;
}

const FALLBACK = 'https://placehold.co/200x200/f3f4f6/9ca3af?text=Resim';

/**
 * Compact grid of uploaded-image thumbnails with a design-system delete button.
 * Small squares (more per row) so a few photos don't dominate the form; the
 * remove control is a rounded icon button that surfaces on hover/focus and
 * turns danger-colored on interaction. Shared by the new- and edit-listing forms.
 */
export default function ImagePreviewGrid({
	urls,
	onRemove,
	className = '',
}: ImagePreviewGridProps) {
	if (urls.length === 0) return null;
	return (
		<div
			className={`grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 ${className}`.trim()}>
			{urls.map((url, index) => (
				<div
					key={index}
					className='group relative aspect-square overflow-hidden rounded-lg border border-border bg-surface'>
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img
						src={url}
						alt={`Görsel ${index + 1}`}
						className='h-full w-full object-cover'
						onError={(e) => {
							(e.target as HTMLImageElement).src = FALLBACK;
						}}
					/>
					<IconButton
						variant='ghost'
						size='xs'
						onClick={() => onRemove(index)}
						aria-label='Görseli kaldır'
						className='absolute right-1.5 top-1.5 rounded-full bg-surface-elevated/90 text-muted shadow-sm ring-1 ring-border backdrop-blur-sm hover:bg-danger-500 hover:text-inverted opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100'>
						<XMarkIcon className='h-4 w-4' />
					</IconButton>
				</div>
			))}
		</div>
	);
}
