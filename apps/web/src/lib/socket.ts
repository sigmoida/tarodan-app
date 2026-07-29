import { io, Socket } from "socket.io-client";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from "@tarodan/types";
import { getPublicApiOrigin } from "@/lib/api/origin";

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

function socketBaseUrl(): string {
  return getPublicApiOrigin();
}

export function getSocket(
  token: string,
): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (socket && socket.connected) return socket;
  if (socket) {
    socket.auth = { token };
    socket.connect();
    return socket;
  }
  socket = io(socketBaseUrl(), {
    auth: { token },
    transports: ["websocket", "polling"],
    autoConnect: true,
  });
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
