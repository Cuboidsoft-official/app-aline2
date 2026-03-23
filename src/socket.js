import { io } from "socket.io-client";
import { appConfig } from "./config/env";

export const socket = io(appConfig.socketUrl, {
 transports: ["websocket"]
});
