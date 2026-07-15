/** @format */

'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { StarIcon } from '@heroicons/react/24/solid';
import { StarIcon as StarOutlineIcon } from '@heroicons/react/24/outline';
import { Button, Input, Modal, Textarea } from '@tarodan/ui';
import OptimizedImage from '@/components/OptimizedImage';
import { useLocale, useTranslations } from "next-intl";
import { useSubmitReview } from '../_hooks/useOrderDetail';
import { getProductInfo, type OrderDetail } from '../_lib/types';

function StarRating({
	value,
	onChange,
	iconClass = 'h-6 w-6',
}: {
	value: number;
	onChange: (n: number) => void;
	iconClass?: string;
}) {
	return (
		<div className='flex gap-0.5'>
			{[1, 2, 3, 4, 5].map((star) => (
				<Button
					key={star}
					type='button'
					variant='ghost'
					onClick={() => onChange(star)}
					className='h-auto w-auto p-1 transition-transform hover:scale-110'>
					{star <= value ? (
						<StarIcon className={`${iconClass} text-warning-400`} />
					) : (
						<StarOutlineIcon className={`${iconClass} text-border-strong`} />
					)}
				</Button>
			))}
		</div>
	);
}

interface ReviewModalProps {
	order: OrderDetail | null;
	orderId: string;
	onClose: () => void;
}

/** Product + seller review for a delivered order (its own form + mutation). */
export default function ReviewModal({ order, orderId, onClose }: ReviewModalProps) {
	const t = useTranslations();
  const locale = useLocale();
	const submitReview = useSubmitReview(orderId);

	const [score, setScore] = useState(5);
	const [title, setTitle] = useState('');
	const [text, setText] = useState('');
	const [images, setImages] = useState<File[]>([]);
	const [previews, setPreviews] = useState<string[]>([]);
	const [communication, setCommunication] = useState(5);
	const [shipping, setShipping] = useState(5);
	const [packaging, setPackaging] = useState(5);
	const [sellerText, setSellerText] = useState('');

	useEffect(() => {
		setScore(5);
		setTitle('');
		setText('');
		setImages([]);
		setPreviews([]);
		setCommunication(5);
		setShipping(5);
		setPackaging(5);
		setSellerText('');
	}, [order?.id]);

	const addImages = (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(e.target.files || []);
		const remaining = 5 - images.length;
		const next = files.slice(0, remaining);
		if (next.length === 0) return;
		setImages((prev) => [...prev, ...next]);
		next.forEach((file) => {
			const reader = new FileReader();
			reader.onload = (ev) =>
				setPreviews((prev) => [...prev, ev.target?.result as string]);
			reader.readAsDataURL(file);
		});
		e.target.value = '';
	};

	const removeImage = (index: number) => {
		setImages((prev) => prev.filter((_, i) => i !== index));
		setPreviews((prev) => prev.filter((_, i) => i !== index));
	};

	const submit = () => {
		if (!order) return;
		const product = getProductInfo(order);
		const productId = product?.id;
		if (!productId) {
			toast.error(t('order.orderNotFound'));
			return;
		}
		submitReview.mutate(
			{
				order,
				productId,
				sellerId: order.seller?.id,
				reviewScore: score,
				reviewTitle: title,
				reviewText: text,
				images,
				sellerCommunication: communication,
				sellerShipping: shipping,
				sellerPackaging: packaging,
				sellerReviewText: sellerText,
			},
			{ onSuccess: onClose },
		);
	};

	const product = order ? getProductInfo(order) : undefined;
	const productImage = product?.imageUrl;

	return (
		<Modal
			isOpen={!!order}
			onClose={onClose}
			title={t('review.reviewOrder')}
			maxWidth='max-w-lg'>
			{/* Product section */}
			<div className='mb-6'>
				<h3 className='mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted'>
					📦 {t('review.productReview')}
				</h3>

				{product && (
					<div className='mb-4 flex items-center gap-3 rounded-lg bg-surface p-3'>
						<div className='relative h-12 w-12 flex-shrink-0 overflow-hidden rounded bg-surface-alt'>
							<OptimizedImage
								src={
									productImage ||
									'https://placehold.co/96x96/f3f4f6/9ca3af?text=%F0%9F%9A%97'
								}
								alt={product.title}
								fill
								className='object-cover'
								fallbackSrc='https://placehold.co/96x96/f3f4f6/9ca3af?text=%F0%9F%9A%97'
							/>
						</div>
						<p className='font-medium text-heading'>{product.title}</p>
					</div>
				)}

				<div className='mb-3'>
					<label className='mb-2 block text-sm font-medium text-body'>
						{t('review.productScore')}
					</label>
					<StarRating value={score} onChange={setScore} iconClass='h-8 w-8' />
				</div>

				<div className='mb-3'>
					<label className='mb-1 block text-sm font-medium text-body'>
						{t('review.titleOptional')}
					</label>
					<Input
						type='text'
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						placeholder={locale === 'en' ? 'E.g.: Great product!' : 'Örn: Harika bir ürün!'}
						maxLength={100}
					/>
				</div>

				<div>
					<label className='mb-1 block text-sm font-medium text-body'>
						{t('review.commentOptional')}
					</label>
					<Textarea
						value={text}
						onChange={(e) => setText(e.target.value)}
						placeholder={
							locale === 'en'
								? 'Share your experience about the product...'
								: 'Ürün hakkında deneyiminizi paylaşın...'
						}
						rows={3}
						maxLength={1000}
					/>
				</div>

				<div className='mt-3'>
					<label className='mb-1 block text-sm font-medium text-body'>
						{locale === 'en' ? 'Photos (optional, max 5)' : 'Fotoğraflar (opsiyonel, maks 5)'}
					</label>
					<div className='flex flex-wrap gap-2'>
						{previews.map((src, idx) => (
							<div
								key={idx}
								className='relative h-16 w-16 overflow-hidden rounded-lg border border-border'>
								<img src={src} alt='' className='h-full w-full object-cover' />
								<Button
									type='button'
									variant='ghost'
									onClick={() => removeImage(idx)}
									className='absolute right-0 top-0 h-5 w-5 rounded-none rounded-bl-lg bg-danger-500 p-0 text-inverted hover:bg-danger-600 hover:text-inverted'>
									×
								</Button>
							</div>
						))}
						{images.length < 5 && (
							<label className='flex h-16 w-16 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border hover:border-primary-400'>
								<span className='text-2xl text-subtle'>+</span>
								<Input type='file' accept='image/*' onChange={addImages} className='hidden' />
							</label>
						)}
					</div>
				</div>
			</div>

			<div className='my-6 border-t border-border' />

			{/* Seller section */}
			<div className='mb-6'>
				<h3 className='mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted'>
					👤 {t('review.sellerReview')}
				</h3>

				{order?.seller && (
					<p className='mb-4 text-sm text-muted'>
						{t('product.seller')}:{' '}
						<span className='font-medium text-heading'>{order.seller.displayName}</span>
					</p>
				)}

				<div className='space-y-3'>
					<div className='flex items-center justify-between'>
						<span className='text-sm text-body'>{t('review.communication')}</span>
						<StarRating value={communication} onChange={setCommunication} iconClass='h-5 w-5' />
					</div>
					<div className='flex items-center justify-between'>
						<span className='text-sm text-body'>{t('review.shippingSpeed')}</span>
						<StarRating value={shipping} onChange={setShipping} iconClass='h-5 w-5' />
					</div>
					<div className='flex items-center justify-between'>
						<span className='text-sm text-body'>{t('review.packaging')}</span>
						<StarRating value={packaging} onChange={setPackaging} iconClass='h-5 w-5' />
					</div>

					<div className='mt-4'>
						<label className='mb-1 block text-sm font-medium text-body'>
							{t('review.sellerComment')}
						</label>
						<Textarea
							value={sellerText}
							onChange={(e) => setSellerText(e.target.value)}
							placeholder={t('review.sellerCommentPlaceholder')}
							rows={3}
							className='resize-none'
						/>
					</div>
				</div>
			</div>

			<div className='flex gap-3'>
				<Button
					variant='secondary'
					className='flex-1'
					onClick={onClose}
					disabled={submitReview.isPending}>
					{t('common.cancel')}
				</Button>
				<Button
					variant='primary'
					className='flex-1'
					onClick={submit}
					disabled={submitReview.isPending}>
					{submitReview.isPending ? t('common.sending') : t('review.submit')}
				</Button>
			</div>
		</Modal>
	);
}
