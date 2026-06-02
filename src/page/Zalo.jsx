import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserContext } from "../Context/UserContext";
import { useNotifications } from "../Context/NotificationContext";
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
import { initiateGroupCallApi, leaveGroupCallApi, getGroupCallStatusApi } from "../services/call/groupCallApi";
import GroupCallRoom from "../component/Call/GroupCallRoom";

const normalizeGroupCallData = (payload = {}) => {
  const callType = String(
    payload?.type || payload?.callType || payload?.raw?.type || payload?.raw?.callType || "VOICE"
  ).toUpperCase();

  return {
    ...payload,
    type: callType,
    callType,
  };
};

export default function Zalo() {
  const [chat, setChat] = useState(false);
  const { userData, setUserData } = useContext(UserContext);
  const [isLoadding, setIsLoadding] = useState(true);
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const navigate = useNavigate();
  const { revokeWebPush, clearState: clearNotificationState } = useNotifications();

  // Call states (1-1)
  const [callState, setCallState] = useState("idle");
  const [callData, setCallData] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isRemoteVideoOff, setIsRemoteVideoOff] = useState(false);
  const [isAcceptingCall, setIsAcceptingCall] = useState(false);
  const isAcceptingCallRef = useRef(false);

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
      await revokeWebPush();
    } catch (err) {
      console.warn("Revoke web push token failed:", err);
    }

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
    clearNotificationState();
    setChat(false);
    setUserData(null);
    navigate("/auth/login");
  }, [clearNotificationState, navigate, revokeWebPush, setUserData]);

  useEffect(() => {
    if (userData?.userId || userData?._id) {
      setChat(true);
    }
  }, [userData]);

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
            setUserData(null);
            setChat(false);
          }
        } else {
          setUserData(null);
          setChat(false);
        }
      } catch (err) {
        console.error("Fetch user profile error:", err);
        localStorage.setItem("isLogin", "false");
        localStorage.removeItem("userProfile");
        setUserData(null);
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
      setGroupCallData(normalizeGroupCallData(payload));
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
    const handleJoinRequest = async (e) => {
      console.log('[Zalo] 👥 JOIN Request from Message:', e.detail);
      const callLog = e.detail;
      
      if (callLog?.groupCallId) {
        try {
          const statusInfo = await getGroupCallStatusApi(callLog.groupCallId);
          // Kiểm tra nếu cuộc gọi đã kết thúc hoặc không tồn tại
          if (!statusInfo || statusInfo.status === 'ENDED' || statusInfo.isEnded) {
            alert('Cuộc gọi này đã kết thúc hoặc không còn tồn tại.');
            return;
          }
          // Cập nhật lại dữ liệu tươi mới từ API (channel, sfuUrl...)
          setGroupCallData(normalizeGroupCallData({ ...callLog, ...statusInfo }));
        } catch (err) {
          console.error('[Zalo] Failed to check group call status:', err);
          alert('Cuộc gọi đã kết thúc.');
          return;
        }
      } else {
        setGroupCallData(normalizeGroupCallData(callLog));
      }

      setGroupCallState('connected');
    };

    const handleWindowIncoming = (e) => {
      console.log('[Zalo] 👥 INCOMING from window:', e.detail);
      setGroupCallData(normalizeGroupCallData(e.detail));
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

  const handleLeaveGroupCall = async () => {
    if (groupCallData?.groupCallId) {
      try {
        await leaveGroupCallApi(groupCallData.groupCallId);
      } catch (err) {
        console.error('[Zalo] Error leaving group call API:', err);
      }
    }
    setGroupCallState('idle');
    setGroupCallData(null);
  };

  // Ping server liên tục mỗi 5s để báo hiệu "tôi vẫn còn sống" (tránh zombie call)
  useEffect(() => {
    let pingInterval;
    if (groupCallState === 'connected' && groupCallData?.groupCallId) {
      pingInterval = setInterval(async () => {
        try {
          const { pingGroupCallApi } = await import('../services/call/groupCallApi');
          await pingGroupCallApi(groupCallData.groupCallId);
        } catch (err) {
          console.warn('[Zalo] Failed to ping group call:', err);
        }
      }, 5000);
    }
    return () => {
      if (pingInterval) clearInterval(pingInterval);
    };
  }, [groupCallState, groupCallData]);

  // Xử lý khi người dùng đóng trình duyệt/tab đột ngột
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (groupCallState === 'connected' && groupCallData?.groupCallId) {
        // Sử dụng fetch keepalive để gửi request với auth header khi đóng tab
        const token = localStorage.getItem('token');
        if (token) {
           const baseUrl = import.meta.env.VITE_BASE_API_URL || 'http://localhost:8080/api/v1';
           const url = `${baseUrl}/group-calls/${groupCallData.groupCallId}/leave`;
           fetch(url, {
             method: 'POST',
             headers: {
               'Authorization': `Bearer ${token}`
             },
             keepalive: true
           }).catch(console.error);
        }
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [groupCallState, groupCallData]);

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
      setIsAcceptingCall(false);
      isAcceptingCallRef.current = false;
      callService.finishRemoteCall();
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
    if (!callData || isAcceptingCallRef.current) return;

    isAcceptingCallRef.current = true;
    setIsAcceptingCall(true);

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
            setIsAcceptingCall(false);
            isAcceptingCallRef.current = false;
         },
         onStateChange: (state) => {
            if (state === "connected") {
               setCallState("connected");
               setLocalStream(callService.getLocalStream());
               setIsAcceptingCall(false);
               isAcceptingCallRef.current = false;
            } else if (state === "ended") {
               setCallState("idle");
               setIsRemoteVideoOff(false);
               setIsAcceptingCall(false);
               isAcceptingCallRef.current = false;
            }
         }
      });
    } catch (err) {
      console.error("Accept call error", err);
      setCallState("idle");
      setIsAcceptingCall(false);
      isAcceptingCallRef.current = false;
    }
  };

  const handleRejectCall = () => {
    if (isAcceptingCallRef.current) return;

    if (callData?.callId) {
       callService.rejectCall(callData.callId);
    }
    setCallState("idle");
    setCallData(null);
    setIsAcceptingCall(false);
    isAcceptingCallRef.current = false;
  };

  const handleEndCall = () => {
    callService.endCall();
    setCallState("idle");
    setCallData(null);
    setIsAcceptingCall(false);
    isAcceptingCallRef.current = false;
  };

  return (
    <>
      {callState === "incoming" && callData && (
        <IncomingCallModal 
          callerName={callData.callerName}
          callType={callData.callType}
          onAccept={handleAcceptCall}
          onReject={handleRejectCall}
          isAccepting={isAcceptingCall}
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
          onLeave={handleLeaveGroupCall} 
        />
      )}

      {/* Modal nhận cuộc gọi nhóm */}
      {groupCallState === "incoming" && (
        <IncomingCallModal 
          callerName={groupCallData?.initiatorName || 'Cuộc gọi nhóm'}
          onAccept={handleAcceptGroupCall}
          onReject={handleRejectGroupCall}
          callType={groupCallData?.callType || groupCallData?.type || 'VIDEO'}
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


