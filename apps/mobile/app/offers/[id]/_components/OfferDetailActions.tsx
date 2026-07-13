import { View } from 'react-native';
import { Button, theme, appAlert } from '@tarodan/ui-native';
import { styles } from '../_lib/styles';
import type { OfferDetailController } from '../_hooks/useOfferDetail';

const { colors } = theme;

/** Statü/role-göre aksiyonlar — satıcı kabul/karşı/red, alıcı iptal. Self-gates. */
export function OfferDetailActions({ f }: { f: OfferDetailController }) {
  const { offer, isPending, isSeller, isBuyer, acceptMutation, rejectMutation, cancelMutation, counterMutation } = f;
  if (!offer) return null;

  return (
    <>
      {isPending && isSeller ? (
        <View style={styles.actionsStack}>
          <Button
            variant="success"
            onPress={() => acceptMutation.mutate()}
            isLoading={acceptMutation.isPending}
            disabled={acceptMutation.isPending || rejectMutation.isPending || counterMutation.isPending}
            icon="checkmark"
            fullWidth
            style={styles.actionBtn}
          >
            Kabul Et
          </Button>
          <Button
            variant="outline"
            onPress={f.openCounter}
            disabled={counterMutation.isPending}
            icon="swap-horizontal"
            fullWidth
            style={{ ...styles.actionBtn, borderColor: colors.info[600]! }}
            textStyle={{ color: colors.info[600]! }}
          >
            Karşı Teklif Ver
          </Button>
          <Button
            variant="outline"
            onPress={() =>
              appAlert('Reddet', 'Teklifi reddetmek istediğinize emin misiniz?', [
                { text: 'Vazgeç', style: 'cancel' },
                { text: 'Reddet', style: 'destructive', onPress: () => rejectMutation.mutate() },
              ])
            }
            disabled={rejectMutation.isPending}
            icon="close"
            fullWidth
            style={{ ...styles.actionBtn, borderColor: colors.danger[600]! }}
            textStyle={{ color: colors.danger[600]! }}
          >
            Reddet
          </Button>
        </View>
      ) : null}

      {/* Karşı teklif (buyerMustAccept) geldiyse iptal hakkı kalkar; alıcı listeden kabul/red/yeni teklif verir */}
      {isPending && isBuyer && !offer.buyerMustAccept ? (
        <Button
          variant="outline"
          onPress={() =>
            appAlert('İptal Et', 'Teklifinizi iptal etmek istediğinize emin misiniz?', [
              { text: 'Vazgeç', style: 'cancel' },
              { text: 'İptal Et', style: 'destructive', onPress: () => cancelMutation.mutate() },
            ])
          }
          isLoading={cancelMutation.isPending}
          icon="trash-outline"
          fullWidth
          style={{ ...styles.actionBtn, borderColor: colors.danger[600]!, margin: 16 }}
          textStyle={{ color: colors.danger[600]! }}
        >
          Teklifi İptal Et
        </Button>
      ) : null}
    </>
  );
}
