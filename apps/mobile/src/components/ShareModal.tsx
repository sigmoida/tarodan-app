import React, { useState } from 'react';
import { View, StyleSheet, Share, Linking, TouchableOpacity, Clipboard, Alert } from 'react-native';
import { Modal, Portal, Text, Button, IconButton, Snackbar, Divider } from 'react-native-paper';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { TarodanColors } from '../theme';

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
    try {
      Clipboard.setString(shareUrl);
      setSnackbar({ visible: true, message: 'Link kopyalandı!' });
    } catch (error) {
      Alert.alert('Hata', 'Link kopyalanamadı');
    }
  };

  const handleWhatsAppShare = () => {
    const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(`${fullShareText}\n\n${shareUrl}`)}`;
    Linking.openURL(whatsappUrl).catch(() => {
      Alert.alert('Hata', 'WhatsApp açılamadı');
    });
  };

  const handleTelegramShare = () => {
    const telegramUrl = `tg://msg_url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(fullShareText)}`;
    Linking.openURL(telegramUrl).catch(() => {
      Alert.alert('Hata', 'Telegram açılamadı');
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
      color: '#25D366',
      action: handleWhatsAppShare,
    },
    {
      id: 'telegram',
      name: 'Telegram',
      icon: 'send',
      iconType: 'ionicons',
      color: '#0088cc',
      action: handleTelegramShare,
    },
    {
      id: 'twitter',
      name: 'Twitter / X',
      icon: 'logo-twitter',
      iconType: 'ionicons',
      color: '#1DA1F2',
      action: handleTwitterShare,
    },
    {
      id: 'facebook',
      name: 'Facebook',
      icon: 'logo-facebook',
      iconType: 'ionicons',
      color: '#4267B2',
      action: handleFacebookShare,
    },
    {
      id: 'instagram',
      name: 'Instagram',
      icon: 'logo-instagram',
      iconType: 'ionicons',
      color: '#E1306C',
      action: handleInstagramShare,
    },
    {
      id: 'email',
      name: 'E-posta',
      icon: 'mail',
      iconType: 'ionicons',
      color: TarodanColors.textSecondary,
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
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={styles.modal}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text variant="titleLarge" style={styles.title}>{getTypeText()}</Text>
          <IconButton icon="close" onPress={onDismiss} />
        </View>

        {/* Share URL Display */}
        <View style={styles.urlContainer}>
          <Text variant="bodySmall" style={styles.urlLabel}>Paylaşım Linki</Text>
          <TouchableOpacity style={styles.urlBox} onPress={handleCopyLink}>
            <Text variant="bodySmall" numberOfLines={1} style={styles.urlText}>
              {shareUrl}
            </Text>
            <Ionicons name="copy-outline" size={20} color={TarodanColors.primary} />
          </TouchableOpacity>
        </View>

        <Divider style={styles.divider} />

        {/* QR Code Section */}
        <TouchableOpacity 
          style={styles.qrToggle}
          onPress={() => setShowQR(!showQR)}
        >
          <MaterialCommunityIcons name="qrcode" size={24} color={TarodanColors.primary} />
          <Text variant="bodyMedium" style={styles.qrToggleText}>
            {showQR ? 'QR Kodu Gizle' : 'QR Kod Göster'}
          </Text>
          <Ionicons 
            name={showQR ? 'chevron-up' : 'chevron-down'} 
            size={20} 
            color={TarodanColors.textSecondary} 
          />
        </TouchableOpacity>

        {showQR && (
          <View style={styles.qrContainer}>
            <View style={styles.qrCode}>
              <QRCode
                value={shareUrl}
                size={160}
                color={TarodanColors.textPrimary}
                backgroundColor={TarodanColors.background}
              />
            </View>
            <Text variant="bodySmall" style={styles.qrHint}>
              Telefonunuzla tarayarak koleksiyona erişebilirsiniz
            </Text>
          </View>
        )}

        <Divider style={styles.divider} />

        {/* Social Share Options */}
        <Text variant="titleSmall" style={styles.sectionTitle}>Sosyal Medyada Paylaş</Text>
        <View style={styles.shareGrid}>
          {shareOptions.map((option) => (
            <TouchableOpacity
              key={option.id}
              style={styles.shareOption}
              onPress={option.action}
            >
              <View style={[styles.shareIcon, { backgroundColor: option.color + '20' }]}>
                <Ionicons 
                  name={option.icon as any} 
                  size={24} 
                  color={option.color} 
                />
              </View>
              <Text variant="bodySmall" style={styles.shareLabel}>{option.name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Divider style={styles.divider} />

        {/* Native Share Button */}
        <Button
          mode="contained"
          onPress={handleNativeShare}
          icon="share-variant"
          style={styles.shareButton}
        >
          Diğer Uygulamalar
        </Button>

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
            <MaterialCommunityIcons name="code-tags" size={20} color={TarodanColors.primary} />
            <Text variant="bodySmall" style={styles.embedText}>
              Web sitesi için embed kodu kopyala
            </Text>
          </TouchableOpacity>
        )}

        <Snackbar
          visible={snackbar.visible}
          onDismiss={() => setSnackbar({ ...snackbar, visible: false })}
          duration={2000}
        >
          {snackbar.message}
        </Snackbar>
      </Modal>
    </Portal>
  );
};

const styles = StyleSheet.create({
  modal: {
    backgroundColor: TarodanColors.background,
    margin: 20,
    borderRadius: 16,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  title: {
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
  },
  urlContainer: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  urlLabel: {
    color: TarodanColors.textSecondary,
    marginBottom: 4,
  },
  urlBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.backgroundSecondary,
    borderRadius: 8,
    padding: 12,
  },
  urlText: {
    flex: 1,
    color: TarodanColors.textPrimary,
    marginRight: 8,
  },
  divider: {
    marginVertical: 12,
  },
  qrToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  qrToggleText: {
    flex: 1,
    marginLeft: 12,
    color: TarodanColors.textPrimary,
  },
  qrContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  qrCode: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  qrHint: {
    marginTop: 12,
    color: TarodanColors.textSecondary,
    textAlign: 'center',
  },
  sectionTitle: {
    paddingHorizontal: 16,
    marginBottom: 12,
    color: TarodanColors.textPrimary,
  },
  shareGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
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
    color: TarodanColors.textPrimary,
  },
  shareButton: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: TarodanColors.primary,
  },
  embedLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  embedText: {
    marginLeft: 8,
    color: TarodanColors.primary,
  },
});

export default ShareModal;
