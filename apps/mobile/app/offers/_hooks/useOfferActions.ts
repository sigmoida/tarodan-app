import { useMutation } from '@tanstack/react-query';
import { appAlert } from '@tarodan/ui-native';
import { offersApi } from '@/lib/api';
import { formatApiErrorMessage } from '@/utils/formatApiErrorMessage';
import { useInvalidateOffers } from './useInvalidateOffers';

/**
 * Kabul / reddet / iptal mutation'ları — snackbar (appAlert) + invalidateQueries
 * sahibi. Ekran manuel refetch etmez; liste otomatik tazelenir.
 *
 * `pendingOfferId`: o an işlemde olan teklifin id'si (kart üzerinde spinner için).
 */
export function useOfferActions() {
  const invalidate = useInvalidateOffers();

  const accept = useMutation({
    mutationFn: (id: string) => offersApi.accept(id),
    onSuccess: () => {
      invalidate();
      appAlert('Başarılı', 'Teklif kabul edildi');
    },
    onError: (err) =>
      appAlert('Hata', formatApiErrorMessage(err, 'Teklif kabul edilirken hata oluştu')),
  });

  const reject = useMutation({
    mutationFn: (id: string) => offersApi.reject(id),
    onSuccess: () => {
      invalidate();
      appAlert('Başarılı', 'Teklif reddedildi');
    },
    onError: (err) =>
      appAlert('Hata', formatApiErrorMessage(err, 'Teklif reddedilirken hata oluştu')),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => offersApi.cancel(id),
    onSuccess: () => {
      invalidate();
      appAlert('Başarılı', 'Teklif iptal edildi');
    },
    onError: (err) =>
      appAlert('Hata', formatApiErrorMessage(err, 'Teklif iptal edilirken hata oluştu')),
  });

  const pendingOfferId =
    (accept.isPending && accept.variables) ||
    (reject.isPending && reject.variables) ||
    (cancel.isPending && cancel.variables) ||
    null;

  return {
    accept: accept.mutate,
    reject: reject.mutate,
    cancel: cancel.mutate,
    pendingOfferId,
  };
}
