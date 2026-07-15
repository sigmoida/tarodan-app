/** @format */

'use client';

import { useEffect, useState } from 'react';
import {
	PlusIcon,
	ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { Badge, Button, Input, Radio, Spinner, Textarea } from '@tarodan/ui';
import CityDistrictSelector from '@/components/CityDistrictSelector';
import { formatTL } from '@/lib/format';
import { useLocale, useTranslations } from "next-intl";
import { useSavedAddresses, useSetAddressAndPay } from '../_hooks/useOrderDetail';
import { orderAmountOf, type OrderDetail } from '../_lib/types';

/** Ödeme bekleyen alıcı: adres seç/ekle + güvenli ödeme akışı. */
export default function PaymentSection({ order }: { order: OrderDetail }) {
	const locale = useLocale();
	const isPendingPaymentBuyer = order.isBuyer && order.status === 'pending_payment';

	const addressesQuery = useSavedAddresses(isPendingPaymentBuyer);
	const setAddressAndPay = useSetAddressAndPay(order.id);

	const [initialized, setInitialized] = useState(false);
	const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
	const [showNewAddressForm, setShowNewAddressForm] = useState(false);
	const [newAddress, setNewAddress] = useState({
		fullName: '',
		phone: '',
		city: '',
		district: '',
		address: '',
		zipCode: '',
	});

	const savedAddresses = addressesQuery.data ?? [];

	useEffect(() => {
		if (initialized) return;
		if (addressesQuery.isError) {
			setShowNewAddressForm(true);
			setInitialized(true);
			return;
		}
		if (!addressesQuery.isSuccess) return;
		const addrs = addressesQuery.data;
		if (addrs.length === 0) {
			setShowNewAddressForm(true);
		} else {
			const orderAddr =
				order.shippingAddress != null && typeof order.shippingAddress === 'object'
					? (order.shippingAddress as any)
					: null;
			const match =
				orderAddr?.city &&
				addrs.find(
					(a: any) =>
						a.city === orderAddr.city &&
						a.district === orderAddr.district &&
						(a.address === orderAddr.addressLine1 || a.address === orderAddr.address),
				);
			const defaultAddr = addrs.find((a: any) => a.isDefault);
			if (match) setSelectedAddressId(match.id);
			else if (defaultAddr) setSelectedAddressId(defaultAddr.id);
			else if (addrs[0]?.id) setSelectedAddressId(addrs[0].id);
		}
		setInitialized(true);
	}, [
		initialized,
		addressesQuery.isSuccess,
		addressesQuery.isError,
		addressesQuery.data,
		order,
	]);

	if (!isPendingPaymentBuyer) return null;

	const orderAmount = orderAmountOf(order);
	const busy = setAddressAndPay.isPending;

	const handlePay = () =>
		setAddressAndPay.mutate({
			order,
			showNewAddressForm,
			newAddress,
			selectedAddressId,
			savedAddresses,
		});

	return (
		<div className='bg-surface-elevated rounded-xl shadow-sm overflow-hidden'>
			{/* Header banner */}
			<div className='bg-gradient-to-r from-primary-500 to-primary-600 px-6 py-4'>
				<h2 className='text-lg font-semibold text-inverted'>
					{locale === 'en' ? 'Complete Your Payment' : 'Ödemenizi Tamamlayın'}
				</h2>
				<p className='text-sm text-primary-100 mt-1'>
					{locale === 'en'
						? 'Your offer has been accepted. Complete the payment to finalize the purchase.'
						: 'Teklifiniz kabul edildi. Satın alma işlemini tamamlamak için ödeme yapın.'}
				</p>
			</div>

			<div className='p-6 space-y-6'>
				{/* Section 1: Teslimat Adresi */}
				<div>
					<div className='flex items-center gap-2 mb-3'>
						<span className='flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs font-bold'>
							1
						</span>
						<h3 className='font-semibold text-heading'>
							{locale === 'en' ? 'Delivery Address' : 'Teslimat Adresi'}
						</h3>
					</div>

					{!initialized ? (
						<div className='flex items-center gap-2 text-sm text-muted py-4'>
							<Spinner size='sm' color='border-border border-t-primary-500' />
							{locale === 'en' ? 'Loading addresses...' : 'Adresler yükleniyor...'}
						</div>
					) : !showNewAddressForm ? (
						<div className='space-y-2'>
							{savedAddresses.map((addr: any) => (
								<label
									key={addr.id}
									className={`flex items-center gap-3 p-3.5 border-2 rounded-lg cursor-pointer transition-all ${
										selectedAddressId === addr.id
											? 'border-primary-500 bg-primary-50'
											: 'border-border hover:border-border'
									}`}>
									<Radio
										name='shippingAddress'
										checked={selectedAddressId === addr.id}
										onChange={() => setSelectedAddressId(addr.id)}
										className='text-primary-500'
									/>
									<div className='flex-1 min-w-0'>
										<p className='text-sm font-medium text-heading'>
											{addr.title || addr.fullName}
										</p>
										<p className='text-xs text-muted mt-0.5'>
											{addr.address}, {addr.district}/{addr.city}
										</p>
									</div>
									{addr.isDefault && (
										<Badge variant='primary' size='sm'>
											{locale === 'en' ? 'Default' : 'Varsayılan'}
										</Badge>
									)}
								</label>
							))}
							<Button
								variant='secondary'
								type='button'
								onClick={() => {
									setShowNewAddressForm(true);
									setSelectedAddressId(null);
								}}
								className='flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium py-2'>
								<PlusIcon className='w-4 h-4' />
								{locale === 'en' ? 'Add new address' : 'Yeni adres ekle'}
							</Button>
						</div>
					) : (
						<div className='space-y-3'>
							{savedAddresses.length > 0 && (
								<Button
									variant='secondary'
									type='button'
									onClick={() => {
										setShowNewAddressForm(false);
										if (!selectedAddressId && savedAddresses.length > 0) {
											setSelectedAddressId(savedAddresses[0].id);
										}
									}}
									className='text-sm text-primary-600 hover:text-primary-700 font-medium'>
									&larr; {locale === 'en' ? 'Back to saved addresses' : 'Kayıtlı adreslere dön'}
								</Button>
							)}
							<div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
								<div>
									<label className='block text-sm font-medium text-body mb-1'>
										{locale === 'en' ? 'Full Name' : 'Ad Soyad'} *
									</label>
									<Input
										type='text'
										value={newAddress.fullName}
										onChange={(e) =>
											setNewAddress((a) => ({ ...a, fullName: e.target.value }))
										}
										placeholder={locale === 'en' ? 'John Doe' : 'Ahmet Yılmaz'}
									/>
								</div>
								<div>
									<label className='block text-sm font-medium text-body mb-1'>
										{locale === 'en' ? 'Phone' : 'Telefon'} *
									</label>
									<Input
										type='tel'
										value={newAddress.phone}
										onChange={(e) =>
											setNewAddress((a) => ({ ...a, phone: e.target.value }))
										}
										placeholder='05XX XXX XX XX'
									/>
								</div>
							</div>
							<CityDistrictSelector
								city={newAddress.city}
								district={newAddress.district}
								onCityChange={(city) =>
									setNewAddress((a) => ({ ...a, city, district: '' }))
								}
								onDistrictChange={(district) =>
									setNewAddress((a) => ({ ...a, district }))
								}
							/>
							<div>
								<label className='block text-sm font-medium text-body mb-1'>
									{locale === 'en' ? 'Address' : 'Adres'} *
								</label>
								<Textarea
									value={newAddress.address}
									onChange={(e) =>
										setNewAddress((a) => ({ ...a, address: e.target.value }))
									}
									rows={2}
									className='py-2.5 resize-none'
									placeholder={
										locale === 'en'
											? 'Street, building, floor...'
											: 'Mahalle, sokak, bina, kat...'
									}
								/>
							</div>
							<div className='sm:w-1/2'>
								<label className='block text-sm font-medium text-body mb-1'>
									{locale === 'en' ? 'Postal Code' : 'Posta Kodu'}
								</label>
								<Input
									type='text'
									value={newAddress.zipCode}
									onChange={(e) =>
										setNewAddress((a) => ({ ...a, zipCode: e.target.value }))
									}
									placeholder='34000'
								/>
							</div>
						</div>
					)}
				</div>

				{/* Section 2: Secure payment via PayTR */}
				<div>
					<div className='flex items-center gap-2 mb-3'>
						<span className='flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs font-bold'>
							2
						</span>
						<h3 className='font-semibold text-heading'>
							{locale === 'en' ? 'Secure Payment' : 'Güvenli Ödeme'}
						</h3>
					</div>

					<div className='p-4 bg-surface border border-border rounded-lg flex items-start gap-3'>
						<ShieldCheckIcon className='w-5 h-5 text-success-500 mt-0.5 flex-shrink-0' />
						<p className='text-sm text-muted'>
							{locale === 'en'
								? "You'll enter your card on our secure payment page (3D Secure). Your card details are never stored on our servers — they're processed via PayTR over 256-bit SSL."
								: 'Kart bilgilerinizi güvenli ödeme sayfamızda gireceksiniz (3D Secure). Kart bilgileriniz sunucularımızda saklanmaz; PayTR altyapısıyla 256-bit SSL üzerinden işlenir.'}
						</p>
					</div>
				</div>

				{/* Ödeme Yap - adres zorunlu */}
				<div>
					<Button
						variant='success'
						size='lg'
						className='w-full flex items-center justify-center gap-2 text-base'
						onClick={handlePay}
						disabled={
							busy ||
							(!showNewAddressForm && !selectedAddressId) ||
							(showNewAddressForm &&
								(!newAddress.fullName ||
									!newAddress.phone ||
									!newAddress.city ||
									!newAddress.district ||
									!newAddress.address))
						}>
						<ShieldCheckIcon className='w-5 h-5' />
						{busy
							? locale === 'en'
								? 'Processing...'
								: 'İşleniyor...'
							: `${locale === 'en' ? 'Pay' : 'Ödeme Yap'} – ${formatTL(orderAmount)}`}
					</Button>
				</div>
			</div>
		</div>
	);
}
