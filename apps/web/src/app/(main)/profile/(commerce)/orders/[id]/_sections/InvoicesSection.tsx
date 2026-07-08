/** @format */

'use client';

import { useRef } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@tarodan/ui';
import { SectionCard } from '@/components/ui';
import { useTranslation } from '@/i18n';
import {
	useDownloadElogoInvoice,
	useDownloadSellerInvoice,
	useElogoInvoice,
	useSellerInvoice,
	useUploadSellerInvoice,
} from '../_hooks/useOrderDetail';
import type { OrderDetail } from '../_lib/types';

export default function InvoicesSection({ order }: { order: OrderDetail }) {
	const { locale } = useTranslation();
	const orderId = order.id;

	const elogoQuery = useElogoInvoice(orderId, order);
	const sellerInvoiceQuery = useSellerInvoice(orderId, order);
	const downloadElogo = useDownloadElogoInvoice();
	const uploadSeller = useUploadSellerInvoice(orderId);
	const downloadSeller = useDownloadSellerInvoice(orderId);
	const sellerInvoiceInputRef = useRef<HTMLInputElement>(null);

	// Ödeme öncesi / iptal edilmiş siparişte fatura kartları gösterilmez.
	const invoiceVisible =
		order.status !== 'pending_payment' && order.status !== 'cancelled';
	const elogoInvoice = invoiceVisible ? (elogoQuery.data ?? null) : null;
	const sellerInvoice = invoiceVisible ? (sellerInvoiceQuery.data ?? null) : null;

	// Kurumsal satıcı: siparişe fatura PDF yükle/değiştir (yükleme öncesi doğrulama).
	const handleSellerInvoiceFile = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (e.target) e.target.value = '';
		if (!file) return;
		if (file.type !== 'application/pdf') {
			toast.error(locale === 'en' ? 'PDF only' : 'Yalnız PDF yükleyebilirsiniz');
			return;
		}
		if (file.size > 10 * 1024 * 1024) {
			toast.error(locale === 'en' ? 'Max 10 MB' : 'PDF en fazla 10 MB olabilir');
			return;
		}
		uploadSeller.mutate(file);
	};

	return (
		<>
			{/* Invoice Section - yalnız gerçek e-Arşiv HAZIRSA çıkar */}
			{elogoInvoice && (
				<SectionCard
					title={
						<span className='flex items-center gap-2'>
							<svg
								className='w-5 h-5 text-success-500'
								fill='none'
								stroke='currentColor'
								viewBox='0 0 24 24'>
								<path
									strokeLinecap='round'
									strokeLinejoin='round'
									strokeWidth={2}
									d='M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'
								/>
							</svg>
							{locale === 'en' ? 'Invoice' : 'Fatura'}
						</span>
					}>
					<div className='flex items-start gap-3 p-3 bg-success-50 rounded-lg border border-success-100'>
						<svg
							className='w-5 h-5 text-success-600 mt-0.5 flex-shrink-0'
							fill='none'
							stroke='currentColor'
							viewBox='0 0 24 24'>
							<path
								strokeLinecap='round'
								strokeLinejoin='round'
								strokeWidth={2}
								d='M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z'
							/>
						</svg>
						<div className='flex-1'>
							<p className='text-sm text-success-800 mb-1'>
								{locale === 'en'
									? 'Your invoice has been sent to your email address.'
									: 'Faturanız e-posta adresinize gönderildi.'}
							</p>
							{elogoInvoice.invoiceNumber && (
								<p className='text-xs text-success-700 mb-2'>
									{(locale === 'en' ? 'No: ' : 'No: ') + elogoInvoice.invoiceNumber}
								</p>
							)}
							<Button
								variant='success'
								size='sm'
								onClick={() => downloadElogo.mutate(elogoInvoice.id)}
								disabled={downloadElogo.isPending}>
								{downloadElogo.isPending
									? locale === 'en'
										? 'Opening...'
										: 'Açılıyor...'
									: locale === 'en'
										? 'View / Download Invoice'
										: 'Faturayı Görüntüle / İndir'}
							</Button>
						</div>
					</div>
				</SectionCard>
			)}

			{/* Kurumsal satıcı faturası (elle yüklenen PDF) */}
			{sellerInvoice &&
				(sellerInvoice.canUpload ||
					(sellerInvoice.invoice && (sellerInvoice.isBuyer || sellerInvoice.isSeller))) && (
					<SectionCard
						title={
							<span className='flex items-center gap-2'>
								<svg
									className='w-5 h-5 text-brand-500'
									fill='none'
									stroke='currentColor'
									viewBox='0 0 24 24'>
									<path
										strokeLinecap='round'
										strokeLinejoin='round'
										strokeWidth={2}
										d='M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'
									/>
								</svg>
								{locale === 'en' ? 'Seller Invoice' : 'Satıcı Faturası'}
							</span>
						}>
						{sellerInvoice.invoice ? (
							<div className='flex items-start gap-3 p-3 bg-surface rounded-lg border border-default'>
								<svg
									className='w-5 h-5 text-brand-600 mt-0.5 flex-shrink-0'
									fill='none'
									stroke='currentColor'
									viewBox='0 0 24 24'>
									<path
										strokeLinecap='round'
										strokeLinejoin='round'
										strokeWidth={2}
										d='M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z'
									/>
								</svg>
								<div className='flex-1 min-w-0'>
									<p className='text-sm text-body truncate'>
										{sellerInvoice.invoice.fileName}
									</p>
									<div className='mt-2 flex flex-wrap gap-2'>
										<Button
											variant='secondary'
											size='sm'
											onClick={() => downloadSeller.mutate()}
											disabled={downloadSeller.isPending}>
											{downloadSeller.isPending
												? locale === 'en'
													? 'Opening...'
													: 'Açılıyor...'
												: locale === 'en'
													? 'View / Download'
													: 'Görüntüle / İndir'}
										</Button>
										{sellerInvoice.canUpload && (
											<Button
												variant='ghost'
												size='sm'
												onClick={() => sellerInvoiceInputRef.current?.click()}
												disabled={uploadSeller.isPending}>
												{uploadSeller.isPending
													? locale === 'en'
														? 'Uploading...'
														: 'Yükleniyor...'
													: locale === 'en'
														? 'Replace'
														: 'Değiştir'}
											</Button>
										)}
									</div>
								</div>
							</div>
						) : (
							<div className='p-3 bg-surface rounded-lg border border-dashed border-default'>
								<p className='text-sm text-muted mb-3'>
									{locale === 'en'
										? 'You can upload the product invoice (PDF) for this order. The buyer will be notified by email.'
										: 'Bu sipariş için ürün faturanızı (PDF) yükleyebilirsiniz. Alıcıya e-posta ile bildirilir.'}
								</p>
								<Button
									variant='primary'
									size='sm'
									onClick={() => sellerInvoiceInputRef.current?.click()}
									disabled={uploadSeller.isPending}>
									{uploadSeller.isPending
										? locale === 'en'
											? 'Uploading...'
											: 'Yükleniyor...'
										: locale === 'en'
											? 'Upload Invoice (PDF)'
											: 'Fatura Yükle (PDF)'}
								</Button>
							</div>
						)}

						<input
							ref={sellerInvoiceInputRef}
							type='file'
							accept='application/pdf'
							className='hidden'
							onChange={handleSellerInvoiceFile}
						/>
					</SectionCard>
				)}
		</>
	);
}
