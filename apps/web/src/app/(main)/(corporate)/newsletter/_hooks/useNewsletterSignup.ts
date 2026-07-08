'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useZodForm } from '@tarodan/ui/form';
import { api } from '@/lib/api';
import { useTranslation } from '@/i18n/LanguageContext';
import { newsletterSchema, type NewsletterValues } from '../_lib/schema';

/** Newsletter signup — RHF+zod form + subscribe mutation (owns toasts). */
export function useNewsletterSignup() {
	const { locale } = useTranslation();
	const [success, setSuccess] = useState(false);
	const form = useZodForm(newsletterSchema(locale), {
		defaultValues: { email: '', newsletter: true, promotions: true },
	});

	const subscribe = useMutation({
		mutationFn: (values: NewsletterValues) =>
			api.post('/newsletter/subscribe', {
				email: values.email,
				newsletter: values.newsletter,
				promotions: values.promotions,
			}),
		onSuccess: ({ data }) => {
			setSuccess(true);
			toast.success(data.message);
		},
		onError: (err: any) =>
			toast.error(
				err.response?.data?.message ||
					(locale === 'en' ? 'Subscription failed' : 'Abonelik başarısız'),
			),
	});

	return {
		form,
		onSubmit: (values: NewsletterValues) => subscribe.mutate(values),
		isSubmitting: subscribe.isPending,
		success,
	};
}
