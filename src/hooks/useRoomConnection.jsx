import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";

import { joinRoom, buildWebSocketURL } from "../lib/api";
import {
  clearRoomSession,
  consumeRoomSessionFromURL,
  getGuestName,
  getGuestToken,
  getRoomSession,
  setRoomSession,
} from "../lib/session";

export default function useRoomConnection(code, { onEvent } = {}) {
  const normalizedCode = useMemo(() => String(code || "").toUpperCase(), [code]);
  const [status, setStatus] = useState("loading");
  const [roomState, setRoomState] = useState(null);
  const [error, setError] = useState("");
  const [sessionToken, setSessionTokenState] = useState("");
  const [connected, setConnected] = useState(false);
  const [ready, setReady] = useState(false);

  const wsRef = useRef(null);
  const retryTimerRef = useRef(null);
  const destroyedRef = useRef(false);
  const sessionRef = useRef("");
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const closeSocket = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const connectWebSocket = useCallback(
    (token) => {
      closeSocket();
      setConnected(false);
      const ws = new WebSocket(buildWebSocketURL(normalizedCode, token));
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setStatus("ready");
        setError("");
      };

      ws.onmessage = (message) => {
        try {
          const payload = JSON.parse(message.data);
          if (payload?.type === "state") {
            setRoomState(payload.state || null);
          } else if (payload?.type === "event") {
            onEventRef.current?.(payload);
          } else if (payload?.type === "error" && payload?.message) {
            setError(payload.message);
          }
        } catch (err) {
          console.error(err);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (destroyedRef.current) return;
        retryTimerRef.current = window.setTimeout(() => {
          if (sessionRef.current) connectWebSocket(sessionRef.current);
        }, 1500);
      };

      ws.onerror = () => {
        setConnected(false);
      };
    },
    [closeSocket, normalizedCode]
  );

  useEffect(() => {
    destroyedRef.current = false;
    if (!normalizedCode) {
      setStatus("error");
      setError("missing_room_code");
      return () => {};
    }

    let cancelled = false;

    async function bootstrap() {
      setStatus("loading");
      setError("");
      try {
        const guestToken = getGuestToken();
        const displayName = getGuestName();
        const migratedToken = consumeRoomSessionFromURL(normalizedCode);
        const existingRoomSession = migratedToken || getRoomSession(normalizedCode);
        const response = await joinRoom(normalizedCode, {
          guestToken,
          displayName,
          roomSessionToken: existingRoomSession,
        });

        if (cancelled) return;

        setRoomSession(normalizedCode, response.roomSessionToken);
        setSessionTokenState(response.roomSessionToken);
        sessionRef.current = response.roomSessionToken;
        connectWebSocket(response.roomSessionToken);
        setReady(true);
      } catch (err) {
        if (cancelled) return;
        const message = err?.message || "failed_to_join_room";
        setStatus("error");
        setError(message);
        if (message === "room_not_found") {
          clearRoomSession(normalizedCode);
        }
        if (message === "game_started") {
          toast.error("This game already started and this device has no room session.");
        }
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
      destroyedRef.current = true;
      closeSocket();
    };
  }, [closeSocket, connectWebSocket, normalizedCode]);

  const send = useCallback((type, payload = {}) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("socket_not_ready");
    }
    ws.send(JSON.stringify({ type, payload }));
  }, []);

  return {
    status,
    roomState,
    error,
    sessionToken,
    connected,
    ready,
    send,
  };
}
