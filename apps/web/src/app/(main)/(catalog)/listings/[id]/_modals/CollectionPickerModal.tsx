/** @format */

'use client';

import { Button, Spinner } from '@tarodan/ui';
import { useListingDetail } from '../_context/ListingDetailContext';

export default function CollectionPickerModal() {
	const {
		t,
		locale,
		router,
		showCollectionModal,
		setShowCollectionModal,
		collections,
		loadingCollections,
		addingToCollection,
		handleAddToCollection,
	} = useListingDetail();

	if (!showCollectionModal) return null;

	return (
		<div className='fixed inset-0 z-50 flex items-center justify-center bg-heading/50'>
			<div className='bg-surface-elevated rounded p-6 w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col shadow-xl'>
				<h2 className='text-xl font-semibold mb-4 text-heading'>
					{t('collection.addToCollection')}
				</h2>

				{loadingCollections ? (
					<div className='flex justify-center py-8'>
						<Spinner size='lg' color='border-primary-500 border-t-transparent' />
					</div>
				) : (
					<div className='flex-1 overflow-y-auto'>
						<div className='space-y-2'>
							{collections.length > 0 ? (
								collections.map((collection) => (
									<Button
										variant='secondary'
										key={collection.id}
										onClick={() => handleAddToCollection(collection.id)}
										disabled={addingToCollection}
										className='w-full text-left p-4 bg-surface hover:bg-surface-alt rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed'>
										<h3 className='font-medium text-heading'>{collection.name}</h3>
										{collection.description && (
											<p className='text-sm text-muted mt-1 line-clamp-2'>
												{collection.description}
											</p>
										)}
										<p className='text-xs text-muted mt-2'>
											{collection.itemCount || 0}{' '}
											{locale === 'en' ? 'products' : 'ürün'}
										</p>
									</Button>
								))
							) : (
								<p className='text-muted text-center py-8'>
									{t('collection.noCollections')}
								</p>
							)}

							<Button
								variant='secondary'
								onClick={() => {
									setShowCollectionModal(false);
									router.push('/collections');
								}}
								className='w-full p-4 bg-primary-50 hover:bg-primary-100 border-2 border-dashed border-primary-300 rounded transition-colors text-primary-700 font-medium'>
								+ {t('collection.createNewCollection')}
							</Button>
						</div>
					</div>
				)}

				<div className='mt-4 pt-4 border-t border-border'>
					<Button
						variant='secondary'
						onClick={() => setShowCollectionModal(false)}
						className='w-full px-4 py-2 bg-border-subtle hover:bg-border-strong text-body rounded transition-colors font-medium'>
						{t('common.cancel')}
					</Button>
				</div>
			</div>
		</div>
	);
}
