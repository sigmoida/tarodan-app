/** @format */

'use client';

import { FormInput, FormTextarea } from '@tarodan/ui/form';
import { SectionCard } from '@/components/ui';

/** "Temel Bilgiler" — title + description. Shared by new & edit forms. */
export default function TitleDescriptionCard() {
	return (
		<SectionCard title='Temel Bilgiler'>
			<div className='space-y-4'>
				<FormInput
					name='title'
					label='Başlık *'
					placeholder="Örn: Hot Wheels '69 Camaro Z28"
					maxLength={200}
				/>
				<FormTextarea
					name='description'
					label='Açıklama'
					placeholder='Ürün hakkında detaylı bilgi...'
					rows={5}
					maxLength={5000}
				/>
			</div>
		</SectionCard>
	);
}
