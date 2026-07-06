/** @format */

'use client';

import { useState } from 'react';
import { ExclamationTriangleIcon, TrashIcon } from '@heroicons/react/24/outline';
import { Button, Input, Modal } from '@tarodan/ui';
import SectionCard from '@/components/ui/SectionCard';
import { useDeleteAccount } from '../_hooks/useDeleteAccount';

/** Account deletion — type-to-confirm modal. */
export default function DangerZoneSection() {
	const del = useDeleteAccount();
	const [open, setOpen] = useState(false);
	const [confirmText, setConfirmText] = useState('');

	const close = () => {
		setOpen(false);
		setConfirmText('');
	};

	return (
		<SectionCard
			title='Tehlikeli Bölge'
			className='border-danger-200 bg-danger-50'
			action={
				<Button
					type='button'
					variant='danger'
					size='sm'
					className='gap-1'
					onClick={() => setOpen(true)}>
					<TrashIcon className='h-4 w-4' />
					Hesabı Sil
				</Button>
			}>
			<p className='text-sm text-danger-700'>
				Hesabınızı ve tüm verilerinizi kalıcı olarak silin. Bu işlem geri alınamaz.
			</p>

			<Modal isOpen={open} onClose={close} title='Hesabı Sil?' maxWidth='max-w-md'>
				<div className='mb-6 text-center'>
					<div className='mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-danger-100'>
						<ExclamationTriangleIcon className='h-8 w-8 text-danger-600' />
					</div>
					<p className='text-muted'>
						Bu işlem geri alınamaz. Tüm verileriniz, ilanlarınız ve sipariş geçmişiniz kalıcı
						olarak silinecektir.
					</p>
				</div>
				<label className='mb-2 block text-sm font-medium text-body'>
					Onaylamak için SİL yazın:
				</label>
				<Input
					value={confirmText}
					onChange={(e) => setConfirmText(e.target.value)}
					placeholder='SİL'
				/>
				<div className='mt-6 flex gap-3'>
					<Button variant='secondary' className='flex-1' onClick={close}>
						İptal
					</Button>
					<Button
						variant='danger'
						className='flex-1'
						disabled={confirmText !== 'SİL'}
						isLoading={del.isPending}
						onClick={() => del.mutate()}>
						Evet, Sil
					</Button>
				</div>
			</Modal>
		</SectionCard>
	);
}
