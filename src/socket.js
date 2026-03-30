import { io } from "socket.io-client";
import { appConfig } from "./config/env";
import { getStoredToken } from "./utils/authSession";

export const socket = io(appConfig.socketUrl, {
 transports: ["websocket"],
 autoConnect: false,
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

 return socket;
};

export const disconnectSocket = () => {
 if (socket.connected) {
  socket.disconnect();
 }
};
