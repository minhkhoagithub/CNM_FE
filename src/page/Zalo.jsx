import React, { useCallback, useContext, useEffect, useState } from "react";
import { UserContext } from "../Context/UserContext";
import { useNavigate } from "react-router-dom";
import Login from "./Login";
import Chat from "./Chat";
import Loadding from "./Loadding";
import { userLogout, getCurrentUser } from "../util/api";
import WebSocketService from "../services/WebSocketService";

export default function Zalo() {
  const [chat, setChat] = useState(false);
  const { setUserData } = useContext(UserContext);
  const [isLoadding, setIsLoadding] = useState(true);
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
        // Check isLogin từ localStorage
        const isLogin = localStorage.getItem("isLogin");
        
        if (isLogin === "true") {
          // Gọi getCurrentUser để lấy thông tin người dùng
          const response = await getCurrentUser();
          
          if (response.data) {
            // Lưu thông tin người dùng vào localStorage
            localStorage.setItem("userProfile", JSON.stringify(response.data));
            // Context wrapper sẽ tự động transform
            setUserData(response.data);
            setChat(true);
            
            // CONNECT WEBSOCKET HERE
            WebSocketService.connect(response.data.userId).catch((err) =>
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
        setIsLoadding(false);
      } catch (err) {
        console.error("Fetch user profile error:", err);
        localStorage.setItem("isLogin", "false");
        localStorage.removeItem("userProfile");
        setChat(false);
        setIsLoadding(false);
      }
    };
    fetchUserProfile();
  }, [setUserData]);

  // Setup WebSocket listener for remote logout
  useEffect(() => {
    if (chat) {
      // Khi nhận được device-logout từ WebSocket, gọi handleLogout
      const handleRemoteLogout = (event) => {
        console.log("[Zalo] Remote logout received:", event);
        const currentDeviceId = localStorage.getItem("deviceId");
        if (event && event.deviceId === currentDeviceId) {
          handleLogout();
        } else {
          console.log("[Zalo] Ignoring remote logout as deviceId does not match current device.");
        }
      };

      WebSocketService.on("device-logout", handleRemoteLogout);

      return () => {
        // Cleanup listener khi component unmount
        WebSocketService.off("device-logout", handleRemoteLogout);
      };
    }
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
