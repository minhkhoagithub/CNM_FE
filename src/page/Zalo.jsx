import React, { useContext, useLayoutEffect, useState, useEffect } from "react";
import { UserContext } from "../Context/UserContext";
import { useNavigate } from "react-router-dom";
import Login from "./Login";
import Chat from "./Chat";
import Loadding from "./Loadding";
import { userLogout, userLoginByToken, getCurrentUser } from "../util/api";
import WebSocketService from "../services/WebSocketService";

export default function Zalo() {
  const [chat, setChat] = useState(false);
  const { setUserData } = useContext(UserContext);
  const [isLoadding, setIsLoadding] = useState(true);
  const navigate = useNavigate();

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
  navigate("/auth/login");
};

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
  }, []);

  // Setup WebSocket listener for remote logout
  useEffect(() => {
    if (chat) {
      // Khi nhận được device-logout từ WebSocket, gọi handleLogout
      const handleRemoteLogout = (event) => {
        console.log("[Zalo] Remote logout received:", event);
        handleLogout();
      };

      WebSocketService.on("device-logout", handleRemoteLogout);

      return () => {
        // Cleanup listener khi component unmount
        WebSocketService.off("device-logout", handleRemoteLogout);
      };
    }
  }, [chat]);

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
