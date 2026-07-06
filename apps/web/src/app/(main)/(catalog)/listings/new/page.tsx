/** @format */

'use client';

import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { Spinner } from '@tarodan/ui';
import { PageShell } from '@/components/layout/PageShell';
import { PageHeader } from '@/components/layout/PageHeader';
import {
	NewListingProvider,
	useNewListing,
} from './_context/NewListingContext';
import BasicInfoSection from './_sections/BasicInfoSection';
import ProductDetailsSection from './_sections/ProductDetailsSection';
import ManufacturerAttributesSection from './_sections/ManufacturerAttributesSection';
import OptionsSection from './_sections/OptionsSection';
import PricingSection from './_sections/PricingSection';
import ImagesSection from './_sections/ImagesSection';
import SubmitBar from './_sections/SubmitBar';
import { LimitBanner, BankGate } from './_sections/ListingBanners';

function NewListingLayout() {
	const { authLoading, isAuthenticated, hasBankAccount, handleSubmit } =
		useNewListing();

	if (authLoading) {
		return (
			<PageShell className='flex items-center justify-center'>
				<Spinner size='xl' />
			</PageShell>
		);
	}
	if (!isAuthenticated) return null; // the context effect handles the redirect

	return (
		<PageShell>
			<PageHeader
				title='Yeni İlan Oluştur'
				description='Ürününüzü koleksiyoncularla buluşturun'
			/>

			<div className='mx-auto w-full max-w-4xl'>
				<LimitBanner />
				<BankGate />

				{hasBankAccount && (
					<form
						onSubmit={handleSubmit}
						className='space-y-4'>
						<BasicInfoSection />
						<ProductDetailsSection />
						<ManufacturerAttributesSection />
						<OptionsSection />
						<PricingSection />
						<ImagesSection />
						<SubmitBar />
					</form>
				)}
			</div>
		</PageShell>
	);
}

export default function NewListingPage() {
	return (
		<NewListingProvider>
			<NewListingLayout />
		</NewListingProvider>
	);
}
