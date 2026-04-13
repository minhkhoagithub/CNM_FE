import React from "react";
import { Navigate, useLocation } from "react-router-dom";

const ProtectedRoute = ({ children, requireAuth = true, redirectIfLoggedIn = true }) => {
  const hasLoginFlag = localStorage.getItem("isLogin") === "true";
  const hasUserProfile = !!localStorage.getItem("userProfile");
  const isLogin = hasLoginFlag && hasUserProfile;
  const { pathname } = useLocation();
  const isAuthPath = pathname.startsWith("/auth/");
  const shouldRequireAuth = requireAuth && !isAuthPath;

  // Nếu yêu cầu xác thực (requireAuth = true) nhưng chưa đăng nhập
  if (shouldRequireAuth && !isLogin) {
    return <Navigate to="/auth/login" replace />;
  }

  // Nếu không yêu cầu xác thực (requireAuth = false) nhưng đã đăng nhập
  // và redirectIfLoggedIn = true, thì redirect về trang chủ
  if ((!requireAuth || isAuthPath) && isLogin && redirectIfLoggedIn) {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;
