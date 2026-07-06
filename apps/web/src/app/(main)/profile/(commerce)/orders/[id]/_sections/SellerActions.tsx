/** @format */

'use client';

import toast from 'react-hot-toast';
import { TruckIcon } from '@heroicons/react/24/outline';
import { Button } from '@tarodan/ui';
import { SectionCard } from '@/components/ui';
import { useTranslation } from '@/i18n';
import { useUpdateOrderStatus } from '../_hooks/useOrderDetail';
import type { OrderDetail } from '../_lib/types';

export default function SellerActions({ order }: { order: OrderDetail }) {
	const { locale } = useTranslation();
	const updateStatus = useUpdateOrderStatus(order.id);

	if (!order.isSeller) return null;

	if (order.status === 'paid') {
		return (
			<SectionCard title={locale === 'en' ? 'Seller Actions' : 'Satıcı İşlemleri'}>
				<Button
					variant='primary'
					size='lg'
					className='w-full'
					onClick={() => updateStatus.mutate('preparing')}>
					{locale === 'en' ? 'Mark as Preparing' : 'Hazırlanıyor Olarak İşaretle'}
				</Button>
			</SectionCard>
		);
	}

	if (order.status === 'preparing') {
		return (
			<SectionCard
				title={
					<span className='flex items-center gap-2'>
						<TruckIcon className='w-5 h-5' />
						{locale === 'en' ? 'Cargo Reference' : 'Kargo Referans Numarası'}
					</span>
				}>
				<p className='text-muted mb-4'>
					{locale === 'en'
						? 'Hand this number to the Sürat Kargo branch when delivering your package. The shipment is already registered — the branch will retrieve all details automatically.'
						: 'Paketi Sürat Kargo şubesine teslim ederken bu numarayı veriniz. Gönderi zaten sistemde kayıtlıdır — şube tüm bilgileri otomatik olarak alacaktır.'}
				</p>
				<div className='flex items-center gap-2 mb-4'>
					<code className='flex-1 font-mono text-lg bg-surface-alt px-4 py-3 rounded-lg border border-border-default text-center font-semibold tracking-wider'>
						{order.orderNumber}
					</code>
					<Button
						variant='secondary'
						size='md'
						onClick={() => {
							navigator.clipboard.writeText(order.orderNumber);
							toast.success(
								locale === 'en' ? 'Order number copied' : 'Sipariş numarası kopyalandı',
							);
						}}>
						{locale === 'en' ? 'Copy' : 'Kopyala'}
					</Button>
				</div>
				<p className='text-sm text-muted'>
					{locale === 'en'
						? 'Once the branch receives your package, the Sürat tracking number will appear here automatically (within 30 minutes).'
						: 'Şube paketinizi aldığında Sürat takip numarası burada otomatik olarak görünecektir (30 dakika içinde).'}
				</p>
			</SectionCard>
		);
	}

	return null;
}
