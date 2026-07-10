import { KeyboardAvoidingView, Platform } from 'react-native';

import { styles } from './_lib/styles';
import { useMessageThread } from './_hooks/useMessageThread';
import { MessageThreadHeader } from './_components/MessageThreadHeader';
import { MessageList } from './_components/MessageList';
import { MessageInputBar } from './_components/MessageInputBar';

/**
 * Message thread — THIN screen. The `useMessageThread` controller owns the
 * messagesStore bindings, input/image/limit state, focus fetch + socket, and
 * the send/attach/block handlers; this file composes header, list, and input.
 */
export default function MessageThreadScreen() {
  const f = useMessageThread();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <MessageThreadHeader f={f} />
      <MessageList f={f} />
      <MessageInputBar f={f} />
    </KeyboardAvoidingView>
  );
}
