/** @format */

'use client';

import { CalendarIcon } from '@heroicons/react/24/outline';
import { Button, Toggle } from '@tarodan/ui';
import type { MembershipDetails } from '../_lib/types';

function fmtDate(iso?: string) {
	return iso
		? new Date(iso).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' })
		: '-';
}

interface Props {
	membership: MembershipDetails;
	autoRenewSaving: boolean;
	cancelling: boolean;
	onToggleAutoRenew: (next: boolean) => void;
	onCancel: () => void;
}

/** Logged-in, paid-tier management: dates + auto-renew + cancel. */
export default function CurrentMembershipCard({
	membership,
	autoRenewSaving,
	cancelling,
	onToggleAutoRenew,
	onCancel,
}: Props) {
	const isCancelled = membership.status === 'cancelled';

	return (
		<div className='mx-auto max-w-4xl rounded-lg border border-border bg-surface-elevated p-6'>
			<h2 className='text-lg font-bold text-heading'>Mevcut Üyelik Bilgileri</h2>

			<div className='mt-6 grid grid-cols-1 gap-4 md:grid-cols-2'>
				<div className='flex items-start gap-3'>
					<div className='rounded-lg bg-info-50 p-2.5'>
						<CalendarIcon className='h-5 w-5 text-info-600' />
					</div>
					<div>
						<p className='text-sm text-muted'>Üyelik Başlangıç Tarihi</p>
						<p className='font-semibold text-heading'>{fmtDate(membership.currentPeriodStart)}</p>
					</div>
				</div>
				<div className='flex items-start gap-3'>
					<div className='rounded-lg bg-success-50 p-2.5'>
						<CalendarIcon className='h-5 w-5 text-success-600' />
					</div>
					<div>
						<p className='text-sm text-muted'>
							{isCancelled ? 'Geçerlilik Bitiş Tarihi' : 'Yenilenme Tarihi'}
						</p>
						<p className='font-semibold text-heading'>{fmtDate(membership.currentPeriodEnd)}</p>
					</div>
				</div>
			</div>

			{/* Otomatik yenileme — hatırlatma tabanlı (sessiz çekim yok) */}
			<div className='mt-6 border-t border-border pt-6'>
				<div className='flex items-start justify-between gap-4'>
					<div>
						<h3 className='font-semibold text-heading'>Otomatik Yenileme</h3>
						<p className='mt-1 text-sm text-muted'>
							Etkinleştirildiğinde üyeliğiniz dönem sonunda seçtiğiniz plana göre kayıtlı
							kartınızdan otomatik yenilenir. Devre dışı bırakırsanız ücret tahsil edilmez.
						</p>
					</div>
					<Toggle
						checked={!!membership.autoRenew}
						onChange={onToggleAutoRenew}
						disabled={autoRenewSaving}
						label='Otomatik yenileme'
					/>
				</div>
			</div>

			{/* Üyelik iptali */}
			<div className='mt-6 border-t border-border pt-6'>
				{isCancelled ? (
					<div className='rounded-lg border border-warning-200 bg-warning-50 p-4'>
						<p className='text-sm font-medium text-warning-800'>
							Üyeliğiniz iptal edildi — {fmtDate(membership.currentPeriodEnd)} tarihine kadar tüm
							özellikleriniz aktif kalır. Sonrasında otomatik olarak ücretsiz plana geçilir.
						</p>
					</div>
				) : (
					<div className='flex items-start justify-between gap-4'>
						<div>
							<h3 className='font-semibold text-heading'>Üyeliği İptal Et</h3>
							<p className='mt-1 text-sm text-muted'>
								İptal ettiğinizde mevcut dönem sonuna kadar özelliklerinizi kullanmaya devam
								edersiniz; sonra ücretsiz plana geçilir. Ücret iadesi yapılmaz.
							</p>
						</div>
						<Button
							variant='danger'
							onClick={onCancel}
							disabled={cancelling}
							className='flex-shrink-0'>
							{cancelling ? 'İptal Ediliyor...' : 'Üyeliği İptal Et'}
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
