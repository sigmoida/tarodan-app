/** @format */

'use client';

import { BuildingOffice2Icon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

/** Shown when a company account must buy the business plan before continuing. */
export default function RequiredBusinessBanner() {
	return (
		<div className='rounded-lg border-2 border-warning-300 bg-warning-50 p-6'>
			<div className='flex items-start gap-4'>
				<div className='flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-warning-100'>
					<BuildingOffice2Icon className='h-6 w-6 text-warning-700' />
				</div>
				<div>
					<h3 className='text-lg font-bold text-warning-900'>Business Üyelik Gerekli</h3>
					<p className='mt-1 text-warning-800'>
						Şirket hesabınız için business üyelik almanız gerekmektedir. Üyeliğinizi
						tamamlamadan başka sayfalara geçemezsiniz.
					</p>
					<p className='mt-3 flex items-center gap-2 text-sm text-warning-700'>
						<ExclamationTriangleIcon className='h-4 w-4 flex-shrink-0' />
						Lütfen aşağıdaki business üyelik planını seçip ödemeyi tamamlayın.
					</p>
				</div>
			</div>
		</div>
	);
}
