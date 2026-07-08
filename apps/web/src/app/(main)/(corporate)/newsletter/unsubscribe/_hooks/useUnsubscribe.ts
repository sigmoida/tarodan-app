'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useZodForm } from '@tarodan/ui/form';
import { api } from '@/lib/api';
import { useTranslation } from '@/i18n/LanguageContext';
import { unsubscribeSchema, type UnsubscribeValues } from '../_lib/schema';

/**
 * Newsletter unsubscribe. A `token` in the URL triggers a one-shot GET (link
 * flow); the email form is an RHF+zod form + mutation. Loading/success/error
 * derive from the query + mutation state.
 */
export function useUnsubscribe() {
	const { locale } = useTranslation();
	const token = useSearchParams().get('token');

	const tokenQuery = useQuery({
		queryKey: ['newsletter-unsubscribe', token],
		queryFn: async () =>
			(
				await api.get(
					`/newsletter/unsubscribe?token=${encodeURIComponent(token!)}`,
				)
			).data,
		enabled: !!token,
		retry: false,
		meta: { page: 'newsletter-unsubscribe' },
	});

	useEffect(() => {
		if (tokenQuery.isSuccess) toast.success(tokenQuery.data?.message);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [tokenQuery.isSuccess]);
	useEffect(() => {
		if (tokenQuery.isError)
			toast.error(
				(tokenQuery.error as any)?.response?.data?.message ||
					(locale === 'en'
						? 'Invalid or expired link'
						: 'Geçersiz veya süresi dolmuş link'),
			);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [tokenQuery.isError]);

	const form = useZodForm(unsubscribeSchema(locale), {
		defaultValues: { email: '', feedback: '' },
	});

	const emailUnsub = useMutation({
		mutationFn: (values: UnsubscribeValues) =>
			api.post('/newsletter/unsubscribe', { email: values.email }),
		onSuccess: ({ data }) => toast.success(data.message),
		onError: (err: any) =>
			toast.error(
				err.response?.data?.message ||
					(locale === 'en' ? 'Request failed' : 'İstek başarısız'),
			),
	});

	return {
		form,
		onSubmit: (values: UnsubscribeValues) => emailUnsub.mutate(values),
		processing: !!token && tokenQuery.isLoading,
		unsubscribed: tokenQuery.isSuccess || emailUnsub.isSuccess,
		isSubmitting: emailUnsub.isPending,
	};
}
