import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@tarodan/types';
import { getApiBaseUrl } from './api';

export function socketRootUrl(apiUrl: string): string {
  return apiUrl.replace(/\/api\/?$/, '');
}

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function connectSocket(token: string): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (socket) {
    socket.auth = { token };
    if (!socket.connected) socket.connect();
    return socket;
  }
  socket = io(socketRootUrl(getApiBaseUrl()), {
    auth: { token },
    transports: ['websocket'],
    autoConnect: true,
  });
  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
