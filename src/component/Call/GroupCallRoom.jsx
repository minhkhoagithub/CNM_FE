import React, { useEffect, useState, useRef, useCallback } from 'react';
import groupCallService from '../../services/call/GroupCallService';
import { IoVideocamOutline, IoVideocamOffOutline, IoMicOutline, IoMicOffOutline, IoCallOutline } from 'react-icons/io5';
import './GroupCallRoom.css';

const GroupCallRoom = ({ callData, onLeave }) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState(new Map()); // peerId -> stream
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [speakers, setSpeakers] = useState(new Set()); // peerIds currently speaking
  
  const localVideoRef = useRef(null);

  // Tham gia cuộc gọi khi mount
  useEffect(() => {
    let isMounted = true;

    const startCall = async () => {
      try {
        const stream = await groupCallService.joinCall({
          ...callData,
          onLocalStream: (s) => {
            if (isMounted) {
              setLocalStream(s);
              if (localVideoRef.current) localVideoRef.current.srcObject = s;
            }
          },
          onPeersUpdated: (peers) => {
            if (isMounted) setRemoteStreams(new Map(peers));
          },
          onActiveSpeaker: (peerId) => {
            if (isMounted) setSpeakers(new Set(peerId ? [peerId] : []));
          },
          onCallEnded: () => {
            if (isMounted) onLeave();
          }
        });
        
        // Safety check if stream is returned immediately
        if (stream && isMounted) {
          setLocalStream(stream);
          if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error('[GroupCallRoom] Join failed:', error);
        onLeave();
      }
    };

    startCall();

    return () => {
      isMounted = false;
      groupCallService.leaveCall();
    };
  }, [callData, onLeave]);

  const toggleMic = () => {
    const newState = !isMicOn;
    groupCallService.toggleMic(newState);
    setIsMicOn(newState);
  };

  const toggleCamera = () => {
    const newState = !isCameraOn;
    groupCallService.toggleCamera(newState);
    setIsCameraOn(newState);
  };

  const handleLeave = () => {
    groupCallService.leaveCall();
    onLeave();
  };

  const allPeers = Array.from(remoteStreams.entries());
  const gridClass = `grid-${Math.min(allPeers.length + 1, 9)}`;

  const isVoiceCall = callData?.type === 'VOICE';

  return (
    <div className="group-call-room-overlay">
      <div className={`group-call-grid ${gridClass}`}>
        {/* Local Stream */}
        <div className={`video-tile local-tile ${speakers.has('local') ? 'speaking' : ''}`}>
          {speakers.has('local') && <div className="speaking-ripple" />}
          {!isVoiceCall ? (
            <video ref={localVideoRef} autoPlay playsInline muted />
          ) : (
            <div className="video-off-placeholder">
              <div className="voice-mode-avatar">B</div>
              <span>Bạn (Audio)</span>
            </div>
          )}
          <div className="participant-name">
            {isMicOn ? <IoMicOutline /> : <IoMicOffOutline style={{color: '#ff3b30'}} />}
            <span>Bạn</span>
          </div>
          {!isCameraOn && !isVoiceCall && (
            <div className="video-off-placeholder">
               <IoVideocamOffOutline size={48} />
               <span>Camera đang tắt</span>
            </div>
          )}
        </div>

        {/* Remote Streams */}
        {allPeers.map(([peerId, stream]) => (
          <VideoTile 
            key={peerId} 
            peerId={peerId} 
            stream={stream} 
            isSpeaking={speakers.has(peerId)}
            isVoiceCall={isVoiceCall}
          />
        ))}
      </div>

      <div className="call-controls">
        <button onClick={toggleMic} className={`control-btn ${!isMicOn ? 'off' : ''}`} title="Microphone">
          {isMicOn ? <IoMicOutline /> : <IoMicOffOutline />}
        </button>
        {!isVoiceCall && (
          <button onClick={toggleCamera} className={`control-btn ${!isCameraOn ? 'off' : ''}`} title="Camera">
            {isCameraOn ? <IoVideocamOutline /> : <IoVideocamOffOutline />}
          </button>
        )}
        <button onClick={handleLeave} className="control-btn hangup" title="Kết thúc">
          <IoCallOutline />
        </button>
      </div>
    </div>
  );
};

const VideoTile = ({ peerId, stream, isSpeaking, isVoiceCall }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream && !isVoiceCall) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, isVoiceCall]);

  const namePart = peerId ? peerId.split('-')[0] : 'User';
  const displayName = (namePart || 'User').charAt(0).toUpperCase() + (namePart || 'User').slice(1, 4);

  return (
    <div className={`video-tile ${isSpeaking ? 'speaking' : ''}`}>
      {isSpeaking && <div className="speaking-ripple" />}
      {!isVoiceCall ? (
        <video ref={videoRef} autoPlay playsInline />
      ) : (
        <div className="video-off-placeholder">
          <div className="voice-mode-avatar">{displayName.charAt(0)}</div>
          <span>{displayName} (Audio)</span>
        </div>
      )}
      <div className="participant-name">
        <IoMicOutline />
        <span>{displayName}</span>
      </div>
    </div>
  );
};

export default GroupCallRoom;
