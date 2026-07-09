import { useMutation } from '@tanstack/react-query';
import { appAlert } from '@tarodan/ui-native';
import { offersApi } from '@/lib/api';
import { formatApiErrorMessage } from '@/utils/formatApiErrorMessage';
import { useInvalidateOffers } from './useInvalidateOffers';

/** Satıcının karşı teklifi (CounterOfferModal sahiplenir). */
export function useDoCounterOffer() {
  const invalidate = useInvalidateOffers();
  return useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) =>
      offersApi.counter(id, amount),
    onSuccess: () => {
      invalidate();
      appAlert('Başarılı', 'Karşı teklif gönderildi');
    },
    onError: (err) =>
      appAlert('Hata', formatApiErrorMessage(err, 'Karşı teklif gönderilirken hata oluştu')),
  });
}
