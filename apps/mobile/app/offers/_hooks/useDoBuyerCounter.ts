import { useMutation } from '@tanstack/react-query';
import { appAlert } from '@tarodan/ui-native';
import { offersApi } from '@/lib/api';
import { formatApiErrorMessage } from '@/utils/formatApiErrorMessage';
import { useInvalidateOffers } from './useInvalidateOffers';

/** Alıcının (daha düşük) karşı teklifi (BuyerCounterModal sahiplenir). */
export function useDoBuyerCounter() {
  const invalidate = useInvalidateOffers();
  return useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) =>
      offersApi.buyerCounter(id, amount),
    onSuccess: () => {
      invalidate();
      appAlert('Başarılı', 'Karşı teklifiniz gönderildi; satıcı yanıtlayacak');
    },
    onError: (err) =>
      appAlert('Hata', formatApiErrorMessage(err, 'Karşı teklif gönderilirken hata oluştu')),
  });
}
