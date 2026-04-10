import React from "react";
import { Navigate } from "react-router-dom";

const ProtectedRoute = ({ children, requireAuth = true, redirectIfLoggedIn = true }) => {
  const isLogin = localStorage.getItem("isLogin") === "true";

  // Nếu yêu cầu xác thực (requireAuth = true) nhưng chưa đăng nhập
  if (requireAuth && !isLogin) {
    return <Navigate to="/auth/login" replace />;
  }

  // Nếu không yêu cầu xác thực (requireAuth = false) nhưng đã đăng nhập
  // và redirectIfLoggedIn = true, thì redirect về trang chủ
  if (!requireAuth && isLogin && redirectIfLoggedIn) {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;
