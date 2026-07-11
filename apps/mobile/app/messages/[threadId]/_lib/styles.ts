import { StyleSheet } from "react-native";
import { theme } from "@tarodan/ui-native";

const { colors } = theme;

// Mesaj sohbeti ekranının route-local stylesheet'i (monolitten birebir taşındı).
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  header: {
    backgroundColor: colors.primary[600]!,
    paddingTop: 50,
    paddingBottom: 12,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    padding: 8,
  },
  headerContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 8,
  },
  headerInfo: {
    marginLeft: 12,
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.white,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.overlay.white85,
  },
  productBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface.DEFAULT,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  productBannerText: {
    flex: 1,
    marginHorizontal: 8,
    color: colors.text.heading,
    fontSize: 13,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  messagesList: {
    flex: 1,
  },
  messagesListHidden: {
    opacity: 0,
  },
  messagesContent: {
    padding: 16,
  },
  dateDivider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 16,
  },
  dateDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border.DEFAULT,
  },
  dateDividerText: {
    paddingHorizontal: 12,
    fontSize: 12,
    color: colors.text.muted,
  },
  messageRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  messageRowOwn: {
    justifyContent: "flex-end",
  },
  messageRowOther: {
    justifyContent: "flex-start",
  },
  avatarPlaceholder: {
    width: 36,
    marginRight: 8,
  },
  messageBubble: {
    maxWidth: "75%",
    padding: 12,
    borderRadius: 16,
  },
  messageBubbleOwn: {
    backgroundColor: colors.primary[600]!,
    borderBottomRightRadius: 4,
  },
  messageBubbleOther: {
    backgroundColor: colors.surface.DEFAULT,
    borderBottomLeftRadius: 4,
  },
  messageImagesWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 6,
  },
  messageImage: {
    width: 160,
    height: 160,
    borderRadius: 8,
    backgroundColor: colors.surface.alt,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  messageTextOwn: {
    color: colors.white,
  },
  messageTextOther: {
    color: colors.text.heading,
  },
  messageFooter: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    justifyContent: "flex-end",
  },
  messageTime: {
    fontSize: 11,
  },
  messageTimeOwn: {
    color: colors.overlay.white70,
  },
  messageTimeOther: {
    color: colors.text.muted,
  },
  messageStatus: {
    marginLeft: 4,
    fontSize: 11,
    color: colors.overlay.white70,
  },
  // Okundu → çift mavi çentik (bilgi/okundu durumu → info token).
  messageStatusRead: {
    color: colors.info[400]!,
    fontWeight: "700",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 12,
    backgroundColor: colors.surface.DEFAULT,
    borderTopWidth: 1,
    borderTopColor: colors.border.DEFAULT,
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: colors.surface.alt,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    maxHeight: 120,
  },
  textInput: {
    fontSize: 16,
    color: colors.text.heading,
    maxHeight: 100,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary[600]!,
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: {
    backgroundColor: colors.surface.alt,
  },
  attachButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface.alt,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  attachButtonDisabled: {
    opacity: 0.5,
  },
  pendingImageBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surface.DEFAULT,
    borderTopWidth: 1,
    borderTopColor: colors.border.DEFAULT,
  },
  pendingImageThumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: colors.surface.alt,
  },
  pendingImageText: {
    flex: 1,
    marginHorizontal: 12,
    fontSize: 14,
    color: colors.text.muted,
  },
  pendingImageRemove: {
    padding: 4,
  },
});
