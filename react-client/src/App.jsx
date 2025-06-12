import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";

const socket = io(import.meta.env.VITE_SIGNALING_URL);


export default function App() {
  const [roomId, setRoomId] = useState("");
  const [joined, setJoined] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [videoURL, setVideoURL] = useState(null);
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const peerConnection = useRef(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [overlayPos, setOverlayPos] = useState({ x: window.innerWidth * 0.65, y: 20 });
  const [overlaySize, setOverlaySize] = useState({ width: 200, height: 150 });
  const dragStart = useRef(null);

  const [isMuted, setIsMuted] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(true);

  useEffect(() => {
    if (!joined) return;

    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((stream) => {
      setLocalStream(stream);

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      peerConnection.current = pc;

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const remote = new MediaStream();
      setRemoteStream(remote);

      pc.ontrack = (event) => {
        event.streams[0].getTracks().forEach((track) => remote.addTrack(track));
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("signal", { roomId, signalData: { candidate: event.candidate } });
        }
      };

      socket.emit("join-room", roomId);

      socket.on("user-joined", async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("signal", { roomId, signalData: { sdp: pc.localDescription } });
      });

      socket.on("signal", async ({ signalData }) => {
        if (signalData.sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
          if (signalData.sdp.type === "offer") {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit("signal", { roomId, signalData: { sdp: pc.localDescription } });
          }
        } else if (signalData.candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
          } catch (err) {
            console.error("Error adding ICE candidate", err);
          }
        }
      });

      socket.on("play", () => {
        videoRef.current?.play();
      });

      socket.on("pause", () => {
        videoRef.current?.pause();
      });

      socket.on("sync", (currentTime) => {
        if (videoRef.current && Math.abs(videoRef.current.currentTime - currentTime) > 0.5) {
          videoRef.current.currentTime = currentTime;
        }
      });

      const interval = setInterval(() => {
        if (videoRef.current) {
          socket.emit("sync", { roomId, currentTime: videoRef.current.currentTime });
        }
      }, 5000);

      return () => clearInterval(interval);
    });

    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [joined]);

  const handleJoin = () => {
    if (roomId.trim() !== "") setJoined(true);
  };

  const handlePlay = () => socket.emit("play", roomId);
  const handlePause = () => socket.emit("pause", roomId);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoURL(url);
    }
  };

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => (track.enabled = isMuted));
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => (track.enabled = !videoEnabled));
      setVideoEnabled(!videoEnabled);
    }
  };

  const startDrag = (e) => {
    dragStart.current = {
      x: e.clientX - overlayPos.x,
      y: e.clientY - overlayPos.y,
    };
    window.addEventListener("mousemove", handleDrag);
    window.addEventListener("mouseup", stopDrag);
  };

  const handleDrag = (e) => {
    const newX = e.clientX - dragStart.current.x;
    const newY = e.clientY - dragStart.current.y;
    const maxX = window.innerWidth - overlaySize.width;
    const maxY = window.innerHeight - overlaySize.height;
    setOverlayPos({
      x: Math.max(0, Math.min(newX, maxX)),
      y: Math.max(0, Math.min(newY, maxY)),
    });
  };

  const stopDrag = () => {
    window.removeEventListener("mousemove", handleDrag);
    window.removeEventListener("mouseup", stopDrag);
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>🎬 Watch Together with Video Chat</h1>
      {!joined ? (
        <>
          <input
            type="text"
            placeholder="Enter Room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          />
          <button onClick={handleJoin}>Join Room</button>
        </>
      ) : (
        <>
          <input type="file" accept="video/*" onChange={handleFileChange} ref={fileInputRef} />
          {videoURL && (
            <div style={{ position: "relative", width: "fit-content" }}>
              <video
                ref={videoRef}
                src={videoURL}
                width="100%"
                controls
                onPlay={handlePlay}
                onPause={handlePause}
                onDoubleClick={() => videoRef.current?.requestFullscreen()}
                style={{ maxWidth: "100%" }}
              />
              {remoteStream && isFullscreen && (
                <div
                  style={{
                    position: "absolute",
                    top: `${overlayPos.y}px`,
                    left: `${overlayPos.x}px`,
                    width: `${overlaySize.width}px`,
                    height: `${overlaySize.height}px`,
                    resize: "both",
                    overflow: "hidden",
                    borderRadius: "10px",
                    border: "2px solid #fff",
                    boxShadow: "0 0 10px rgba(0,0,0,0.4)",
                    backgroundColor: "#000",
                    cursor: "move",
                    maxWidth: window.innerWidth * 0.3,
                    maxHeight: window.innerHeight * 0.3,
                  }}
                  onMouseDown={startDrag}
                >
                  <video
                    ref={(ref) => ref && (ref.srcObject = remoteStream)}
                    autoPlay
                    muted={false}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </div>
              )}
            </div>
          )}
          <div style={{ display: "flex", marginTop: 20 }}>
            {localStream && (
              <div style={{ position: "relative" }}>
                <video
                  ref={(ref) => ref && (ref.srcObject = localStream)}
                  autoPlay
                  muted={isMuted}
                  style={{ width: "200px", border: "2px solid green" }}
                />
                <div style={{ position: "absolute", bottom: 5, left: 5, display: "flex", gap: "5px" }}>
                  <button onClick={toggleMute}>{isMuted ? "Unmute" : "Mute"}</button>
                  <button onClick={toggleVideo}>{videoEnabled ? "Turn Video Off" : "Turn Video On"}</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
