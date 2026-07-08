'use client';

import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useZodForm } from '@tarodan/ui/form';
import { supportApi } from '@/lib/api';
import { useTranslation } from '@/i18n';
import { contactSchema, type ContactValues } from '../_lib/schema';

const EMPTY: ContactValues = { name: '', email: '', subject: '', message: '' };

/** Guest contact — RHF+zod form + the send mutation (owns success/error toasts). */
export function useContactForm() {
	const { t, locale } = useTranslation();
	const form = useZodForm(contactSchema(locale), { defaultValues: EMPTY });

	const send = useMutation({
		mutationFn: (values: ContactValues) =>
			supportApi.guestContact({
				name: values.name,
				email: values.email,
				subject: values.subject || undefined,
				message: values.message,
			}),
		onSuccess: (response) => {
			toast.success(response.data.message || t('contact.success'));
			form.reset(EMPTY);
		},
		onError: (error: any) =>
			toast.error(error.response?.data?.message || t('common.operationFailed')),
	});

	return {
		form,
		onSubmit: (values: ContactValues) => send.mutate(values),
		isSending: send.isPending,
	};
}
