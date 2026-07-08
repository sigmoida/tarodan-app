/** @format */

'use client';

import { DocumentArrowDownIcon } from '@heroicons/react/24/outline';
import { Badge, Button, Spinner } from '@tarodan/ui';
import { SectionCard } from '@/components/ui';

interface PaymentDetailsCardProps {
	payment: any;
	isCompleted: boolean;
	invoice: { id: string } | null;
	invoiceError: boolean;
	downloading: boolean;
	onDownload: () => void;
	locale: string;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className='flex justify-between'>
			<span className='text-muted'>{label}</span>
			<span className='font-semibold'>{children}</span>
		</div>
	);
}

export default function PaymentDetailsCard({
	payment,
	isCompleted,
	invoice,
	invoiceError,
	downloading,
	onDownload,
	locale,
}: PaymentDetailsCardProps) {
	const en = locale === 'en';
	return (
		<SectionCard title={en ? 'Payment Details' : 'Ödeme Detayları'} className='text-left'>
			<div className='space-y-2 text-sm'>
				<Row label={en ? 'Payment Amount:' : 'Ödeme Tutarı:'}>
					{payment.amount?.toLocaleString('tr-TR', {
						minimumFractionDigits: 2,
						maximumFractionDigits: 2,
					})}{' '}
					TL
				</Row>
				<Row label={en ? 'Payment Method:' : 'Ödeme Yöntemi:'}>PayTR</Row>
				{payment.providerTransactionId && (
					<Row label={en ? 'Transaction ID:' : 'İşlem No:'}>
						<span className='font-mono text-xs'>{payment.providerTransactionId}</span>
					</Row>
				)}
				<div className='flex justify-between'>
					<span className='text-muted'>{en ? 'Status:' : 'Durum:'}</span>
					<Badge variant={isCompleted ? 'success' : 'warning'}>
						{isCompleted
							? en
								? 'Completed'
								: 'Tamamlandı'
							: en
								? 'Awaiting confirmation'
								: 'Onay bekleniyor'}
					</Badge>
				</div>
			</div>

			{invoice ? (
				<Button
					variant='secondary'
					onClick={onDownload}
					disabled={downloading}
					isLoading={downloading}
					className='mt-4 w-full'
					leftIcon={<DocumentArrowDownIcon className='h-5 w-5' />}>
					{downloading
						? en
							? 'Downloading...'
							: 'İndiriliyor...'
						: en
							? 'Download Invoice (PDF)'
							: 'Faturayı İndir (PDF)'}
				</Button>
			) : !invoiceError ? (
				<div className='mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border-subtle bg-surface px-4 py-3 text-sm font-medium text-subtle'>
					<Spinner size='sm' />
					{en ? 'Preparing Invoice...' : 'Fatura Hazırlanıyor...'}
				</div>
			) : null}
		</SectionCard>
	);
}
