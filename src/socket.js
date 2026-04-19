import { io } from "socket.io-client";
import { appConfig } from "./config/env";
import { getStoredToken } from "./utils/authSession";

export const socket = io(appConfig.socketUrl, {
 transports: ["polling", "websocket"],
 autoConnect: false,
 reconnection: true,
 reconnectionAttempts: Infinity,
 reconnectionDelay: 1000,
 reconnectionDelayMax: 5000,
 timeout: 20000,
});

const SOCKET_CONNECT_TIMEOUT_MS = 8000;

const waitForSocketConnection = () =>
 new Promise((resolve, reject) => {
  if (socket.connected) {
   resolve(socket);
   return;
  }

  let timeoutId = null;

  const cleanup = () => {
   socket.off("connect", handleConnect);
   socket.off("connect_error", handleError);
   if (timeoutId) {
    clearTimeout(timeoutId);
    timeoutId = null;
   }
  };

  const handleConnect = () => {
   cleanup();
   resolve(socket);
  };

  const handleError = (error) => {
   cleanup();
   reject(error || new Error("Socket connection failed"));
  };

  timeoutId = setTimeout(() => {
   cleanup();
   reject(new Error("Socket connection timed out"));
  }, SOCKET_CONNECT_TIMEOUT_MS);

  socket.once("connect", handleConnect);
  socket.once("connect_error", handleError);
 });

export const connectSocket = async () => {
 const token = await getStoredToken();

 if (!token) {
  if (socket.connected) {
   socket.disconnect();
  }
  return socket;
 }

 const nextAuth = { token };
 const currentToken = socket.auth?.token;

 if (currentToken !== token) {
  socket.auth = nextAuth;

  if (socket.connected) {
   socket.disconnect();
  }
 }

 if (!socket.connected) {
  socket.connect();
 }

 return waitForSocketConnection();
};

export const disconnectSocket = () => {
 if (socket.connected) {
  socket.disconnect();
 }
};
