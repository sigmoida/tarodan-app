/** @format */

'use client';

import { useEffect } from 'react';
import { TrashIcon } from '@heroicons/react/24/outline';
import { Badge, Button } from '@tarodan/ui';
import { Form, FormInput, useZodForm } from '@tarodan/ui/form';
import SectionCard from '@/components/ui/SectionCard';
import { useConfirm } from '@/components/ConfirmProvider';
import { useAuthStore } from '@/stores/authStore';
import { formatIbanDisplay } from '../_lib/iban';
import { bankAccountSchema, type BankAccountValues } from '../_lib/schemas';
import {
	useBankAccount,
	useSaveBankAccount,
	useDeleteBankAccount,
} from '../_hooks/useBankAccount';

const EMPTY: BankAccountValues = { accountHolder: '', iban: '', tcKimlikNo: '', taxId: '' };

/** Seller IBAN — independent query + upsert/delete, RHF+zod form. */
export default function BankAccountSection() {
	const { isAuthenticated } = useAuthStore();
	const confirm = useConfirm();
	const { account } = useBankAccount(isAuthenticated);
	const save = useSaveBankAccount();
	const remove = useDeleteBankAccount();

	const form = useZodForm(bankAccountSchema, { defaultValues: EMPTY });

	useEffect(() => {
		if (account) {
			form.reset({
				accountHolder: account.accountHolder || '',
				iban: formatIbanDisplay(account.iban || ''),
				tcKimlikNo: account.tcKimlikNo || '',
				taxId: account.taxId || '',
			});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [account]);

	const onDelete = async () => {
		const ok = await confirm({
			title: 'Banka hesabını sil',
			description: 'Banka hesabınızı silmek istediğinize emin misiniz?',
			confirmLabel: 'Sil',
			destructive: true,
		});
		if (ok) remove.mutate(undefined, { onSuccess: () => form.reset(EMPTY) });
	};

	return (
		<SectionCard
			title='Banka Hesabı / IBAN'
			badge={
				account ? (
					<Badge variant={account.isVerified ? 'success' : 'warning'} size='sm'>
						{account.isVerified ? 'Doğrulandı' : 'Doğrulanmadı'}
					</Badge>
				) : undefined
			}
			action={
				<div className='flex gap-2'>
					{account && (
						<Button
							type='button'
							variant='ghost'
							size='sm'
							onClick={onDelete}
							className='gap-1 text-danger-600 hover:bg-danger-50 hover:text-danger-600'>
							<TrashIcon className='h-4 w-4' />
							Sil
						</Button>
					)}
					<Button
						type='button'
						size='sm'
						onClick={form.handleSubmit((v) => save.mutate(v))}
						isLoading={save.isPending}>
						{account ? 'Güncelle' : 'Kaydet'}
					</Button>
				</div>
			}>
			<p className='mb-4 text-sm text-muted'>
				Satışlarınızdan elde ettiğiniz tutar bu IBAN&apos;a aktarılır.
			</p>
			<Form form={form} onSubmit={(v) => save.mutate(v)} className='space-y-4'>
				<FormInput name='accountHolder' label='Hesap Sahibi' placeholder='Ad Soyad / Firma Ünvanı' />
				<FormInput name='iban' label='IBAN' placeholder='TR.. .... .... ....' className='font-mono' />
				<div className='grid gap-4 md:grid-cols-2'>
					<FormInput name='tcKimlikNo' label='TC Kimlik No (opsiyonel)' placeholder='11 rakam' />
					<FormInput name='taxId' label='Vergi No (opsiyonel)' placeholder='Kurumsal hesaplar için' />
				</div>
				{account && (
					<p className='text-xs text-muted'>
						Bilgileri güncellerseniz hesabınız yeniden doğrulanana kadar
						&quot;Doğrulanmadı&quot; durumuna döner.
					</p>
				)}
			</Form>
		</SectionCard>
	);
}
