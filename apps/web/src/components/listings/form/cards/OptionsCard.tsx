/** @format */

'use client';

import Link from 'next/link';
import { Controller, useFormContext } from 'react-hook-form';
import { Toggle } from '@tarodan/ui';
import { FormInput } from '@tarodan/ui/form';
import { SectionCard } from '@/components/ui';

interface OptionsCardProps {
	locale: string;
	canTrade: boolean;
	/** Show the "Ön Sipariş" (preorder) toggle — edit form only. */
	showPreorder?: boolean;
}

/** "Seçenekler" — trade / (optional preorder) / set toggles + set size. Shared. */
export default function OptionsCard({ locale, canTrade, showPreorder = false }: OptionsCardProps) {
	const { watch } = useFormContext();
	const isSet = watch('isSet');
	const en = locale === 'en';

	return (
		<SectionCard title={en ? 'Options' : 'Seçenekler'}>
			<div className='space-y-4'>
				{/* Trade */}
				<div
					className={`flex items-center justify-between p-4 rounded-xl border ${
						canTrade ? 'bg-success-50 border-success-200' : 'bg-surface border-border'
					}`}>
					<div>
						<label className='font-medium text-heading'>
							{en ? 'Trade enabled' : 'Takas Aktif'}
						</label>
						<p className='text-sm text-muted'>
							{canTrade
								? en
									? 'Also makes this product available for trade'
									: 'Bu ürünü takas için de açık tutar'
								: en
									? 'Trade feature requires Basic or higher membership'
									: 'Takas özelliği Temel veya üstü üyelik gerektirir'}
						</p>
					</div>
					{canTrade ? (
						<Controller
							name='isTradeEnabled'
							render={({ field }) => (
								<Toggle checked={!!field.value} onChange={field.onChange} size='md' />
							)}
						/>
					) : (
						<Link
							href='/membership'
							className='text-sm text-primary-600 hover:text-primary-700 font-medium'>
							{en ? 'Upgrade →' : "Premium'a Geç →"}
						</Link>
					)}
				</div>

				{/* Preorder (edit only) */}
				{showPreorder && (
					<div className='flex items-center justify-between p-4 bg-surface rounded-xl border border-border'>
						<div>
							<label className='font-medium text-heading'>
								{en ? 'Preorder' : 'Ön Sipariş'}
							</label>
							<p className='text-sm text-muted'>
								{en
									? 'Not in stock yet; ships once available'
									: 'Ürün henüz stokta değil; çıkınca gönderilecek'}
							</p>
						</div>
						<Controller
							name='isPreorder'
							render={({ field }) => (
								<Toggle checked={!!field.value} onChange={field.onChange} size='md' />
							)}
						/>
					</div>
				)}

				{/* Set / bundle */}
				<div className='flex items-center justify-between p-4 bg-surface rounded-xl border border-border'>
					<div>
						<label className='font-medium text-heading'>
							{en ? 'Set / Bundle' : 'Set / Paket'}
						</label>
						<p className='text-sm text-muted'>
							{en
								? 'Multiple models in one listing (e.g. 5-pack, garage set)'
								: "Tek ilanda birden fazla model (örn. 5'li paket, garaj seti)"}
						</p>
					</div>
					<Controller
						name='isSet'
						render={({ field }) => (
							<Toggle checked={!!field.value} onChange={field.onChange} size='md' />
						)}
					/>
				</div>

				{isSet && (
					<div className='p-4 bg-surface rounded-xl border border-border'>
						<FormInput
							name='bundleSize'
							type='number'
							min={2}
							label={en ? 'Number of pieces in set' : 'Set Parça Sayısı'}
							placeholder={en ? 'e.g. 5' : 'örn. 5'}
							helperText={
								en
									? "Total number of pieces. Describe each piece's brand/model/color in the description."
									: 'Setteki toplam parça sayısı. Her parçanın marka/model/renk gibi ayrıntılarını açıklamada belirtin.'
							}
						/>
					</div>
				)}
			</div>
		</SectionCard>
	);
}
