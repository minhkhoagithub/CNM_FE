import React, { useCallback, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserContext } from "../Context/UserContext";
import WebSocketService from "../services/WebSocketService";
import { approveDeviceLogin, getCurrentUser, userLogout } from "../util/api";
import Chat from "./Chat";
import Loadding from "./Loadding";
import Login from "./Login";

export default function Zalo() {
  const [chat, setChat] = useState(false);
  const [isLoadding, setIsLoadding] = useState(true);
  const { setUserData } = useContext(UserContext);
  const navigate = useNavigate();

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
          const currentUser = response?.data || response;

          if (currentUser?.userId) {
            localStorage.setItem("userProfile", JSON.stringify(currentUser));
            setUserData(currentUser);
            setChat(true);

            WebSocketService.connect(currentUser.userId).catch((err) =>
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

    void fetchUserProfile();
  }, [setUserData]);

  useEffect(() => {
    if (!chat) {
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
        `Thiet bi moi "${event?.deviceName || "Unknown device"}" (${event?.platform || "UNKNOWN"}) dang yeu cau dang nhap. Ban co muon cho phep khong?`,
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
  }, [chat, handleLogout]);

  return (
    <>
      {isLoadding ? (
        <Loadding />
      ) : chat ? (
        <Chat handleLogout={handleLogout} />
      ) : (
        <Login handleChangeStateChat={handleChangeStateChat} />
      )}
    </>
  );
}
