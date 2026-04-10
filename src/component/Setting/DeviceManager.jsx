import React, { useState, useEffect, useContext } from "react";
import { UserContext } from "../../Context/UserContext";
import axios from "axios";
import WebSocketService from "../../services/WebSocketService";
import "../../resource/style/component/deviceManager.css";
import { MdDelete } from "react-icons/md";
import { IoRefresh } from "react-icons/io5";

export default function DeviceManager() {
  const { userData } = useContext(UserContext);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Fetch devices on mount
  useEffect(() => {
    fetchDevices();
    
    // Setup WebSocket listeners
    const handleDeviceLogout = (event) => {
      setSuccessMessage("Device logged out successfully");
      // Remove device from list
      setDevices(prevDevices => 
        prevDevices.filter(d => d.deviceId !== event.deviceId)
      );
      setTimeout(() => setSuccessMessage(""), 3000);
    };

    const handleError = (errorEvent) => {
      setError(errorEvent.error || "An error occurred");
      setTimeout(() => setError(""), 3000);
    };

    WebSocketService.on('device-logout', handleDeviceLogout);
    WebSocketService.on('auth-error', handleError);

    return () => {
      WebSocketService.off('device-logout', handleDeviceLogout);
      WebSocketService.off('auth-error', handleError);
    };
  }, []);

  const fetchDevices = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await axios.get("http://localhost:8080/api/v1/auth/devices", {
        withCredentials: true,
      });

      if (response.data.data) {
        setDevices(response.data.data);
      }
    } catch (err) {
      console.error("Error fetching devices:", err);
      setError("Failed to load devices. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogoutDevice = async (deviceId, platform) => {
    try {
      setError("");
      setSuccessMessage("");
      
      // Try WebSocket first, fallback to REST API
      if (WebSocketService.isConnectionActive()) {
        console.log("Using WebSocket for device logout");
        WebSocketService.logoutDevice(deviceId, platform);
      } else {
        console.log("Using REST API for device logout");
        const response = await axios.post(
          "http://localhost:8080/api/v1/auth/logout-device",
          {
            deviceId: deviceId,
            platform: platform,
          },
          {
            withCredentials: true,
          }
        );

        setSuccessMessage("Device logged out successfully");
        
        // Remove device from list
        setDevices(devices.filter(d => d.deviceId !== deviceId));
        
        setTimeout(() => setSuccessMessage(""), 3000);
      }
    } catch (err) {
      console.error("Error logging out device:", err);
      setError("Failed to logout device. Please try again.");
    }
  };

  const getPlatformIcon = (platform) => {
    switch (platform) {
      case "WEB":
        return "🖥️";
      case "ANDROID":
        return "📱";
      case "IOS":
        return "🍎";
      default:
        return "💻";
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString("vi-VN", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="device-manager-container">
      <div className="device-manager-header">
        <h3>Quản lý thiết bị</h3>
        <button
          className="refresh-btn"
          onClick={fetchDevices}
          disabled={loading}
          title="Làm mới danh sách"
        >
          <IoRefresh size={20} />
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}
      {successMessage && <div className="success-message">{successMessage}</div>}

      {loading ? (
        <div className="loading-spinner">Đang tải...</div>
      ) : devices.length === 0 ? (
        <div className="no-devices">Không có thiết bị nào</div>
      ) : (
        <div className="devices-list">
          {devices.map((device) => (
            <div key={device.id} className="device-item">
              <div className="device-info">
                <div className="device-icon">
                  {getPlatformIcon(device.platform)}
                </div>
                <div className="device-details">
                  <div className="device-name">{device.deviceName}</div>
                  <div className="device-platform">{device.platform}</div>
                  <div className="device-dates">
                    <small>Tạo: {formatDate(device.createdAt)}</small>
                    <span className="separator">•</span>
                    <small>Lần cuối: {formatDate(device.lastSeenAt)}</small>
                  </div>
                </div>
              </div>
              <button
                className="logout-btn"
                onClick={() => handleLogoutDevice(device.deviceId, device.platform)}
                title="Đăng xuất thiết bị này"
              >
                <MdDelete size={20} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
