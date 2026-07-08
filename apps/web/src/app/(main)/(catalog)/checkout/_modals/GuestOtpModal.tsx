/** @format */

'use client';

import toast from 'react-hot-toast';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Button, Input } from '@tarodan/ui';
import { useCheckout } from '../_context/CheckoutContext';

export default function GuestOtpModal() {
	const {
		t,
		locale,
		isAuthenticated,
		guestEmail,
		guestOtpSending,
		guestOtpSentForEmail,
		guestOtpModalOpen,
		setGuestOtpModalOpen,
		guestEmailVerificationCode,
		setGuestEmailVerificationCode,
		guestOtpInputRef,
		confirmGuestOtpModal,
		requestGuestCheckoutOtp,
	} = useCheckout();

	if (!guestOtpModalOpen || isAuthenticated) return null;

	const sendingForThisEmail =
		guestOtpSending &&
		guestOtpSentForEmail !== guestEmail.trim().toLowerCase();

	return (
		<div
			className='fixed inset-0 z-[100] flex items-center justify-center p-4 bg-heading/50 backdrop-blur-[1px]'
			role='dialog'
			aria-modal='true'
			aria-labelledby='guest-otp-modal-title'
			onClick={(e) => {
				if (e.target === e.currentTarget) setGuestOtpModalOpen(false);
			}}>
			<div
				className='w-full max-w-md rounded-xl bg-surface-elevated shadow-xl border border-border p-6 space-y-4'
				onClick={(e) => e.stopPropagation()}>
				<div className='flex items-start justify-between gap-3'>
					<h2
						id='guest-otp-modal-title'
						className='text-lg font-semibold text-heading'>
						{t('checkout.guestEmailVerifyTitle')}
					</h2>
					<Button
						variant='secondary'
						type='button'
						onClick={() => setGuestOtpModalOpen(false)}
						className='p-1 rounded-lg text-muted hover:bg-surface-alt'
						aria-label={locale === 'en' ? 'Close' : 'Kapat'}>
						<XMarkIcon className='w-5 h-5' />
					</Button>
				</div>
				<p className='text-sm text-muted'>{t('checkout.guestEmailModalBody')}</p>
				<p className='text-xs font-medium text-primary-600 break-all'>
					{guestEmail.trim()}
				</p>
				{sendingForThisEmail ? (
					<p className='text-sm text-muted'>
						{t('checkout.guestEmailModalSending')}
					</p>
				) : null}
				<Input
					ref={guestOtpInputRef}
					type='text'
					inputMode='numeric'
					autoComplete='one-time-code'
					placeholder={t('checkout.guestEmailOtpPlaceholder')}
					value={guestEmailVerificationCode}
					onChange={(e) =>
						setGuestEmailVerificationCode(
							e.target.value.replace(/\D/g, '').slice(0, 6),
						)
					}
					onKeyDown={(e) => {
						if (
							e.key === 'Enter' &&
							/^\d{6}$/.test(guestEmailVerificationCode.replace(/\D/g, ''))
						) {
							confirmGuestOtpModal();
						}
					}}
					className='rounded-[4px] text-center tracking-[0.35em] font-mono text-xl'
					maxLength={6}
					disabled={sendingForThisEmail}
				/>
				<div className='flex flex-wrap gap-2 pt-1'>
					<Button
						variant='secondary'
						type='button'
						disabled={guestOtpSending || !guestEmail.trim()}
						onClick={async () => {
							const em = guestEmail.trim().toLowerCase();
							if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
								toast.error(t('checkout.enterEmail'));
								return;
							}
							const ok = await requestGuestCheckoutOtp(em);
							if (ok) toast.success(t('checkout.guestEmailCodeSent'));
						}}>
						{guestOtpSending ? '…' : t('checkout.guestEmailSendCode')}
					</Button>
				</div>
				<div className='flex justify-end gap-2 pt-2 border-t border-border-subtle'>
					<Button
						variant='secondary'
						type='button'
						onClick={() => setGuestOtpModalOpen(false)}>
						{t('checkout.guestEmailModalCancel')}
					</Button>
					<Button type='button' onClick={confirmGuestOtpModal}>
						{t('checkout.guestEmailModalConfirm')}
					</Button>
				</div>
			</div>
		</div>
	);
}
