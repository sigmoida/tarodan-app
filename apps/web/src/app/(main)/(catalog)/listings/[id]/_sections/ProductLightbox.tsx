/** @format */

'use client';

import {
	XMarkIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	MagnifyingGlassPlusIcon,
	MagnifyingGlassMinusIcon,
} from '@heroicons/react/24/outline';
import { Button } from '@tarodan/ui';
import OptimizedImage from '@/components/OptimizedImage';
import { PLACEHOLDER } from '../_lib/images';
import { useListingDetail } from '../_context/ListingDetailContext';

export default function ProductLightbox() {
	const {
		listing,
		images,
		isLightboxOpen,
		lightboxImageIndex,
		setLightboxImageIndex,
		zoomLevel,
		setZoomLevel,
		panPosition,
		setPanPosition,
		isDragging,
		closeLightbox,
		handleZoomIn,
		handleZoomOut,
		handleWheel,
		handleMouseDown,
		handleMouseMove,
		handleMouseUp,
	} = useListingDetail();

	if (!isLightboxOpen || !listing) return null;

	return (
		<div
			className='fixed inset-0 bg-heading/90 z-50 flex items-center justify-center p-4'
			onClick={closeLightbox}>
			<div
				className='relative max-w-7xl w-full h-full flex flex-col'
				onClick={(e) => e.stopPropagation()}>
				{/* Close */}
				<Button
					variant='secondary'
					onClick={closeLightbox}
					className='absolute top-4 right-4 z-10 w-10 h-10 bg-surface-elevated/10 hover:bg-surface-elevated/20 rounded-full flex items-center justify-center text-inverted transition-colors'>
					<XMarkIcon className='w-6 h-6' />
				</Button>

				{/* Zoom controls */}
				<div className='absolute top-4 left-4 z-10 flex gap-2'>
					<Button
						variant='secondary'
						onClick={handleZoomIn}
						className='w-10 h-10 bg-surface-elevated/10 hover:bg-surface-elevated/20 rounded-full flex items-center justify-center text-inverted transition-colors'
						disabled={zoomLevel >= 3}>
						<MagnifyingGlassPlusIcon className='w-5 h-5' />
					</Button>
					<Button
						variant='secondary'
						onClick={handleZoomOut}
						className='w-10 h-10 bg-surface-elevated/10 hover:bg-surface-elevated/20 rounded-full flex items-center justify-center text-inverted transition-colors'
						disabled={zoomLevel <= 1}>
						<MagnifyingGlassMinusIcon className='w-5 h-5' />
					</Button>
				</div>

				{/* Image */}
				<div
					className='flex-1 flex items-center justify-center overflow-hidden'
					onWheel={handleWheel}
					onMouseDown={handleMouseDown}
					onMouseMove={handleMouseMove}
					onMouseUp={handleMouseUp}
					onMouseLeave={handleMouseUp}
					style={{
						cursor:
							zoomLevel > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
					}}>
					<div
						className='relative'
						style={{
							transform: `scale(${zoomLevel}) translate(${panPosition.x / zoomLevel}px, ${panPosition.y / zoomLevel}px)`,
							transition: isDragging ? 'none' : 'transform 0.2s ease-out',
						}}>
						<OptimizedImage
							src={images[lightboxImageIndex]}
							alt={listing.title}
							width={1200}
							height={1200}
							className='max-w-[90vw] max-h-[90vh] object-contain'
							fallbackSrc={PLACEHOLDER}
							logContext={{
								listingId: listing.id,
								page: 'listing-detail-lightbox',
							}}
						/>
					</div>
				</div>

				{/* Navigation arrows */}
				{images.length > 1 && (
					<>
						<Button
							variant='secondary'
							onClick={() => {
								setLightboxImageIndex(
									lightboxImageIndex > 0
										? lightboxImageIndex - 1
										: images.length - 1,
								);
								setZoomLevel(1);
								setPanPosition({ x: 0, y: 0 });
							}}
							className='absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-surface-elevated/10 hover:bg-surface-elevated/20 rounded-full flex items-center justify-center text-inverted transition-colors z-10'>
							<ChevronLeftIcon className='w-6 h-6' />
						</Button>
						<Button
							variant='secondary'
							onClick={() => {
								setLightboxImageIndex(
									lightboxImageIndex < images.length - 1
										? lightboxImageIndex + 1
										: 0,
								);
								setZoomLevel(1);
								setPanPosition({ x: 0, y: 0 });
							}}
							className='absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-surface-elevated/10 hover:bg-surface-elevated/20 rounded-full flex items-center justify-center text-inverted transition-colors z-10'>
							<ChevronRightIcon className='w-6 h-6' />
						</Button>
					</>
				)}

				{/* Thumbnails */}
				{images.length > 1 && (
					<div className='flex justify-center gap-2 pb-4 overflow-x-auto px-4'>
						{images.map((img, index) => (
							<Button
								variant='secondary'
								key={index}
								onClick={() => {
									setLightboxImageIndex(index);
									setZoomLevel(1);
									setPanPosition({ x: 0, y: 0 });
								}}
								className={`relative w-16 h-16 rounded overflow-hidden flex-shrink-0 border-2 transition-colors ${
									index === lightboxImageIndex
										? 'border-primary-500'
										: 'border-surface-elevated/20 hover:border-surface-elevated/40'
								}`}>
								<OptimizedImage
									src={img}
									alt=''
									fill
									className='object-cover'
									logContext={{ page: 'listing-detail-lightbox-thumb' }}
								/>
							</Button>
						))}
					</div>
				)}

				{/* Counter */}
				{images.length > 1 && (
					<div className='absolute bottom-4 left-1/2 -translate-x-1/2 bg-surface-elevated/10 backdrop-blur-sm px-4 py-2 rounded text-inverted text-sm'>
						{lightboxImageIndex + 1} / {images.length}
					</div>
				)}
			</div>
		</div>
	);
}
