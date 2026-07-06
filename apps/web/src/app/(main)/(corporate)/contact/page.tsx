'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { supportApi } from '@/lib/api';
import { useTranslation } from '@/i18n';
import { Button, Input, Textarea } from '@tarodan/ui';
import { SectionCard } from '@/components/ui';
import { DocPage } from '@/components/layout/DocPage';

export default function ContactPage() {
	const { t } = useTranslation();
	const [formData, setFormData] = useState({
		name: '',
		email: '',
		subject: '',
		message: '',
	});
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (isSubmitting) return;

		if (formData.message.length < 10) {
			toast.error(t('contact.messageTooShort'));
			return;
		}

		setIsSubmitting(true);
		try {
			const response = await supportApi.guestContact({
				name: formData.name,
				email: formData.email,
				subject: formData.subject || undefined,
				message: formData.message,
			});
			toast.success(response.data.message || t('contact.success'));
			setFormData({ name: '', email: '', subject: '', message: '' });
		} catch (error: any) {
			toast.error(
				error.response?.data?.message || t('common.operationFailed'),
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<DocPage title={t('contact.title')} description={t('contact.subtitle')}>
			<div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
				{/* Contact info */}
				<SectionCard title={t('information.contactInfo.title')}>
					<dl className='space-y-3 text-sm text-body'>
						<div>
							<dt className='text-muted'>
								{t('information.contactInfo.email')}
							</dt>
							<dd>
								<a
									href={`mailto:${t('information.contactInfo.emailValue')}`}
									className='text-primary-600 hover:underline'>
									{t('information.contactInfo.emailValue')}
								</a>
							</dd>
						</div>
						<div>
							<dt className='text-muted'>
								{t('information.contactInfo.phone')}
							</dt>
							<dd>{t('information.contactInfo.phoneValue')}</dd>
						</div>
						<div>
							<dt className='text-muted'>
								{t('information.contactInfo.address')}
							</dt>
							<dd>{t('information.contactInfo.addressValue')}</dd>
						</div>
					</dl>
				</SectionCard>

				{/* Form */}
				<SectionCard className='lg:col-span-2'>
					<form onSubmit={handleSubmit} className='space-y-5'>
						<div>
							<label className='block text-sm font-medium text-body mb-2'>
								{t('contact.name')}
							</label>
							<Input
								type='text'
								value={formData.name}
								onChange={(e) =>
									setFormData({ ...formData, name: e.target.value })
								}
								required
							/>
						</div>
						<div>
							<label className='block text-sm font-medium text-body mb-2'>
								{t('contact.email')}
							</label>
							<Input
								type='email'
								value={formData.email}
								onChange={(e) =>
									setFormData({ ...formData, email: e.target.value })
								}
								required
							/>
						</div>
						<div>
							<label className='block text-sm font-medium text-body mb-2'>
								{t('contact.subject')}
							</label>
							<Input
								type='text'
								value={formData.subject}
								onChange={(e) =>
									setFormData({ ...formData, subject: e.target.value })
								}
								required
							/>
						</div>
						<div>
							<label className='block text-sm font-medium text-body mb-2'>
								{t('contact.message')}
							</label>
							<Textarea
								value={formData.message}
								onChange={(e) =>
									setFormData({ ...formData, message: e.target.value })
								}
								rows={6}
								required
							/>
						</div>
						<Button
							variant='primary'
							type='submit'
							disabled={isSubmitting}
							className='w-full'>
							{isSubmitting ? t('contact.sending') : t('contact.send')}
						</Button>
					</form>
				</SectionCard>
			</div>
		</DocPage>
	);
}
