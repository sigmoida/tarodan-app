import React, { useState } from 'react';
import { View, StyleSheet, Share, Linking, TouchableOpacity, Clipboard } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { theme, Text, Button, Snackbar, Divider, Modal, useModalMessage, ModalMessage } from '@tarodan/ui-native';

const { colors } = theme;

// QR kod opsiyonel bağımlılık — paket yüklenmediğinde ekran bu bölümü gizler.
let QRCode: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  QRCode = require('react-native-qrcode-svg').default;
} catch {
  QRCode = null;
}

interface ShareModalProps {
  visible: boolean;
  onDismiss: () => void;
  title: string;
  shareUrl: string;
  shareText?: string;
  type: 'collection' | 'product' | 'profile';
}

interface ShareOption {
  id: string;
  name: string;
  icon: string;
  iconType: 'ionicons' | 'material';
  color: string;
  action: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  visible,
  onDismiss,
  title,
  shareUrl,
  shareText,
  type,
}) => {
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });
  const [showQR, setShowQR] = useState(false);
  const msg = useModalMessage();

  const fullShareText = shareText || `${title} - Tarodan Diecast Marketplace`;

  const handleNativeShare = async () => {
    try {
      await Share.share({
        message: `${fullShareText}\n\n${shareUrl}`,
        title: title,
        url: shareUrl,
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const handleCopyLink = async () => {
    msg.clear();
    try {
      Clipboard.setString(shareUrl);
      setSnackbar({ visible: true, message: 'Link kopyalandı!' });
    } catch (error) {
      msg.error('Link kopyalanamadı');
    }
  };

  const handleWhatsAppShare = () => {
    msg.clear();
    const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(`${fullShareText}\n\n${shareUrl}`)}`;
    Linking.openURL(whatsappUrl).catch(() => {
      msg.error('WhatsApp açılamadı');
    });
  };

  const handleTelegramShare = () => {
    msg.clear();
    const telegramUrl = `tg://msg_url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(fullShareText)}`;
    Linking.openURL(telegramUrl).catch(() => {
      msg.error('Telegram açılamadı');
    });
  };

  const handleTwitterShare = () => {
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(fullShareText)}&url=${encodeURIComponent(shareUrl)}`;
    Linking.openURL(twitterUrl);
  };

  const handleFacebookShare = () => {
    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
    Linking.openURL(facebookUrl);
  };

  const handleInstagramShare = () => {
    // Instagram doesn't have a direct share URL, just open the app
    Linking.openURL('instagram://app').catch(() => {
      Linking.openURL('https://www.instagram.com');
    });
    setSnackbar({ visible: true, message: 'Linki kopyalayıp Instagram\'da paylaşabilirsiniz' });
    handleCopyLink();
  };

  const handleEmailShare = () => {
    const subject = encodeURIComponent(title);
    const body = encodeURIComponent(`${fullShareText}\n\n${shareUrl}`);
    Linking.openURL(`mailto:?subject=${subject}&body=${body}`);
  };

  const shareOptions: ShareOption[] = [
    {
      id: 'whatsapp',
      name: 'WhatsApp',
      icon: 'logo-whatsapp',
      iconType: 'ionicons',
      color: colors.success[600]!,
      action: handleWhatsAppShare,
    },
    {
      id: 'telegram',
      name: 'Telegram',
      icon: 'send',
      iconType: 'ionicons',
      color: colors.info[600]!,
      action: handleTelegramShare,
    },
    {
      id: 'twitter',
      name: 'Twitter / X',
      icon: 'logo-twitter',
      iconType: 'ionicons',
      color: colors.info[600]!,
      action: handleTwitterShare,
    },
    {
      id: 'facebook',
      name: 'Facebook',
      icon: 'logo-facebook',
      iconType: 'ionicons',
      color: colors.info[700]!,
      action: handleFacebookShare,
    },
    {
      id: 'instagram',
      name: 'Instagram',
      icon: 'logo-instagram',
      iconType: 'ionicons',
      color: colors.danger[600]!,
      action: handleInstagramShare,
    },
    {
      id: 'email',
      name: 'E-posta',
      icon: 'mail',
      iconType: 'ionicons',
      color: colors.text.muted,
      action: handleEmailShare,
    },
  ];

  const getTypeText = () => {
    switch (type) {
      case 'collection':
        return 'Koleksiyonu Paylaş';
      case 'product':
        return 'Ürünü Paylaş';
      case 'profile':
        return 'Profili Paylaş';
      default:
        return 'Paylaş';
    }
  };

  return (
    <Modal isOpen={visible} onClose={onDismiss} title={getTypeText()}>
      {/* Share URL Display */}
      <View style={styles.urlContainer}>
        <Text style={styles.urlLabel}>Paylaşım Linki</Text>
        <TouchableOpacity style={styles.urlBox} onPress={handleCopyLink}>
          <Text numberOfLines={1} style={styles.urlText}>
            {shareUrl}
          </Text>
          <Ionicons name="copy-outline" size={20} color={colors.primary[600]!} />
        </TouchableOpacity>
      </View>

      <Divider style={styles.divider} />

      {/* QR Code Section */}
      <TouchableOpacity
        style={styles.qrToggle}
        onPress={() => setShowQR(!showQR)}
      >
        <MaterialCommunityIcons name="qrcode" size={24} color={colors.primary[600]!} />
        <Text style={styles.qrToggleText}>
          {showQR ? 'QR Kodu Gizle' : 'QR Kod Göster'}
        </Text>
        <Ionicons
          name={showQR ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.text.muted}
        />
      </TouchableOpacity>

      {showQR && QRCode && (
        <View style={styles.qrContainer}>
          <View style={styles.qrCode}>
            <QRCode
              value={shareUrl}
              size={160}
              color={colors.text.heading}
              backgroundColor={colors.surface.DEFAULT}
            />
          </View>
          <Text style={styles.qrHint}>
            Telefonunuzla tarayarak koleksiyona erişebilirsiniz
          </Text>
        </View>
      )}

      <Divider style={styles.divider} />

      {/* Social Share Options */}
      <Text style={styles.sectionTitle}>Sosyal Medyada Paylaş</Text>
      <View style={styles.shareGrid}>
        {shareOptions.map((option) => (
          <TouchableOpacity
            key={option.id}
            style={styles.shareOption}
            onPress={option.action}
          >
            <View style={[styles.shareIcon, { backgroundColor: colors.surface.alt }]}>
              <Ionicons
                name={option.icon as any}
                size={24}
                color={option.color}
              />
            </View>
            <Text style={styles.shareLabel}>{option.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Divider style={styles.divider} />

      {/* Native Share Button */}
      <Button
        variant="primary"
        title="Diğer Uygulamalar"
        onPress={handleNativeShare}
        icon="share-social"
        style={styles.shareButton}
      />

      {/* Embed Code (for collections) */}
      {type === 'collection' && (
        <TouchableOpacity
          style={styles.embedLink}
          onPress={() => {
            const embedCode = `<iframe src="${shareUrl}/embed" width="100%" height="400" frameborder="0"></iframe>`;
            Clipboard.setString(embedCode);
            setSnackbar({ visible: true, message: 'Embed kodu kopyalandı!' });
          }}
        >
          <MaterialCommunityIcons name="code-tags" size={20} color={colors.primary[600]!} />
          <Text style={styles.embedText}>
            Web sitesi için embed kodu kopyala
          </Text>
        </TouchableOpacity>
      )}

      <ModalMessage state={msg.state} />

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ ...snackbar, visible: false })}
        duration={2000}
      >
        {snackbar.message}
      </Snackbar>
    </Modal>
  );
};

const styles = StyleSheet.create({
  urlContainer: {
    marginBottom: 8,
  },
  urlLabel: {
    color: colors.text.muted,
    marginBottom: 4,
    fontSize: 12,
  },
  urlBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface.alt,
    borderRadius: 8,
    padding: 12,
  },
  urlText: {
    flex: 1,
    color: colors.text.heading,
    marginRight: 8,
    fontSize: 12,
  },
  divider: {
    marginVertical: 12,
  },
  qrToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  qrToggleText: {
    flex: 1,
    marginLeft: 12,
    color: colors.text.heading,
  },
  qrContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  qrCode: {
    padding: 16,
    backgroundColor: colors.white,
    borderRadius: 12,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  qrHint: {
    marginTop: 12,
    color: colors.text.muted,
    textAlign: 'center',
    fontSize: 12,
  },
  sectionTitle: {
    marginBottom: 12,
    color: colors.text.heading,
    fontSize: 14,
    fontWeight: '600',
  },
  shareGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  shareOption: {
    width: '30%',
    alignItems: 'center',
    marginBottom: 16,
  },
  shareIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  shareLabel: {
    textAlign: 'center',
    color: colors.text.heading,
    fontSize: 12,
  },
  shareButton: {
    marginBottom: 12,
  },
  embedLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginBottom: 8,
  },
  embedText: {
    marginLeft: 8,
    color: colors.primary[600]!,
    fontSize: 12,
  },
});

export default ShareModal;
