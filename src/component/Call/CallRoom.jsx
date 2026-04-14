import React, { useEffect, useRef, useState } from 'react';
import { BsMicFill, BsMicMuteFill, BsCameraVideoFill, BsCameraVideoOffFill, BsPersonFill } from 'react-icons/bs';
import { MdCallEnd } from 'react-icons/md';
import callService from '../../services/call/CallService';
import './CallRoom.css';

/**
 * CallRoom – màn hình đang trong cuộc gọi (sau khi cả 2 kết nối).
 * Hỗ trợ cả VOICE và VIDEO.
 */
function CallRoom({ callType, localStream, remoteStream, isRemoteVideoOff, onEnd }) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // Gắn stream vào video elements
  useEffect(() => {
    let activeStream = localStream;
    // Dự phòng: Nếu prop localStream trống, lấy trực tiếp từ Service
    if (!activeStream) {
      activeStream = callService.getLocalStream();
    }

    if (localVideoRef.current && activeStream) {
      console.log('[CallRoom] Attaching local stream - isCamOff:', isCamOff);
      localVideoRef.current.srcObject = activeStream;
      localVideoRef.current.play().catch(e => console.warn("Local video play failed:", e));
    }

    return () => {
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
    };
  }, [localStream, isCamOff]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      console.log('[CallRoom] Attaching remote stream');
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch(e => console.warn("Remote video play failed:", e));
    }
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
    }

    return () => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    };
  }, [remoteStream, isRemoteVideoOff]);

  // Đồng hồ đếm thời gian cuộc gọi
  useEffect(() => {
    const timer = setInterval(() => setElapsed((prev) => prev + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatElapsed = (secs) => {
    const m = String(Math.floor(secs / 60)).padStart(2, '0');
    const s = String(secs % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleToggleMic = () => {
    const nextState = !isMicMuted;
    setIsMicMuted(nextState);
    callService.setMicEnabled(!nextState); // enabled = !muted
  };

  const handleToggleCam = () => {
    const nextState = !isCamOff;
    setIsCamOff(nextState);
    callService.setCameraEnabled(!nextState); // enabled = !off
  };

  const isVideo = callType === 'VIDEO';

  return (
    <div className={`call-room ${isVideo ? 'call-room--video' : 'call-room--voice'}`}>
      <div className="call-room-main">
        {isVideo ? (
          <div className="call-room-video-container">
            {/* Remote video – full screen wrapper */}
            <div className="remote-video-wrap">
              {!isRemoteVideoOff ? (
                <video
                  ref={remoteVideoRef}
                  className="call-room-remote-video"
                  autoPlay
                  playsInline
                />
              ) : (
                <div className="call-room-remote-placeholder">
                  <div className="call-room-placeholder-avatar"><BsPersonFill /></div>
                  <p className="call-room-placeholder-text">Đối phương đã tắt camera</p>
                </div>
              )}
            </div>

            {/* Local video – Floating PiP */}
            <div className="local-video-pip">
              {!isCamOff ? (
                <video
                  ref={localVideoRef}
                  className="call-room-local-video"
                  autoPlay
                  playsInline
                  muted
                />
              ) : (
                <div className="call-room-local-placeholder">
                  <BsPersonFill />
                </div>
              )}
            </div>

            <div className="call-room-timer-overlay">{formatElapsed(elapsed)}</div>
          </div>
        ) : (
          /* Voice call – Premium center UI */
          <div className="call-room-voice-center">
            <div className="voice-avatar-wrap">
              <div className="call-room-voice-avatar">
                <BsPersonFill />
              </div>
            </div>
            <p className="call-room-voice-timer">{formatElapsed(elapsed)}</p>
            <p className="call-room-voice-status">Đang trong cuộc gọi thoại</p>
            <audio ref={remoteAudioRef} autoPlay />
          </div>
        )}
      </div>

      {/* Modern Control Bar - Professional Minimalist */}
      <div className="call-room-footer">
        <div className="call-controls-pill">
          <button
            className={`ctrl-btn ${isMicMuted ? 'ctrl-btn--muted' : ''}`}
            onClick={handleToggleMic}
            title={isMicMuted ? 'Bật mic' : 'Tắt mic'}
          >
            <span className="ctrl-icon">
              {isMicMuted ? <BsMicMuteFill /> : <BsMicFill />}
            </span>
          </button>

          {isVideo && (
            <button
              className={`ctrl-btn ${isCamOff ? 'ctrl-btn--off' : ''}`}
              onClick={handleToggleCam}
              title={isCamOff ? 'Bật cam' : 'Tắt cam'}
            >
              <span className="ctrl-icon">
                {isCamOff ? <BsCameraVideoOffFill /> : <BsCameraVideoFill />}
              </span>
            </button>
          )}

          <button className="ctrl-btn ctrl-btn--end" onClick={onEnd} title="Kết thúc">
            <span className="ctrl-icon"><MdCallEnd /></span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default CallRoom;
