import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getAccessToken, api } from "./api";
import type { CallMode, CallEndReason, ClientToServerSignal, ServerToClientSignal } from "./signalTypes";

export type CallState =
  | "idle"
  | "searching"
  | "connecting"
  | "connected"
  | "poor_connection"
  | "reconnecting"
  | "remote_disconnected"
  | "ended"
  | "failed";

interface CallContextValue {
  state: CallState;
  mode: Exclude<CallMode, "both"> | null;
  matchId: string | null;
  callSessionId: string | null;
  peerId: string | null;
  endReason: CallEndReason;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  callDurationSeconds: number;
  micEnabled: boolean;
  cameraEnabled: boolean;
  startSearching: (mode: CallMode) => Promise<void>;
  cancelSearching: () => void;
  endCall: () => void;
  nextUser: () => void;
  toggleMic: () => void;
  toggleCamera: () => void;
  switchCamera: () => Promise<void>;
}

const CallContext = createContext<CallContextValue | null>(null);

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used within CallProvider");
  return ctx;
}

export function CallProvider({ children, currentUserId }: { children: ReactNode; currentUserId: string }) {
  const [state, setState] = useState<CallState>("idle");
  const [mode, setMode] = useState<Exclude<CallMode, "both"> | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [callSessionId, setCallSessionId] = useState<string | null>(null);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [endReason, setEndReason] = useState<CallEndReason>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [callDurationSeconds, setCallDurationSeconds] = useState(0);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const matchIdRef = useRef<string | null>(null); // avoids stale closures in ws.onmessage
  const requestedModeRef = useRef<CallMode>("both");
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  const cleanupMedia = useCallback(() => {
    localStream?.getTracks().forEach((t) => t.stop());
    pcRef.current?.close();
    pcRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    setCallDurationSeconds(0);
  }, [localStream]);

  const send = useCallback((msg: ClientToServerSignal) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const ensureSocket = useCallback((): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        resolve(wsRef.current);
        return;
      }
      const token = getAccessToken();
      if (!token) {
        reject(new Error("Not authenticated"));
        return;
      }
      const wsBaseUrl =
        import.meta.env.VITE_WS_URL ?? "wss://tingle-production.up.railway.app/ws/signal";
      const ws = new WebSocket(`${wsBaseUrl}?token=${encodeURIComponent(token)}`);

      ws.onopen = () => {
        wsRef.current = ws;
        resolve(ws);
      };
      ws.onerror = () => reject(new Error("Signaling connection failed"));
      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        // An unexpected close mid-call reads as the remote side / network
        // dropping — the call screen shows "remote_disconnected" rather
        // than silently going back to idle.
        setState((s) => (s === "connected" || s === "connecting" ? "remote_disconnected" : s));
      };
      ws.onmessage = (event) => handleServerMessage(JSON.parse(event.data));
    });
  }, []);

  async function createPeerConnection(currentMatchId: string): Promise<RTCPeerConnection> {
    const { iceServers } = await api.getIceServers();
    const pc = new RTCPeerConnection({ iceServers });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        send({ type: "ice_candidate", matchId: currentMatchId, candidate: event.candidate.toJSON() });
      }
    };

    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0] ?? null);
    };

    pc.oniceconnectionstatechange = () => {
      switch (pc.iceConnectionState) {
        case "connected":
        case "completed":
          setState("connected");
          break;
        case "disconnected":
          setState("reconnecting");
          break;
        case "failed":
          // ICE restart — spec section 24/25: don't just give up on a
          // hiccup, attempt to recover the same session first.
          pc.restartIce();
          setState("reconnecting");
          break;
        case "closed":
          break;
      }
    };

    pcRef.current = pc;
    return pc;
  }

  async function getLocalMedia(callMode: Exclude<CallMode, "both">): Promise<MediaStream> {
    const constraints: MediaStreamConstraints =
      callMode === "video"
        ? { video: { facingMode: "user" }, audio: true }
        : { video: false, audio: true };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    setLocalStream(stream);
    setCameraEnabled(callMode === "video");
    setMicEnabled(true);
    return stream;
  }

  async function handleServerMessage(msg: ServerToClientSignal) {
    switch (msg.type) {
      case "queue_status": {
        setState("searching");
        break;
      }

      case "match_found": {
        setState("connecting");
        setMatchId(msg.matchId);
        matchIdRef.current = msg.matchId;
        setCallSessionId(msg.callSessionId);
        setMode(msg.mode);
        setPeerId(msg.peerId);
        setEndReason(null);
        pendingCandidatesRef.current = [];

        try {
          const stream = await getLocalMedia(msg.mode);
          const pc = await createPeerConnection(msg.matchId);
          stream.getTracks().forEach((track) => pc.addTrack(track, stream));

          // Deterministic initiator: lower user id creates the offer, so
          // both peers never race to send simultaneous offers (SDP glare).
          const isInitiator = currentUserId < msg.peerId;
          if (isInitiator) {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            send({ type: "webrtc_offer", matchId: msg.matchId, sdp: offer.sdp! });
          }

          durationTimerRef.current = setInterval(() => {
            setCallDurationSeconds((s) => s + 1);
          }, 1000);
        } catch (err) {
          console.error("Failed to start call", err);
          setState("failed");
        }
        break;
      }

      case "webrtc_offer": {
        const pc = pcRef.current;
        if (!pc) break;
        await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
        for (const candidate of pendingCandidatesRef.current) {
          await pc.addIceCandidate(candidate);
        }
        pendingCandidatesRef.current = [];
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        send({ type: "webrtc_answer", matchId: msg.matchId, sdp: answer.sdp! });
        break;
      }

      case "webrtc_answer": {
        const pc = pcRef.current;
        if (!pc) break;
        await pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
        for (const candidate of pendingCandidatesRef.current) {
          await pc.addIceCandidate(candidate);
        }
        pendingCandidatesRef.current = [];
        break;
      }

      case "ice_candidate": {
        const pc = pcRef.current;
        if (!pc || !pc.remoteDescription) {
          pendingCandidatesRef.current.push(msg.candidate);
        } else {
          await pc.addIceCandidate(msg.candidate);
        }
        break;
      }

      case "call_ended": {
        setEndReason(msg.reason);
        setState("ended");
        cleanupMedia();
        matchIdRef.current = null;
        break;
      }
    }
  }

  const startSearching = useCallback(
    async (requestedMode: CallMode) => {
      requestedModeRef.current = requestedMode;
      setState("searching");
      try {
        await ensureSocket();
        send({ type: "join_queue", mode: requestedMode });
      } catch (err) {
        console.error(err);
        setState("failed");
      }
    },
    [ensureSocket, send]
  );

  const cancelSearching = useCallback(() => {
    send({ type: "cancel_queue" });
    setState("idle");
  }, [send]);

  const endCall = useCallback(() => {
    if (matchIdRef.current) {
      send({ type: "end_call", matchId: matchIdRef.current });
    }
    setEndReason("user_ended");
    setState("ended");
    cleanupMedia();
    matchIdRef.current = null;
  }, [send, cleanupMedia]);

  const nextUser = useCallback(() => {
    cleanupMedia();
    matchIdRef.current = null;
    send({ type: "next" });
    setState("searching");
  }, [send, cleanupMedia]);

  const toggleMic = useCallback(() => {
    localStream?.getAudioTracks().forEach((t) => (t.enabled = !t.enabled));
    setMicEnabled((v) => !v);
  }, [localStream]);

  const toggleCamera = useCallback(() => {
    localStream?.getVideoTracks().forEach((t) => (t.enabled = !t.enabled));
    setCameraEnabled((v) => !v);
  }, [localStream]);

  const switchCamera = useCallback(async () => {
    if (!localStream || mode !== "video") return;
    const currentTrack = localStream.getVideoTracks()[0];
    const currentFacing = currentTrack?.getSettings().facingMode;
    const nextFacing = currentFacing === "environment" ? "user" : "environment";
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: nextFacing },
        audio: false,
      });
      const newTrack = newStream.getVideoTracks()[0];
      const sender = pcRef.current?.getSenders().find((s) => s.track?.kind === "video");
      await sender?.replaceTrack(newTrack);
      currentTrack?.stop();
      localStream.removeTrack(currentTrack);
      localStream.addTrack(newTrack);
      setLocalStream(new MediaStream(localStream.getTracks()));
    } catch (err) {
      console.error("Failed to switch camera", err);
    }
  }, [localStream, mode]);

  useEffect(() => {
    return () => {
      cleanupMedia();
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <CallContext.Provider
      value={{
        state,
        mode,
        matchId,
        callSessionId,
        peerId,
        endReason,
        localStream,
        remoteStream,
        callDurationSeconds,
        micEnabled,
        cameraEnabled,
        startSearching,
        cancelSearching,
        endCall,
        nextUser,
        toggleMic,
        toggleCamera,
        switchCamera,
      }}
    >
      {children}
    </CallContext.Provider>
  );
}
