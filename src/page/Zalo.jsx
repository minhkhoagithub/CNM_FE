import React, { useContext, useLayoutEffect, useState, useEffect } from "react";
import { UserContext } from "../Context/UserContext";
import { useNavigate } from "react-router-dom";
import Login from "./Login";
import Chat from "./Chat";
import Loadding from "./Loadding";
import { userLogout, userLoginByToken, getCurrentUser } from "../util/api";
import WebSocketService from "../services/WebSocketService";
import CallRoom from "../component/Call/CallRoom";
import IncomingCallModal from "../component/Call/IncomingCallModal";
import OutgoingCallModal from "../component/Call/OutgoingCallModal";
import callService from "../services/call/CallService";

export default function Zalo() {
  const [chat, setChat] = useState(false);
  const { userData, setUserData } = useContext(UserContext);
  const [isLoadding, setIsLoadding] = useState(true);
  const navigate = useNavigate();

  // Call states
  const [callState, setCallState] = useState("idle"); // 'idle' | 'incoming' | 'outgoing' | 'connected'
  const [callData, setCallData] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isRemoteVideoOff, setIsRemoteVideoOff] = useState(false);

  const handleChangeStateChat = () => {
    setChat(true);
  };

  const handleLogout = async () => {
    try {
      await userLogout();
    } catch (err) {
      console.error("Logout error:", err);
    }
    localStorage.setItem("isLogin", "false");
    localStorage.removeItem("userProfile");
    localStorage.removeItem("deviceId");
    setChat(false);
    setUserData(null);
    WebSocketService.disconnect();
    navigate("/auth/login");
  };

  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const isLogin = localStorage.getItem("isLogin");
        if (isLogin === "true") {
          const response = await getCurrentUser();
          if (response.data) {
            localStorage.setItem("userProfile", JSON.stringify(response.data));
            setUserData(response.data);
            WebSocketService.connect(response.data.userId);
            setChat(true);
          } else {
            setChat(false);
          }
        } else {
          setChat(false);
        }
        setIsLoadding(false);
      } catch (err) {
        console.error("Fetch user profile error:", err);
        setChat(false);
        setIsLoadding(false);
      }
    };
    fetchUserProfile();
  }, [setUserData]);

  useEffect(() => {
    if (userData) {
      const handleRemoteLogout = (event) => {
        console.log("[Zalo] Remote logout received:", event);
        handleLogout();
      };
      WebSocketService.on("device-logout", handleRemoteLogout);
      return () => {
        WebSocketService.off("device-logout", handleRemoteLogout);
      };
    }
  }, [chat]);

  // Call Event Listeners
  useEffect(() => {
    const handleStartCallRequest = async (e) => {
      const { type, calleeId, peerId } = e.detail;
      setCallState("outgoing");
      setCallData({ calleeId, callType: type });
      try {
        await callService.startCall({
          calleeId,
          type,
          peerId,
          onRemoteStream: (stream) => setRemoteStream(stream),
          onLocalStream: (stream) => setLocalStream(stream),
          onRemoteVideoToggle: (enabled) => setIsRemoteVideoOff(!enabled),
          onCallEnded: () => {
            setCallState("idle");
            setCallData(null);
            setLocalStream(null);
            setRemoteStream(null);
            setIsRemoteVideoOff(false);
          },
          onStateChange: (state) => {
             if (state === "connected") {
                setCallState("connected");
                setLocalStream(callService.getLocalStream());
             } else if (state === "ended") {
                setCallState("idle");
                setIsRemoteVideoOff(false);
             }
          }
        });
      } catch (err) {
        console.error("Start call error", err);
        setCallState("idle");
        alert("Có lỗi xảy ra khi bắt đầu cuộc gọi.");
      }
    };

    window.addEventListener("start-call-request", handleStartCallRequest);
    return () => window.removeEventListener("start-call-request", handleStartCallRequest);
  }, []);

  useEffect(() => {
    if (userData) {
       const handleIncomingCall = (payload) => {
          console.log("[Zalo] 📞 Nhận cuộc gọi đến:", payload);
          setCallState("incoming");
          setCallData(payload);
       };
       WebSocketService.on("incoming-call", handleIncomingCall);
       return () => WebSocketService.off("incoming-call", handleIncomingCall);
    }
  }, [userData]);

  useEffect(() => {
    if (userData) {
      const handleCallAccepted = (payload) => {
        console.log("[Zalo] Call accepted:", payload);
        if (callState === "outgoing") {
          setCallState("connected");
          setLocalStream(callService.getLocalStream());
        }
      };

      const handleCallTerminated = (payload) => {
        console.log("[Zalo] Call terminated/rejected:", payload);
        setCallState("idle");
        setCallData(null);
        setLocalStream(null);
        setRemoteStream(null);
        setIsRemoteVideoOff(false);
        // Ensure SFU connection is cleaned up
        callService.endCall();
      };

      const handleCallAction = (payload) => {
        console.log("[Zalo] ⚡ CALL ACTION Received:", payload);
        if (payload.action === 'VIDEO_OFF') setIsRemoteVideoOff(true);
        else if (payload.action === 'VIDEO_ON') setIsRemoteVideoOff(false);
      };

      WebSocketService.on("call-accepted", handleCallAccepted);
      WebSocketService.on("call-rejected", handleCallTerminated);
      WebSocketService.on("call-ended", handleCallTerminated);
      WebSocketService.on("call-action", handleCallAction);

      return () => {
        WebSocketService.off("call-accepted", handleCallAccepted);
        WebSocketService.off("call-rejected", handleCallTerminated);
        WebSocketService.off("call-ended", handleCallTerminated);
        WebSocketService.off("call-action", handleCallAction);
      };
    }
  }, [userData, callState]);

  const handleAcceptCall = async () => {
    if (!callData) return;
    try {
      await callService.acceptCall({
         callId: callData.callId,
         sfuUrl: callData.sfuUrl,
         channel: callData.roomId,
         peerId: userData?.userId || "",
         type: callData.callType,
         onRemoteStream: (stream) => setRemoteStream(stream),
         onLocalStream: (stream) => setLocalStream(stream),
         onRemoteVideoToggle: (enabled) => setIsRemoteVideoOff(!enabled),
         onCallEnded: () => {
            setCallState("idle");
            setCallData(null);
            setLocalStream(null);
            setRemoteStream(null);
            setIsRemoteVideoOff(false);
         },
         onStateChange: (state) => {
            if (state === "connected") {
               setCallState("connected");
               setLocalStream(callService.getLocalStream());
            } else if (state === "ended") {
               setCallState("idle");
               setIsRemoteVideoOff(false);
            }
         }
      });
    } catch (err) {
      console.error("Accept call error", err);
      setCallState("idle");
    }
  };

  const handleRejectCall = () => {
    if (callData?.callId) {
       callService.rejectCall(callData.callId);
    }
    setCallState("idle");
    setCallData(null);
  };

  const handleEndCall = () => {
    callService.endCall();
    setCallState("idle");
    setCallData(null);
  };

  return (
    <>
      {callState === "incoming" && callData && (
        <IncomingCallModal 
          callerName={callData.callerName}
          callType={callData.callType}
          onAccept={handleAcceptCall}
          onReject={handleRejectCall}
        />
      )}
      {callState === "outgoing" && (
        <OutgoingCallModal 
          calleeName="Đang kết nối..."
          callType={callData?.callType}
          onCancel={handleEndCall}
        />
      )}
      {callState === "connected" && (
        <CallRoom 
          callType={callData?.callType || "VOICE"}
          localStream={localStream}
          remoteStream={remoteStream}
          isRemoteVideoOff={isRemoteVideoOff}
          onEnd={handleEndCall}
        />
      )}

      {/* Main app UI - only show when not in any call state */}
      {callState === "idle" && (
        isLoadding ? (
          <Loadding />
        ) : chat ? (
          <Chat handleLogout={handleLogout} />
        ) : (
          <Login handleChangeStateChat={handleChangeStateChat} />
        )
      )}
    </>
  );
}
