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
    paddingBottom: theme.spacing[3],
    paddingHorizontal: theme.spacing[2],
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    padding: theme.spacing[2],
  },
  headerContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginLeft: theme.spacing[2],
  },
  headerInfo: {
    marginLeft: theme.spacing[3],
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
    padding: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  productBannerText: {
    flex: 1,
    marginHorizontal: theme.spacing[2],
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
    padding: theme.spacing[4],
  },
  dateDivider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: theme.spacing[4],
  },
  dateDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border.DEFAULT,
  },
  dateDividerText: {
    paddingHorizontal: theme.spacing[3],
    fontSize: 12,
    color: colors.text.muted,
  },
  messageRow: {
    flexDirection: "row",
    marginBottom: theme.spacing[2],
  },
  messageRowOwn: {
    justifyContent: "flex-end",
  },
  messageRowOther: {
    justifyContent: "flex-start",
  },
  avatarPlaceholder: {
    width: 36,
    marginRight: theme.spacing[2],
  },
  messageBubble: {
    maxWidth: "75%",
    padding: theme.spacing[3],
    borderRadius: theme.radius['3xl'],
  },
  messageBubbleOwn: {
    backgroundColor: colors.primary[600]!,
    borderBottomRightRadius: theme.radius.md,
  },
  messageBubbleOther: {
    backgroundColor: colors.surface.DEFAULT,
    borderBottomLeftRadius: theme.radius.md,
  },
  messageImagesWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[1.5],
    marginBottom: theme.spacing[1.5],
  },
  messageImage: {
    width: 160,
    height: 160,
    borderRadius: theme.radius.xl,
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
    marginTop: theme.spacing[1],
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
    marginLeft: theme.spacing[1],
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
    padding: theme.spacing[3],
    backgroundColor: colors.surface.DEFAULT,
    borderTopWidth: 1,
    borderTopColor: colors.border.DEFAULT,
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: colors.surface.alt,
    borderRadius: 24,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    marginRight: theme.spacing[2],
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
    marginRight: theme.spacing[2],
  },
  attachButtonDisabled: {
    opacity: 0.5,
  },
  pendingImageBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    backgroundColor: colors.surface.DEFAULT,
    borderTopWidth: 1,
    borderTopColor: colors.border.DEFAULT,
  },
  pendingImageThumb: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.xl,
    backgroundColor: colors.surface.alt,
  },
  pendingImageText: {
    flex: 1,
    marginHorizontal: theme.spacing[3],
    fontSize: 14,
    color: colors.text.muted,
  },
  pendingImageRemove: {
    padding: theme.spacing[1],
  },
});
