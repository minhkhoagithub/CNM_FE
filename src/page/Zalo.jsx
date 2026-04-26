import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserContext } from "../Context/UserContext";
import WebSocketService from "../services/WebSocketService";
import { approveDeviceLogin, getCurrentUser, userLogout } from "../util/api";
import Chat from "./Chat";
import Loadding from "./Loadding";
import Login from "./Login";
import CallRoom from "../component/Call/CallRoom";
import IncomingCallModal from "../component/Call/IncomingCallModal";
import OutgoingCallModal from "../component/Call/OutgoingCallModal";
import callService from "../services/call/CallService";
import groupCallService from "../services/call/GroupCallService";
import { initiateGroupCallApi, leaveGroupCallApi } from "../services/call/groupCallApi";
import GroupCallRoom from "../component/Call/GroupCallRoom";

export default function Zalo() {
  const [chat, setChat] = useState(false);
  const { userData, setUserData } = useContext(UserContext);
  const [isLoadding, setIsLoadding] = useState(true);
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const navigate = useNavigate();

  // Call states (1-1)
  const [callState, setCallState] = useState("idle");
  const [callData, setCallData] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isRemoteVideoOff, setIsRemoteVideoOff] = useState(false);

  // [FIX Bug 2] Dùng ref để tránh stale closure trong event listeners
  const callStateRef = useRef("idle");
  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  // Group Call states (tách biệt hoàn toàn)
  const [groupCallState, setGroupCallState] = useState('idle'); // 'idle' | 'incoming' | 'connected'
  const [groupCallData, setGroupCallData] = useState(null);
  const [groupLocalStream, setGroupLocalStream] = useState(null);
  const [groupRemoteStreams, setGroupRemoteStreams] = useState(new Map());
  const [groupActiveSpeaker, setGroupActiveSpeaker] = useState(null);

  const handleChangeStateChat = () => {
    setChat(true);
  };

  const handleLogout = useCallback(async () => {
    try {
      await userLogout();
    } catch (err) {
      console.error("Logout error:", err);
    }

    try {
      WebSocketService.disconnect();
    } catch (error) {
      console.error(error);
    }

    localStorage.setItem("isLogin", "false");
    localStorage.removeItem("userProfile");
    localStorage.removeItem("deviceId");
    setChat(false);
    setUserData(null);
    navigate("/auth/login");
  }, [navigate, setUserData]);

  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const isLogin = localStorage.getItem("isLogin");
        if (isLogin === "true") {
          const response = await getCurrentUser();
          if (response.data) {
            localStorage.setItem("userProfile", JSON.stringify(response.data));
            setUserData(response.data);
            setChat(true);

            const userId = response.data.userId || response.data.id || response.data._id;
            WebSocketService.connect(userId).catch((err) =>
              console.error("WS Connect error", err),
            );
          } else {
            localStorage.setItem("isLogin", "false");
            localStorage.removeItem("userProfile");
            setChat(false);
          }
        } else {
          setChat(false);
        }
      } catch (err) {
        console.error("Fetch user profile error:", err);
        localStorage.setItem("isLogin", "false");
        localStorage.removeItem("userProfile");
        setChat(false);
      } finally {
        setIsLoadding(false);
      }
    };
    fetchUserProfile();
  }, [setUserData]);

  useEffect(() => {
    if (!userData) {
      return undefined;
    }

    const handleRemoteLogout = (event) => {
      console.log("[Zalo] Remote logout received:", event);
      const currentDeviceId = localStorage.getItem("deviceId");

      if (event && event.deviceId === currentDeviceId) {
        void handleLogout();
      } else {
        console.log(
          "[Zalo] Ignoring remote logout as deviceId does not match current device.",
        );
      }
    };

    const handleDeviceLoginRequest = async (event) => {
      const shouldApprove = window.confirm(
        `Thiết bị mới "${event?.deviceName || "Unknown device"}" (${event?.platform || "UNKNOWN"}) đang yêu cầu đăng nhập. Bạn có muốn cho phép không?`,
      );

      try {
        await approveDeviceLogin({
          requestId: event.approvalId,
          status: shouldApprove ? "APPROVED" : "REJECTED",
        });
      } catch (error) {
        console.error("Approve device login error:", error);
      }
    };

    WebSocketService.on("device-logout", handleRemoteLogout);
    WebSocketService.on("device-login-request", handleDeviceLoginRequest);

    return () => {
      WebSocketService.off("device-logout", handleRemoteLogout);
      WebSocketService.off("device-login-request", handleDeviceLoginRequest);
    };
  }, [userData, handleLogout]);

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
          onRemoteStream: (stream) => {
            console.log("[Zalo] 📡 Nhận remote stream mới:", stream.id, "Tracks:", stream.getTracks().length);
            // Ép React re-render bằng cách tạo bọc mới hoặc dùng timestamp nếu cần
            setRemoteStream(stream);
          },
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
    if (!userData) return;
    const handleIncomingCall = (payload) => {
      console.log("[Zalo] 📞 INCOMING_CALL nhận được:", payload);
      console.log("[Zalo] 📞 Web userId đang dùng:", userData?.userId || userData?.id);
      if (!payload?.callId) {
        console.error("[Zalo] ❌ INCOMING_CALL payload thiếu callId!", payload);
        return;
      }
      setCallState("incoming");
      setCallData(payload);
    };
    WebSocketService.on("incoming-call", handleIncomingCall);
    console.log("[Zalo] ✅ Đã đăng ký listener incoming-call cho userId:", userData?.userId || userData?.id);
    return () => WebSocketService.off("incoming-call", handleIncomingCall);
  }, [userData]);

  // --- Group Call WebSocket Subscription (tách biệt khỏi luồng 1-1) ---
  useEffect(() => {
    if (!userData) return;
    const handleGroupCallIncoming = (payload) => {
      console.log('[Zalo] 👥 GROUP_CALL_INCOMING:', payload);
      setGroupCallState('incoming');
      setGroupCallData(payload);
    };
    const handleGroupCallEnded = (payload) => {
      console.log('[Zalo] Group call ended:', payload);
      if (groupCallState !== 'idle') {
        setGroupCallState('idle');
        setGroupCallData(null);
        setGroupLocalStream(null);
        setGroupRemoteStreams(new Map());
        groupCallService.leaveCall();
      }
    };
    WebSocketService.on('group-call-incoming', handleGroupCallIncoming);
    WebSocketService.on('group-call-ended', handleGroupCallEnded);

    // Lắng nghe sự kiện từ ContainerMess gửi lên (CustomEvent)
    const handleJoinRequest = (e) => {
      console.log('[Zalo] 👥 JOIN Request from Message:', e.detail);
      setGroupCallData(e.detail);
      setGroupCallState('connected');
    };

    const handleWindowIncoming = (e) => {
      console.log('[Zalo] 👥 INCOMING from window:', e.detail);
      setGroupCallData(e.detail);
      setGroupCallState('incoming');
    };

    const handleWindowEnded = (e) => {
      if (groupCallState !== 'idle') {
        setGroupCallState('idle');
        setGroupCallData(null);
      }
    };

    window.addEventListener('group-call-join-request', handleJoinRequest);
    window.addEventListener('group-call-incoming', handleWindowIncoming);
    window.addEventListener('group-call-ended', handleWindowEnded);

    return () => {
      WebSocketService.off('group-call-incoming', handleGroupCallIncoming);
      WebSocketService.off('group-call-ended', handleGroupCallEnded);
      window.removeEventListener('group-call-join-request', handleJoinRequest);
      window.removeEventListener('group-call-incoming', handleWindowIncoming);
      window.removeEventListener('group-call-ended', handleWindowEnded);
    };
  }, [userData, groupCallState]);

  // --- Tự động subscribe topic cuộc gọi khi vào phòng chat ---
  useEffect(() => {
    if (selectedConversationId) {
      WebSocketService.subscribeGroupCall(selectedConversationId);
      return () => {
        WebSocketService.unsubscribeGroupCall(selectedConversationId);
      };
    }
  }, [selectedConversationId]);

  const handleAcceptGroupCall = () => {
    setGroupCallState('connected');
  };

  const handleRejectGroupCall = () => {
    setGroupCallState('idle');
    setGroupCallData(null);
  };

  useEffect(() => {
    if (!userData) return;

    // [FIX Bug 2] Dùng callStateRef thay vì callState để tránh stale closure
    const handleCallAccepted = (payload) => {
      console.log("[Zalo] ✅ CALL_ACCEPTED nhận được! callState hiện tại (ref):", callStateRef.current, "Payload:", payload);
      if (callStateRef.current === "outgoing") {
        setCallState("connected");
        setLocalStream(callService.getLocalStream());
      } else {
        console.warn("[Zalo] ⚠️ CALL_ACCEPTED bị bỏ qua vì callState không phải 'outgoing', ref hiện là:", callStateRef.current);
      }
    };

    const handleCallTerminated = (payload) => {
      console.log("[Zalo] Call terminated/rejected:", payload);
      setCallState("idle");
      setCallData(null);
      setLocalStream(null);
      setRemoteStream(null);
      setIsRemoteVideoOff(false);
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
  }, [userData]); // [FIX Bug 2] Bỏ callState khỏi deps - dùng ref thay thế

  const handleAcceptCall = async () => {
    if (!callData) return;
    try {
      await callService.acceptCall({
         callId: callData.callId,
         sfuUrl: callData.sfuUrl,
         channel: callData.roomId,
         peerId: userData?.userId || "",
         type: callData.callType,
          onRemoteStream: (stream) => {
            console.log("[Zalo] 📡 Nhận remote stream mới (Callee):", stream.id, "Tracks:", stream.getTracks().length);
            setRemoteStream(stream);
          },
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
          callState={callState}
          callType={callData?.callType}
          callData={callData}
          localStream={localStream}
          remoteStream={remoteStream}
          isRemoteVideoOff={isRemoteVideoOff}
          onEnd={handleEndCall}
        />
      )}

      {/* Group Call Room (Đa thành viên) */}
      {groupCallState === "connected" && (
        <GroupCallRoom 
          callData={groupCallData} 
          onLeave={() => setGroupCallState('idle')} 
        />
      )}

      {/* Modal nhận cuộc gọi nhóm */}
      {groupCallState === "incoming" && (
        <IncomingCallModal 
          callerName={groupCallData?.initiatorName || 'Cuộc gọi nhóm'}
          onAccept={handleAcceptGroupCall}
          onReject={handleRejectGroupCall}
          callType={groupCallData?.callType || 'VIDEO'}
        />
      )}

      {/* Main app UI - only show when not in any call state */}
      {callState === "idle" && groupCallState === "idle" && (
        isLoadding ? (
          <Loadding />
        ) : chat ? (
          <Chat 
            handleLogout={handleLogout} 
            onConversationSelect={(id) => setSelectedConversationId(id)}
          />
        ) : (
          <Login handleChangeStateChat={handleChangeStateChat} />
        )
      )}
    </>
  );
}


