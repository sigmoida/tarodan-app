'use client';

import MessageTicks from './MessageTicks';
import { parseMessageContent, type Message } from '../_lib/messages';

export default function MessageBubble({
  message,
  isFromMe,
}: {
  message: Message;
  isFromMe: boolean;
}) {
  return (
    <div className={`flex ${isFromMe ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] sm:max-w-[75%] px-4 py-2.5 rounded-2xl shadow-sm ${
          isFromMe
            ? 'bg-primary-500 text-inverted rounded-br-md'
            : 'bg-surface-elevated text-heading border border-border rounded-bl-md'
        } ${
          message.status === 'pending'
            ? 'opacity-60'
            : message.status === 'rejected'
            ? 'ring-1 ring-danger-200 bg-danger-50/50'
            : ''
        }`}>
        <div className="text-sm break-words space-y-2">
          {parseMessageContent(message.content).map((part, i) =>
            part.type === 'text' ? (
              <p key={i} className="whitespace-pre-wrap">{part.value}</p>
            ) : (
              <a key={i} href={part.value} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden max-w-[240px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={part.value} alt="" className="max-w-full max-h-48 object-cover rounded-lg" />
              </a>
            )
          )}
        </div>
        <div className="flex items-center justify-end gap-1.5 mt-1">
          <span className={`text-xs ${isFromMe ? 'text-inverted/80' : 'text-subtle'}`}>
            {new Date(message.createdAt).toLocaleTimeString('tr-TR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          {message.status === 'pending' && <span className="text-xs">⏳</span>}
          {message.status === 'rejected' && <span className="text-xs">❌</span>}
          {isFromMe &&
            (message.status === 'sent' ||
              message.status === 'delivered' ||
              message.status === 'read') && (
              <MessageTicks read={!!message.readAt} />
            )}
        </div>
      </div>
    </div>
  );
}
