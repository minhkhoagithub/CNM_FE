import React, { useState, useEffect, useCallback } from "react";
import { getUserDevices, logoutDevice } from "../../util/api/index.jsx";
import "../../resource/style/component/deviceManager.css";
import { IoRefresh, IoPhonePortraitOutline, IoDesktopOutline, IoLogoApple } from "react-icons/io5";
import { MdLogout, MdShield } from "react-icons/md";
import { AiOutlineLoading3Quarters } from "react-icons/ai";

const CURRENT_DEVICE_ID = localStorage.getItem("deviceId");

function getPlatformIcon(platform) {
  switch ((platform || "").toUpperCase()) {
    case "ANDROID":
      return <IoPhonePortraitOutline className="dm-platform-icon dm-android" />;
    case "IOS":
      return <IoLogoApple className="dm-platform-icon dm-ios" />;
    case "WEB":
    default:
      return <IoDesktopOutline className="dm-platform-icon dm-web" />;
  }
}

function getPlatformLabel(platform) {
  switch ((platform || "").toUpperCase()) {
    case "ANDROID": return "Android";
    case "IOS": return "iOS";
    case "WEB": return "Trình duyệt Web";
    default: return platform || "Không rõ";
  }
}

function formatRelativeTime(dateString) {
  if (!dateString) return "Không rõ";
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Vừa xong";
  if (diffMins < 60) return `${diffMins} phút trước`;
  if (diffHours < 24) return `${diffHours} giờ trước`;
  if (diffDays === 1) return "Hôm qua";
  if (diffDays < 30) return `${diffDays} ngày trước`;
  return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function DeviceManager({ handleLogout }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [logoutingId, setLogoutingId] = useState(null);
  const [confirmDevice, setConfirmDevice] = useState(null); // device object để confirm

  const currentDeviceId = localStorage.getItem("deviceId");

  const fetchDevices = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await getUserDevices();
      if (response?.data?.data) {
        // Sort: thiết bị hiện tại lên đầu, sau đó theo lastSeenAt mới nhất
        const sorted = [...response.data.data].sort((a, b) => {
          if (a.deviceId === currentDeviceId) return -1;
          if (b.deviceId === currentDeviceId) return 1;
          return new Date(b.lastSeenAt) - new Date(a.lastSeenAt);
        });
        setDevices(sorted);
      }
    } catch (err) {
      console.error("Error fetching devices:", err);
      setError("Không thể tải danh sách thiết bị. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }, [currentDeviceId]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  const showSuccess = (msg) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(""), 3500);
  };

  const handleConfirmLogout = (device) => {
    setConfirmDevice(device);
  };

  const handleCancelConfirm = () => {
    setConfirmDevice(null);
  };

  const handleDoLogout = async () => {
    if (!confirmDevice) return;
    const { deviceId, platform, deviceName } = confirmDevice;
    const isCurrent = deviceId === currentDeviceId;

    setConfirmDevice(null);
    setLogoutingId(deviceId);
    setError("");

    try {
      await logoutDevice({ deviceId, platform: platform.toString() });

      if (isCurrent) {
        showSuccess("Đã đăng xuất thiết bị này. Đang chuyển hướng...");
        setTimeout(() => {
          if (handleLogout) handleLogout();
        }, 1200);
      } else {
        setDevices((prev) => prev.filter((d) => d.deviceId !== deviceId));
        showSuccess(`Đã đăng xuất khỏi "${deviceName || platform}".`);
      }
    } catch (err) {
      console.error("Error logging out device:", err);
      setError(err.response?.data?.message || "Lỗi khi đăng xuất thiết bị. Vui lòng thử lại.");
    } finally {
      setLogoutingId(null);
    }
  };

  return (
    <div className="dm-container">
      {/* Header */}
      <div className="dm-header">
        <div className="dm-header-left">
          <MdShield className="dm-shield-icon" />
          <div>
            <h3 className="dm-title">Quản lý thiết bị</h3>
            <p className="dm-subtitle">
              {devices.length > 0
                ? `${devices.length} thiết bị đã đăng nhập`
                : "Đang tải..."}
            </p>
          </div>
        </div>
        <button
          className="dm-refresh-btn"
          onClick={fetchDevices}
          disabled={loading}
          title="Làm mới danh sách"
        >
          <IoRefresh
            size={18}
            className={loading ? "dm-spin" : ""}
          />
          <span>{loading ? "Đang tải..." : "Làm mới"}</span>
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="dm-alert dm-alert-error">
          <span>⚠️ {error}</span>
        </div>
      )}
      {successMessage && (
        <div className="dm-alert dm-alert-success">
          <span>✅ {successMessage}</span>
        </div>
      )}

      {/* Content */}
      {loading && devices.length === 0 ? (
        <div className="dm-loading-state">
          <AiOutlineLoading3Quarters className="dm-spin" size={32} />
          <p>Đang tải danh sách thiết bị...</p>
        </div>
      ) : devices.length === 0 ? (
        <div className="dm-empty-state">
          <IoDesktopOutline size={48} className="dm-empty-icon" />
          <p>Không có thiết bị nào được ghi nhận</p>
        </div>
      ) : (
        <div className="dm-devices-list">
          {devices.map((device) => {
            const isCurrent = device.deviceId === currentDeviceId;
            const isProcessing = logoutingId === device.deviceId;
            return (
              <div
                key={device.id || device.deviceId}
                className={`dm-device-card ${isCurrent ? "dm-device-current" : ""}`}
              >
                <div className="dm-device-icon-wrap">
                  {getPlatformIcon(device.platform)}
                </div>
                <div className="dm-device-info">
                  <div className="dm-device-name-row">
                    <span className="dm-device-name">
                      {device.deviceName || getPlatformLabel(device.platform)}
                    </span>
                    {isCurrent && (
                      <span className="dm-badge-current">Thiết bị này</span>
                    )}
                  </div>
                  <span className="dm-device-platform">
                    {getPlatformLabel(device.platform)}
                  </span>
                  <span className="dm-device-time">
                    Hoạt động cuối: {formatRelativeTime(device.lastSeenAt)}
                  </span>
                </div>
                {isCurrent ? (
                  <button
                    className="dm-logout-btn dm-logout-btn-disabled"
                    disabled
                    title="Bạn đang sử dụng thiết bị này, không thể đăng xuất từ đây"
                  >
                    <MdShield size={16} style={{ opacity: 0.6 }} />
                    <span style={{ opacity: 0.6 }}>Đang sử dụng</span>
                  </button>
                ) : (
                  <button
                    className="dm-logout-btn"
                    onClick={() => handleConfirmLogout(device)}
                    disabled={isProcessing}
                    title="Đăng xuất từ xa"
                  >
                    {isProcessing ? (
                      <AiOutlineLoading3Quarters className="dm-spin" size={16} />
                    ) : (
                      <MdLogout size={16} />
                    )}
                    <span>{isProcessing ? "Đang xử lý..." : "Đăng xuất"}</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Security tip */}
      {devices.length > 1 && (
        <div className="dm-security-tip">
          <span>🔒</span>
          <span>
            Nếu bạn thấy thiết bị không quen, hãy đăng xuất ngay và đổi mật khẩu.
          </span>
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmDevice && (
        <div className="dm-confirm-overlay" onClick={handleCancelConfirm}>
          <div className="dm-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dm-confirm-icon">
              {confirmDevice.deviceId === currentDeviceId ? "⚠️" : "🔐"}
            </div>
            <h4 className="dm-confirm-title">
              {confirmDevice.deviceId === currentDeviceId
                ? "Đăng xuất thiết bị này?"
                : "Đăng xuất từ xa?"}
            </h4>
            <p className="dm-confirm-desc">
              {confirmDevice.deviceId === currentDeviceId
                ? "Bạn sẽ bị đăng xuất khỏi ứng dụng ngay lập tức."
                : `Tài khoản sẽ bị đăng xuất khỏi "${confirmDevice.deviceName || getPlatformLabel(confirmDevice.platform)}". Phiên đăng nhập của thiết bị đó sẽ bị hủy.`}
            </p>
            <div className="dm-confirm-actions">
              <button className="dm-confirm-btn-cancel" onClick={handleCancelConfirm}>
                Hủy
              </button>
              <button
                className={`dm-confirm-btn-ok ${confirmDevice.deviceId === currentDeviceId ? "dm-confirm-btn-danger" : ""}`}
                onClick={handleDoLogout}
              >
                Xác nhận đăng xuất
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
