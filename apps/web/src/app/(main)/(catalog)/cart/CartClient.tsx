/** @format */

'use client';

import { useEffect } from 'react';
import toast from 'react-hot-toast';
import { useCartStore } from '@/stores/cartStore';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/i18n';
import { PageShell } from '@/components/layout/PageShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Container } from '@/components/layout/Container';
import { useBuyerFee } from './_hooks/useBuyerFee';
import type { CartLineItem } from './_lib/types';
import CartItemCard from './_components/CartItemCard';
import CartSummary from './_components/CartSummary';
import CartSkeleton from './_components/CartSkeleton';
import EmptyCart from './_components/EmptyCart';

export default function CartClient() {
	const {
		items,
		offlineItems,
		subtotal,
		isLoading,
		fetchCart,
		removeFromCart,
		totalDiscount,
		appliedDiscounts,
	} = useCartStore();
	const { isAuthenticated } = useAuthStore();
	const { t, locale } = useTranslation();

	const buyerFee = useBuyerFee(items);

	useEffect(() => {
		fetchCart();
	}, [fetchCart]);

	const handleRemove = async (productId: string) => {
		try {
			await removeFromCart(productId);
			toast.success(t('product.removedFromCart'));
		} catch {
			toast.error(t('product.removeFromCartFailed'));
		}
	};

	const handleOfflineRemove = (itemId: string) => {
		const filtered = offlineItems.filter((item) => item.id !== itemId);
		useCartStore.setState({ offlineItems: filtered });
		fetchCart();
		toast.success(t('product.removedFromCart'));
	};

	if (isLoading && items.length === 0) return <CartSkeleton />;

	const hasOnlineItems = items.length > 0;
	const hasOfflineItems = offlineItems.length > 0;
	if (!hasOnlineItems && !hasOfflineItems) return <EmptyCart />;

	// One normalized list feeds a single CartItemCard for both authed + guest rows.
	const lines: CartLineItem[] = [
		...items.map((item) => ({
			key: item.id,
			productId: item.productId,
			image: item.productImage,
			title: item.productTitle,
			sellerName: item.sellerName,
			price: item.effectivePrice ?? 0,
			originalPrice: item.originalPrice,
			onRemove: () => handleRemove(item.productId),
		})),
		...(!isAuthenticated
			? offlineItems.map((item) => ({
					key: item.id,
					productId: item.productId,
					image: item.imageUrl,
					title: item.title,
					sellerName: item.seller.displayName,
					price: item.price,
					originalPrice: undefined,
					onRemove: () => handleOfflineRemove(item.id),
				}))
			: []),
	];

	// Shipping is shown at checkout, not here.
	const grandTotal = Math.max(0, subtotal - (totalDiscount ?? 0)) + buyerFee;

	return (
		<PageShell>
			<PageHeader
				title={t('cart.myCart')}
				description={`${lines.length} ${locale === 'en' ? 'items' : 'ürün'}`}
			/>

			<Container className='px-4 py-5'>
				<div className='grid lg:grid-cols-3 gap-8'>
					<div className='lg:col-span-2 space-y-4'>
						{lines.map((line) => (
							<CartItemCard key={line.key} item={line} />
						))}
					</div>

					<div className='lg:col-span-1'>
						<CartSummary
							subtotal={subtotal}
							appliedDiscounts={appliedDiscounts}
							buyerFee={buyerFee}
							grandTotal={grandTotal}
							isAuthenticated={isAuthenticated}
						/>
					</div>
				</div>
			</Container>
		</PageShell>
	);
}
