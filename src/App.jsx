import React from "react";
import "./index.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./page/Login";
import Register from "./page/Register";
import ForgotPassword from "./page/ForgotPassword";
import ZaloLock from "./page/ZaloLock";
import Chat from "./page/Chat";
import Zalo from "./page/Zalo";
import ProtectedRoute from "./Context/ProtectedRoute";

import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Auth routes - chỉ được vào khi chưa đăng nhập */}
        <Route 
          path="/auth/login" 
          element={
            <ProtectedRoute requireAuth={false}>
              <Login />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/auth/register" 
          element={
            <ProtectedRoute requireAuth={false}>
              <Register />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/auth/forgot-password" 
          element={
            <ProtectedRoute requireAuth={false} redirectIfLoggedIn={false}>
              <ForgotPassword />
            </ProtectedRoute>
          } 
        />
        <Route
          path="/auth/lock"
          element={
            <ProtectedRoute requireAuth={false} redirectIfLoggedIn={false}>
              <ZaloLock />
            </ProtectedRoute>
          }
        />

        {/* Protected routes - chỉ được vào khi đã đăng nhập */}
        <Route 
          path="/" 
          element={
            <ProtectedRoute requireAuth={true}>
              <Zalo />
            </ProtectedRoute>
          } 
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
