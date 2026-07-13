import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { authApi } from '@/services/api';
import { registerSchema, type RegisterForm } from '../_lib/schema';

/**
 * Register controller — owns the RHF+zod form, the register mutation and the
 * back handler. Lifted verbatim from the monolithic screen (§12).
 */
export function useRegister() {
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      acceptTerms: false,
      // Maestro spinner DateField'ı süremez; test modunda geçerli (18+) bir
      // doğum tarihi öndoldurulur. Prod'da EXPO_PUBLIC_MAESTRO unset → '' .
      birthDate: process.env.EXPO_PUBLIC_MAESTRO === '1' ? '1990-01-01' : '',
    },
  });

  const registerMutation = useMutation({
    mutationFn: (data: RegisterForm) =>
      authApi.register({
        displayName: data.displayName,
        email: data.email,
        password: data.password,
        birthDate: data.birthDate,
      }),
    onSuccess: () => router.replace('/(auth)/login'),
  });

  const onSubmit = (data: RegisterForm) => registerMutation.mutate(data);

  const handleBack = () => (router.canGoBack() ? router.back() : router.replace('/(auth)/login'));

  return { control, handleSubmit, errors, registerMutation, onSubmit, handleBack };
}

export type RegisterController = ReturnType<typeof useRegister>;
