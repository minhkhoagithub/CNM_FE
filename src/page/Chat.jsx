import React, { useState, useEffect, useContext, memo, useRef, useCallback } from "react";
import { UserContext } from "../Context/UserContext";
import { ContactContext } from "../Context/ContactConext";
import { FiUser, FiSettings } from "react-icons/fi";
import QRCode from "qrcode";
import "../resource/style/Chat/chat.css";
import Message from "../component/Message/Message";
import AddressBook from "../component/AddressBook/AddressBook";
import ToDo from "../component/ToDo/ToDo";
import Clod from "../component/Cloud/Cloud";
import ToolBox from "../component/ToolBox/ToolBox";
import Setting from "../component/Setting/Setting";
import DeviceManager from "../component/Setting/DeviceManager";
import NotificationBell from "../component/Notifications/NotificationBell";
import NotificationsPanel from "../component/Notifications/NotificationsPanel";
import {
  changePassword,
  confirmEmailChange,
  confirmPhoneChange,
  getAccountSecuritySummary,
  getMyQr,
  getUserSettings,
  getZaloLock,
  sendEmailChangeOtp,
  sendPhoneChangeOtp,
  getUserDevices,
  logoutDevice,
  updateUserSettings,
  updateZaloLock,
  verifyEmailChangeOtp,
  verifyPhoneChangeOtp,
  verifyCurrentPassword,
} from "../util/api";
import mess from "../resource/svg/chat/chat.svg";
import addressbook from "../resource/svg/chat/addressbook.svg";
import todo from "../resource/svg/chat/todo.svg";
import cloud from "../resource/svg/chat/cloud.svg";
import toolbox from "../resource/svg/chat/toolbox.svg";
import setting from "../resource/svg/chat/setting.svg";

const formatSecurityIssue = (issue) => {
  if (issue === null || issue === undefined) {
    return "";
  }
  if (typeof issue === "string" || typeof issue === "number" || typeof issue === "boolean") {
    return String(issue);
  }
  if (typeof issue === "object") {
    return (
      issue.title ||
      issue.message ||
      issue.description ||
      issue.label ||
      issue.code ||
      Object.entries(issue)
        .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`)
        .join(" · ")
    );
  }
  return String(issue);
};

function Chat({ handleLogout, onConversationSelect }) {
  const { userData } = useContext(UserContext);
  const {
    normalizedConversations = [],
    openConversation,
    fetchConversation,
  } = useContext(ContactContext) || {};
  const [userSettings, setUserSettings] = useState({
    notifications: {
      pushEnabled: true,
      soundEnabled: true,
    },
    appearance: {
      theme: "SYSTEM",
    },
  });

  const [showPageAddressBook, setShowPageAddressBook] = useState(false);
  const [menuActive, setMenuactive] = useState(0);
  const [isShowStartup, setIsShoeStartup] = useState(false);
  const [showSetting, setShowSetting] = useState(false);
  const [showSettingMenu, setShowSettingMenu] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState("system");
  const [accountSubSection, setAccountSubSection] = useState(null);
  const [passwordData, setPasswordData] = useState({
    oldPassword: "",
    newPassword: "",
    confirmPassword: ""
  });
  const [changePasswordStep, setChangePasswordStep] = useState(1);
  const [changePasswordToken, setChangePasswordToken] = useState("");
  const [changePasswordLoading, setChangePasswordLoading] = useState(false);
  const [changePasswordMessage, setChangePasswordMessage] = useState("");
  const [logoutAllDevicesAfterPasswordChange, setLogoutAllDevicesAfterPasswordChange] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [accountSecurityState, setAccountSecurityState] = useState({
    loginAlerts: true,
    requireDeviceApproval: true,
    twoFactorAuthEnabled: false,
  });
  const [zaloLockState, setZaloLockState] = useState({
    enabled: false,
    method: "PIN",
    pin: "",
    biometricEnabled: false,
  });
  const [accountSecurityIssues, setAccountSecurityIssues] = useState([]);
  const [accountSecurityMessage, setAccountSecurityMessage] = useState("");
  const [accountSecurityLoading, setAccountSecurityLoading] = useState(false);
  const [qrState, setQrState] = useState({
    qrContent: "",
    qrCodeUrl: "",
    inviteLink: "",
    expiresAt: "",
    imageUrl: "",
  });
  const [emailFlow, setEmailFlow] = useState({
    newEmail: "",
    otp: "",
    changeToken: "",
  });
  const [phoneFlow, setPhoneFlow] = useState({
    newPhone: "",
    otp: "",
    changeToken: "",
    devOtpPreview: "",
  });

  const topMenu = [mess, addressbook, todo];
  const bottomMenu = [cloud, toolbox, setting];

  const handleShowSettingMenu = () => {
    setShowSettingMenu(!showSettingMenu);
  };

  const handleShowStartup = () => {
    isShowStartup ? setIsShoeStartup(false) : setIsShoeStartup(true);
  };

  const handleShowPageAddressBook = (value) => {
    setShowPageAddressBook(value);
  };

  const handleShowSetting = (value) => {
    setShowSetting(value);
  };

  const listComponent = [
    <Message 
      showPageAddressBook={showPageAddressBook} 
      onConversationSelect={onConversationSelect} 
    />,
    <AddressBook onClick={() => handleShowPageAddressBook(true)} />,
    <ToDo />,
    <Clod />,
    <ToolBox />,
    <NotificationsPanel />,
  ];

  const CurrentComponent = listComponent[menuActive];
  // Device management is handled by DeviceManager component
  const boxRef = useRef(null);
  const boxAvatar = useRef(null);
  const boxSettingRef = useRef(null);
  const settingIconRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        !boxAvatar.current?.contains(event.target) &&
        boxRef.current &&
        !boxRef.current.contains(event.target)
      ) {
        setIsShoeStartup(false);
      }
      if (
        settingIconRef.current &&
        !settingIconRef.current.contains(event.target) &&
        boxSettingRef.current &&
        !boxSettingRef.current.contains(event.target)
      ) {
        setShowSettingMenu(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [boxRef, setIsShoeStartup, boxSettingRef, setShowSettingMenu]);

  const mergeSettings = useCallback((incomingSettings = {}) => {
    setUserSettings((prev) => ({
      ...prev,
      ...incomingSettings,
      notifications: {
        ...prev.notifications,
        ...(incomingSettings.notifications || {}),
      },
      appearance: {
        ...prev.appearance,
        ...(incomingSettings.appearance || {}),
      },
    }));
  }, []);

  const loadUserSettings = useCallback(async () => {
    setSettingsLoading(true);
    setSettingsMessage("");
    try {
      const response = await getUserSettings();
      const payload = response?.data?.data ?? response?.data ?? {};
      mergeSettings(payload?.settings || {});
    } catch (error) {
      setSettingsMessage("Không thể tải cài đặt từ máy chủ.");
    } finally {
      setSettingsLoading(false);
    }
  }, [mergeSettings]);

  useEffect(() => {
    if (showSettingsModal) {
      void loadUserSettings();
    }
  }, [loadUserSettings, showSettingsModal]);

  const patchUserSettingsSection = useCallback(
    async (sectionKey, sectionValue) => {
      setSettingsMessage("");
      try {
        const response = await updateUserSettings({
          settings: {
            [sectionKey]: sectionValue,
          },
        });
        const payload = response?.data?.data ?? response?.data ?? {};
        mergeSettings(payload?.settings || {});
      } catch (error) {
        setSettingsMessage("Không thể cập nhật cài đặt. Vui lòng thử lại.");
      }
    },
    [mergeSettings],
  );

  const handleSystemToggle = useCallback(
    async (key) => {
      const nextValue = !Boolean(userSettings?.notifications?.[key]);
      const nextSection = {
        ...userSettings.notifications,
        [key]: nextValue,
      };
      mergeSettings({ notifications: nextSection });
      await patchUserSettingsSection("notifications", { [key]: nextValue });
    },
    [mergeSettings, patchUserSettingsSection, userSettings],
  );

  const handleThemeToggle = useCallback(async () => {
    const currentTheme = String(userSettings?.appearance?.theme || "SYSTEM").toUpperCase();
    const nextTheme = currentTheme === "DARK" ? "LIGHT" : "DARK";
    mergeSettings({
      appearance: {
        ...userSettings.appearance,
        theme: nextTheme,
      },
    });
    await patchUserSettingsSection("appearance", { theme: nextTheme });
  }, [mergeSettings, patchUserSettingsSection, userSettings]);

  const loadAccountSecurity = useCallback(async () => {
    setAccountSecurityLoading(true);
    setAccountSecurityMessage("");
    try {
      const [summaryResponse, zaloLockResponse] = await Promise.all([
        getAccountSecuritySummary(),
        getZaloLock(),
      ]);
      const summaryPayload = summaryResponse?.data?.data ?? summaryResponse?.data ?? {};
      const zaloLockPayload = zaloLockResponse?.data?.data ?? zaloLockResponse?.data ?? {};

      setAccountSecurityState((prev) => ({
        ...prev,
        ...(summaryPayload?.accountSecurity || {}),
      }));
      setAccountSecurityIssues(Array.isArray(summaryPayload?.issues) ? summaryPayload.issues : []);
      setZaloLockState((prev) => ({
        ...prev,
        ...(summaryPayload?.zaloLock || {}),
        ...(zaloLockPayload || {}),
        pin: "",
      }));
    } catch (error) {
      setAccountSecurityMessage("Không thể tải dữ liệu bảo mật tài khoản.");
    } finally {
      setAccountSecurityLoading(false);
    }
  }, []);

  const loadMyQr = useCallback(async () => {
    try {
      const response = await getMyQr();
      const payload = response?.data?.data ?? response?.data ?? {};
      let imageUrl = "";
      if (payload?.qrContent) {
        imageUrl = await QRCode.toDataURL(String(payload.qrContent), { width: 160, margin: 1 });
      }
      setQrState({
        qrContent: payload?.qrContent || "",
        qrCodeUrl: payload?.qrCodeUrl || "",
        inviteLink: payload?.inviteLink || "",
        expiresAt: payload?.expiresAt || "",
        imageUrl,
      });
    } catch (error) {
      setAccountSecurityMessage("Không thể tải QR của tôi.");
    }
  }, []);

  useEffect(() => {
    if (showSettingsModal && activeSettingsTab === "account") {
      void loadAccountSecurity();
      void loadMyQr();
    }
  }, [activeSettingsTab, loadAccountSecurity, loadMyQr, showSettingsModal]);

  const patchAccountSecurity = useCallback(async (key, nextValue) => {
    const previous = accountSecurityState;
    const nextState = { ...accountSecurityState, [key]: nextValue };
    setAccountSecurityState(nextState);
    setAccountSecurityMessage("");
    try {
      await updateUserSettings({
        settings: {
          accountSecurity: {
            [key]: nextValue,
          },
        },
      });
    } catch (error) {
      setAccountSecurityMessage("Không thể cập nhật tùy chọn bảo mật.");
      setAccountSecurityState(previous);
    }
  }, [accountSecurityState]);

  const handleSaveZaloLock = useCallback(async () => {
    setAccountSecurityMessage("");
    try {
      const payload =
        String(zaloLockState.method || "PIN").toUpperCase() === "PIN"
          ? {
              enabled: Boolean(zaloLockState.enabled),
              method: "PIN",
              pin: String(zaloLockState.pin || ""),
            }
          : {
              enabled: Boolean(zaloLockState.enabled),
              method: "BIOMETRIC",
              biometricEnabled: Boolean(zaloLockState.biometricEnabled),
            };
      await updateZaloLock(payload);
      setAccountSecurityMessage("Đã cập nhật Zalo Lock.");
      setZaloLockState((prev) => ({ ...prev, pin: "" }));
    } catch (error) {
      setAccountSecurityMessage("Không thể cập nhật Zalo Lock.");
    }
  }, [zaloLockState]);

  const handleEmailSendOtp = useCallback(async () => {
    try {
      setAccountSecurityMessage("");
      await sendEmailChangeOtp({ newEmail: String(emailFlow.newEmail || "").trim().toLowerCase() });
      setAccountSecurityMessage("Đã gửi OTP email.");
    } catch (error) {
      setAccountSecurityMessage(error?.response?.data?.message || "Không thể gửi OTP email.");
    }
  }, [emailFlow.newEmail]);

  const handleEmailVerifyOtp = useCallback(async () => {
    try {
      setAccountSecurityMessage("");
      const response = await verifyEmailChangeOtp({
        newEmail: String(emailFlow.newEmail || "").trim().toLowerCase(),
        otp: String(emailFlow.otp || "").trim(),
      });
      const payload = response?.data?.data ?? response?.data ?? {};
      setEmailFlow((prev) => ({ ...prev, changeToken: String(payload?.changeToken || payload || "") }));
      setAccountSecurityMessage("Xác thực OTP email thành công.");
    } catch (error) {
      setAccountSecurityMessage(error?.response?.data?.message || "OTP email không hợp lệ.");
    }
  }, [emailFlow.newEmail, emailFlow.otp]);

  const handleEmailConfirm = useCallback(async () => {
    try {
      setAccountSecurityMessage("");
      await confirmEmailChange({
        newEmail: String(emailFlow.newEmail || "").trim().toLowerCase(),
        changeToken: String(emailFlow.changeToken || "").trim(),
      });
      alert("Đổi email thành công. Vui lòng đăng nhập lại.");
      handleLogout();
    } catch (error) {
      setAccountSecurityMessage(error?.response?.data?.message || "Không thể xác nhận đổi email.");
    }
  }, [emailFlow.changeToken, emailFlow.newEmail, handleLogout]);

  const handlePhoneSendOtp = useCallback(async () => {
    try {
      setAccountSecurityMessage("");
      const response = await sendPhoneChangeOtp({ newPhone: String(phoneFlow.newPhone || "").trim() });
      const payload = response?.data?.data ?? response?.data ?? {};
      setPhoneFlow((prev) => ({ ...prev, devOtpPreview: String(payload?.devOtpPreview || "") }));
      setAccountSecurityMessage("Đã gửi OTP điện thoại.");
    } catch (error) {
      setAccountSecurityMessage(error?.response?.data?.message || "Không thể gửi OTP điện thoại.");
    }
  }, [phoneFlow.newPhone]);

  const handlePhoneVerifyOtp = useCallback(async () => {
    try {
      setAccountSecurityMessage("");
      const response = await verifyPhoneChangeOtp({
        newPhone: String(phoneFlow.newPhone || "").trim(),
        otp: String(phoneFlow.otp || "").trim(),
      });
      const payload = response?.data?.data ?? response?.data ?? {};
      setPhoneFlow((prev) => ({ ...prev, changeToken: String(payload?.changeToken || payload || "") }));
      setAccountSecurityMessage("Xác thực OTP điện thoại thành công.");
    } catch (error) {
      setAccountSecurityMessage(error?.response?.data?.message || "OTP điện thoại không hợp lệ.");
    }
  }, [phoneFlow.newPhone, phoneFlow.otp]);

  const handlePhoneConfirm = useCallback(async () => {
    try {
      setAccountSecurityMessage("");
      await confirmPhoneChange({
        newPhone: String(phoneFlow.newPhone || "").trim(),
        changeToken: String(phoneFlow.changeToken || "").trim(),
      });
      setAccountSecurityMessage("Đổi số điện thoại thành công.");
    } catch (error) {
      setAccountSecurityMessage(error?.response?.data?.message || "Không thể xác nhận đổi số điện thoại.");
    }
  }, [phoneFlow.changeToken, phoneFlow.newPhone]);

  const handleChangeMenuActive = (index) => {
    setMenuactive(index);
    setShowSettingMenu(false);
  };

  const openNotificationPanel = useCallback(() => {
    setMenuactive(5);
    window.history.replaceState(null, "", window.location.pathname || "/");
  }, []);

  const clearNotificationQuery = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("notification") === "1") {
      window.history.replaceState(null, "", window.location.pathname || "/");
    }
  }, []);

  const applyNotificationNavigation = useCallback(
    async (detail) => {
      const notification = detail?.notification || {};
      const kind = detail?.kind || "";
      if (kind === "conversation" && notification?.conversationId) {
        setMenuactive(0);
        const conversationId = String(notification.conversationId);
        let conversation = normalizedConversations.find(
          (item) => String(item.id) === conversationId,
        );
        if (!conversation && fetchConversation) {
          const fetched = await fetchConversation().catch(() => []);
          conversation = (fetched || []).find((item) => String(item.id) === conversationId);
        }
        if (conversation && openConversation) {
          openConversation(conversation);
        }
        return;
      }
      if (kind === "friends") {
        setMenuactive(1);
        return;
      }
      if (kind === "reminders") {
        setMenuactive(2);
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("reminder:navigate", {
              detail: { notification },
            }),
          );
        }
        return;
      }
      if (kind === "timeline" || kind === "notifications") {
        setMenuactive(5);
      }
    },
    [fetchConversation, normalizedConversations, openConversation],
  );

  useEffect(() => {
    const handleNotificationNavigate = (event) => {
      void applyNotificationNavigation(event.detail).finally(clearNotificationQuery);
    };
    window.addEventListener("notification:navigate", handleNotificationNavigate);

    const params = new URLSearchParams(window.location.search);
    if (params.get("notification") === "1") {
      void applyNotificationNavigation({
        kind: params.get("conversationId") ? "conversation" : "notifications",
        notification: Object.fromEntries(params.entries()),
      }).finally(clearNotificationQuery);
    }

    return () => {
      window.removeEventListener("notification:navigate", handleNotificationNavigate);
    };
  }, [applyNotificationNavigation, clearNotificationQuery]);

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordData(prevState => ({
      ...prevState,
      [name]: value
    }));
  };

  const resetChangePasswordFlow = useCallback(() => {
    setPasswordData({
      oldPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
    setChangePasswordStep(1);
    setChangePasswordToken("");
    setChangePasswordLoading(false);
    setChangePasswordMessage("");
    setLogoutAllDevicesAfterPasswordChange(false);
  }, []);

  const openChangePasswordFlow = () => {
    resetChangePasswordFlow();
    setAccountSubSection("changePassword");
  };

  const closeChangePasswordFlow = () => {
    resetChangePasswordFlow();
    setAccountSubSection(null);
  };

  const handleVerifyCurrentPassword = async () => {
    if (!passwordData.oldPassword.trim()) {
      setChangePasswordMessage("Vui lòng nhập mật khẩu hiện tại.");
      return;
    }

    setChangePasswordLoading(true);
    setChangePasswordMessage("");

    try {
      const response = await verifyCurrentPassword({
        currentPassword: passwordData.oldPassword,
      });
      const payload = response?.data?.data ?? response?.data ?? {};

      if (!payload?.changePasswordToken) {
        throw new Error("Không nhận được mã xác thực đổi mật khẩu.");
      }

      setChangePasswordToken(payload.changePasswordToken);
      setChangePasswordStep(2);
      setChangePasswordMessage("Xác thực thành công. Vui lòng nhập mật khẩu mới.");
    } catch (error) {
      setChangePasswordMessage("Mật khẩu hiện tại không đúng hoặc đã xảy ra lỗi.");
    } finally {
      setChangePasswordLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!passwordData.newPassword || !passwordData.confirmPassword) {
      setChangePasswordMessage("Vui lòng nhập đầy đủ thông tin.");
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setChangePasswordMessage("Mật khẩu mới phải có ít nhất 6 ký tự.");
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setChangePasswordMessage("Mật khẩu xác nhận không khớp.");
      return;
    }

    if (!changePasswordToken) {
      setChangePasswordMessage("Phiên xác thực đã hết hạn. Vui lòng xác thực lại.");
      setChangePasswordStep(1);
      return;
    }

    setChangePasswordLoading(true);
    setChangePasswordMessage("");

    try {
      await changePassword({
        changePasswordToken,
        newPassword: passwordData.newPassword,
      });
      if (logoutAllDevicesAfterPasswordChange) {
        try {
          const response = await getUserDevices();
          const payload = response?.data?.data ?? response?.data ?? [];
          const devices = Array.isArray(payload?.devices) ? payload.devices : Array.isArray(payload) ? payload : [];
          const currentDeviceId = String(localStorage.getItem("deviceId") || "");

          const sortedDevices = [
            ...devices.filter((device) => String(device?.deviceId || "") !== currentDeviceId),
            ...devices.filter((device) => String(device?.deviceId || "") === currentDeviceId),
          ];

          for (const device of sortedDevices) {
            const deviceId = String(device?.deviceId || "").trim();
            const platform = String(device?.platform || "WEB").toUpperCase();
            if (!deviceId) {
              continue;
            }
            try {
              await logoutDevice({ deviceId, platform });
            } catch {
              // Keep best-effort behavior to avoid blocking password change flow.
            }
          }
        } catch {
          // Keep best-effort behavior to avoid blocking password change flow.
        }
        alert("Đổi mật khẩu thành công. Bạn đã được đăng xuất khỏi tất cả thiết bị.");
        handleLogout();
        return;
      }

      alert("Đổi mật khẩu thành công.");
      closeChangePasswordFlow();
    } catch (error) {
      setChangePasswordMessage("Đổi mật khẩu thất bại. Vui lòng thử lại.");
    } finally {
      setChangePasswordLoading(false);
    }
  };

  return (
    <>
      <div className="flex">
        <div className="chat-menu-left ">
          <div className="chat-top-menu">
            <div className="chat-avatar-user">
              {userData.avatar ? (
                <img
                  ref={boxAvatar}
                  src={userData.avatar}
                  alt=""
                  onClick={handleShowStartup}
                  style={{ objectFit: "cover" }}
                />
              ) : (
                <div
                  ref={boxAvatar}
                  className="default-avatar-sidebar"
                  onClick={handleShowStartup}
                >
                  <FiUser className="default-avatar-icon-sidebar" />
                </div>
              )}
              {isShowStartup && (
                <div ref={boxRef} className="startup">
                  <p>{userData.displayName}</p>
                  <div>
                    <p onClick={() => {
                      handleShowSetting(true);
                      setIsShoeStartup(false);
                    }}>Hồ sơ của bạn</p>
                    <p>Cài đặt</p>
                  </div>
                  <p onClick={handleLogout}>Đăng xuất</p>
                </div>
              )}
            </div>
            <NotificationBell onViewAll={openNotificationPanel} />
            <div className="global-settings-wrap">
              <button
                className="global-settings-btn"
                type="button"
                onClick={() => setShowSettingsModal(true)}
                title="Cài đặt"
              >
                <FiSettings />
              </button>
            </div>
            <div>
              <ul>
                {topMenu.map((value, index) => (
                  <li
                    onClick={() => handleChangeMenuActive(index)}
                    className={`${
                      index === menuActive ? "chat-menu-left-active" : ""
                    }`}
                    key={index}
                  >
                    <img src={value} alt="" />
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="chat-bottom-menu">
            <div>
              <ul>
                {bottomMenu.map((value, index) => {
                  if (index === 2) {
                    return (
                      <li
                        key={index}
                        ref={settingIconRef}
                        onClick={() => handleShowSettingMenu()}
                        className={`chat-menu-item-setting ${
                          showSettingMenu ? "chat-menu-left-active" : ""
                        }`}
                      >
                        <img src={value} alt="" />
                        {showSettingMenu && (
                          <div ref={boxSettingRef} className="setting-menu">
                            <p onClick={() => {
                              handleShowSetting(true);
                              setShowSettingMenu(false);
                            }}>Thông tin cá nhân</p>
                            <p onClick={() => {
                              setShowSettingsModal(true);
                              setShowSettingMenu(false);
                            }}>Cài đặt</p>
                          </div>
                        )}
                      </li>
                    );
                  }
                  return (
                    <li
                      key={index}
                      onClick={() => handleChangeMenuActive(index + 3)}
                      className={`${
                        index + 3 === menuActive ? "chat-menu-left-active" : ""
                      }`}
                    >
                      <img src={value} alt="" />
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
        <div>{CurrentComponent}</div>
        <div>
          {showSetting && <Setting handleShowSetting={handleShowSetting} />}
        </div>
        {showSettingsModal && (
          <div className="settings-modal-overlay" onClick={() => setShowSettingsModal(false)}>
            <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
              <div className="settings-modal-header">
                <h3>Cài đặt</h3>
                <button className="close-btn" onClick={() => setShowSettingsModal(false)}>✕</button>
              </div>
              <div className="settings-modal-body">
                <div className="settings-sidebar">
                  <div 
                    className={`settings-tab ${activeSettingsTab === "system" ? "active" : ""}`}
                    onClick={() => { setActiveSettingsTab("system"); setAccountSubSection(null); }}
                  >
                    Hệ thống
                  </div>
                  <div 
                    className={`settings-tab ${activeSettingsTab === "account" ? "active" : ""}`}
                    onClick={() => { setActiveSettingsTab("account"); setAccountSubSection(null); }}
                  >
                    Tài khoản
                  </div>
                  <div
                    className={`settings-tab ${activeSettingsTab === "security" ? "active" : ""}`}
                    onClick={() => { setActiveSettingsTab("security"); setAccountSubSection(null); }}
                  >
                    Bảo mật
                  </div>
                  <div 
                    className={`settings-tab ${activeSettingsTab === "devices" ? "active" : ""}`}
                    onClick={() => { setActiveSettingsTab("devices"); setAccountSubSection(null); }}
                  >
                    Thiết bị
                  </div>
                </div>
                <div className="settings-modal-content">
                  {activeSettingsTab === "system" && (
                    <>
                      {settingsMessage ? (
                        <div className="settings-option" style={{ color: "#d93025" }}>
                          {settingsMessage}
                        </div>
                      ) : null}
                      <div className="settings-option">
                        <label>
                          <input
                            type="checkbox"
                            checked={Boolean(userSettings?.notifications?.pushEnabled)}
                            onChange={() => void handleSystemToggle("pushEnabled")}
                            disabled={settingsLoading}
                          />{" "}
                          Thông báo
                        </label>
                      </div>
                      <div className="settings-option">
                        <label>
                          <input
                            type="checkbox"
                            checked={Boolean(userSettings?.notifications?.soundEnabled)}
                            onChange={() => void handleSystemToggle("soundEnabled")}
                            disabled={settingsLoading}
                          />{" "}
                          Âm thanh
                        </label>
                      </div>
                      <div className="settings-option">
                        <label>
                          <input
                            type="checkbox"
                            checked={String(userSettings?.appearance?.theme || "").toUpperCase() === "DARK"}
                            onChange={() => void handleThemeToggle()}
                            disabled={settingsLoading}
                          />{" "}
                          Chế độ tối
                        </label>
                      </div>
                    </>
                  )}
                  {activeSettingsTab === "account" && (
                    <div className="settings-account-summary">
                      <div className="settings-profile-card">
                        {userData?.avatar ? (
                          <img src={userData.avatar} alt="" className="settings-profile-avatar" />
                        ) : (
                          <div className="settings-profile-avatar settings-profile-avatar-fallback">
                            <FiUser />
                          </div>
                        )}
                        <div>
                          <h4>{userData?.displayName || userData?.username || "Tài khoản"}</h4>
                          <p>{userData?.email || userData?.phone || "Thông tin tài khoản"}</p>
                        </div>
                      </div>
                      <div className="settings-option settings-card-action">
                        <strong>Bảo mật tài khoản</strong>
                        <span>Đổi mật khẩu, xác thực hai lớp, email, số điện thoại và thiết bị đăng nhập.</span>
                        <button type="button" onClick={() => setActiveSettingsTab("security")}>
                          Mở cài đặt bảo mật
                        </button>
                      </div>
                    </div>
                  )}
                  {activeSettingsTab === "security" && (
                    <>
                      {accountSecurityMessage ? (
                        <div className="settings-option" style={{ color: "#d93025" }}>
                          {accountSecurityMessage}
                        </div>
                      ) : null}
                      {accountSecurityIssues.length > 0 ? (
                        <div className="settings-option security-alert-list">
                          <strong>Cảnh báo bảo mật</strong>
                          {accountSecurityIssues.map((issue, index) => {
                            const text = formatSecurityIssue(issue);
                            return text ? (
                              <div className="security-alert-item" key={`${text}-${index}`}>
                                {text}
                              </div>
                            ) : null;
                          })}
                        </div>
                      ) : null}
                      {!accountSubSection && (
                        <>
                          <div className="settings-option">
                            <p className="change-password-link" onClick={openChangePasswordFlow}>
                              Đổi mật khẩu
                            </p>
                          </div>
                          <div className="settings-option">
                            <label>
                              <input
                                type="checkbox"
                                checked={Boolean(accountSecurityState.loginAlerts)}
                                onChange={() => void patchAccountSecurity("loginAlerts", !accountSecurityState.loginAlerts)}
                                disabled={accountSecurityLoading}
                              />{" "}
                              Cảnh báo đăng nhập
                            </label>
                          </div>
                          <div className="settings-option">
                            <label>
                              <input
                                type="checkbox"
                                checked={Boolean(accountSecurityState.requireDeviceApproval)}
                                onChange={() =>
                                  void patchAccountSecurity(
                                    "requireDeviceApproval",
                                    !accountSecurityState.requireDeviceApproval,
                                  )
                                }
                                disabled={accountSecurityLoading}
                              />{" "}
                              Yêu cầu phê duyệt thiết bị
                            </label>
                          </div>
                          <div className="settings-option">
                            <label>
                              <input
                                type="checkbox"
                                checked={Boolean(accountSecurityState.twoFactorAuthEnabled)}
                                onChange={() =>
                                  void patchAccountSecurity(
                                    "twoFactorAuthEnabled",
                                    !accountSecurityState.twoFactorAuthEnabled,
                                  )
                                }
                                disabled={accountSecurityLoading}
                              />{" "}
                              Xác thực hai lớp
                            </label>
                          </div>
                          <div className="settings-option">
                            <h4>Zalo Lock</h4>
                            <label>
                              <input
                                type="checkbox"
                                checked={Boolean(zaloLockState.enabled)}
                                onChange={(event) =>
                                  setZaloLockState((prev) => ({ ...prev, enabled: event.target.checked }))
                                }
                              />{" "}
                              Bật khóa ứng dụng
                            </label>
                            <div style={{ marginTop: 8 }}>
                              <select
                                value={zaloLockState.method}
                                onChange={(event) =>
                                  setZaloLockState((prev) => ({
                                    ...prev,
                                    method: String(event.target.value || "PIN").toUpperCase(),
                                  }))
                                }
                              >
                                <option value="PIN">PIN</option>
                                <option value="BIOMETRIC">BIOMETRIC</option>
                              </select>
                            </div>
                            {String(zaloLockState.method || "").toUpperCase() === "PIN" ? (
                              <div style={{ marginTop: 8 }}>
                                <input
                                  type="password"
                                  placeholder="Nhập PIN"
                                  value={zaloLockState.pin}
                                  onChange={(event) =>
                                    setZaloLockState((prev) => ({ ...prev, pin: event.target.value }))
                                  }
                                />
                              </div>
                            ) : (
                              <div style={{ marginTop: 8 }}>
                                <label>
                                  <input
                                    type="checkbox"
                                    checked={Boolean(zaloLockState.biometricEnabled)}
                                    onChange={(event) =>
                                      setZaloLockState((prev) => ({
                                        ...prev,
                                        biometricEnabled: event.target.checked,
                                      }))
                                    }
                                  />{" "}
                                  Bật sinh trắc học
                                </label>
                              </div>
                            )}
                            <button style={{ marginTop: 8 }} onClick={() => void handleSaveZaloLock()}>
                              Lưu Zalo Lock
                            </button>
                          </div>
                          <div className="settings-option">
                            <h4>QR của tôi</h4>
                            {qrState.imageUrl ? <img src={qrState.imageUrl} alt="My QR" /> : null}
                            {qrState.inviteLink ? (
                              <p>
                                <a href={qrState.inviteLink} target="_blank" rel="noreferrer">
                                  {qrState.inviteLink}
                                </a>
                              </p>
                            ) : null}
                            {qrState.expiresAt ? <p>Hết hạn: {qrState.expiresAt}</p> : null}
                            <button onClick={() => void loadMyQr()}>Làm mới QR</button>
                          </div>
                          <div className="settings-option">
                            <h4>Đổi email</h4>
                            <input
                              type="email"
                              placeholder="Email mới"
                              value={emailFlow.newEmail}
                              onChange={(event) =>
                                setEmailFlow((prev) => ({ ...prev, newEmail: event.target.value }))
                              }
                            />
                            <input
                              type="text"
                              placeholder="OTP email"
                              value={emailFlow.otp}
                              onChange={(event) =>
                                setEmailFlow((prev) => ({ ...prev, otp: event.target.value }))
                              }
                            />
                            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                              <button onClick={() => void handleEmailSendOtp()}>Gửi OTP</button>
                              <button onClick={() => void handleEmailVerifyOtp()}>Xác thực OTP</button>
                              <button onClick={() => void handleEmailConfirm()} disabled={!emailFlow.changeToken}>
                                Xác nhận đổi email
                              </button>
                            </div>
                          </div>
                          <div className="settings-option">
                            <h4>Đổi số điện thoại</h4>
                            <input
                              type="text"
                              placeholder="Số điện thoại mới"
                              value={phoneFlow.newPhone}
                              onChange={(event) =>
                                setPhoneFlow((prev) => ({ ...prev, newPhone: event.target.value }))
                              }
                            />
                            <input
                              type="text"
                              placeholder="OTP điện thoại"
                              value={phoneFlow.otp}
                              onChange={(event) =>
                                setPhoneFlow((prev) => ({ ...prev, otp: event.target.value }))
                              }
                            />
                            {phoneFlow.devOtpPreview ? <p>OTP test: {phoneFlow.devOtpPreview}</p> : null}
                            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                              <button onClick={() => void handlePhoneSendOtp()}>Gửi OTP</button>
                              <button onClick={() => void handlePhoneVerifyOtp()}>Xác thực OTP</button>
                              <button onClick={() => void handlePhoneConfirm()} disabled={!phoneFlow.changeToken}>
                                Xác nhận đổi số
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                      {accountSubSection === "changePassword" && (
                        <div className="account-subsection">
                          <button className="btn-back" onClick={closeChangePasswordFlow}>
                            ← Quay lại
                          </button>
                          <h4>Đổi mật khẩu</h4>

                          <p className="change-password-intro">
                            {changePasswordStep === 1
                              ? "Xác nhận mật khẩu hiện tại để tiếp tục."
                              : "Đặt mật khẩu mới để tăng cường bảo mật."}
                          </p>

                          <div className="change-password-steps">
                            <div className="change-password-step-item">
                              <span
                                className={`change-password-step-dot ${
                                  changePasswordStep === 1 ? "active" : ""
                                }`}
                              >
                                1
                              </span>
                              <span
                                className={`change-password-step-label ${
                                  changePasswordStep === 1 ? "active" : ""
                                }`}
                              >
                                Xác thực
                              </span>
                            </div>
                            <div className="change-password-step-line" />
                            <div className="change-password-step-item">
                              <span
                                className={`change-password-step-dot ${
                                  changePasswordStep === 2 ? "active" : ""
                                }`}
                              >
                                2
                              </span>
                              <span
                                className={`change-password-step-label ${
                                  changePasswordStep === 2 ? "active" : ""
                                }`}
                              >
                                Mật khẩu mới
                              </span>
                            </div>
                          </div>

                          {changePasswordStep === 1 ? (
                            <div className="form-group">
                              <label>Mật khẩu hiện tại</label>
                              <input
                                type="password"
                                name="oldPassword"
                                value={passwordData.oldPassword}
                                onChange={handlePasswordChange}
                                placeholder="Nhập mật khẩu hiện tại"
                              />
                            </div>
                          ) : (
                            <>
                              <div className="form-group">
                                <label>Mật khẩu mới</label>
                                <input
                                  type="password"
                                  name="newPassword"
                                  value={passwordData.newPassword}
                                  onChange={handlePasswordChange}
                                  placeholder="Nhập mật khẩu mới"
                                />
                              </div>
                              <div className="form-group">
                                <label>Xác nhận mật khẩu mới</label>
                                <input
                                  type="password"
                                  name="confirmPassword"
                                  value={passwordData.confirmPassword}
                                  onChange={handlePasswordChange}
                                  placeholder="Nhập lại mật khẩu mới"
                                />
                              </div>
                              <div className="form-group">
                                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <input
                                    type="checkbox"
                                    checked={logoutAllDevicesAfterPasswordChange}
                                    onChange={(event) =>
                                      setLogoutAllDevicesAfterPasswordChange(event.target.checked)
                                    }
                                  />
                                  Đăng xuất khỏi tất cả thiết bị sau khi đổi mật khẩu
                                </label>
                              </div>
                            </>
                          )}

                          {changePasswordMessage ? (
                            <div
                              className={`change-password-message ${
                                changePasswordStep === 2 &&
                                !changePasswordLoading &&
                                changePasswordMessage.includes("thành công")
                                  ? "success"
                                  : "error"
                              }`}
                            >
                              {changePasswordMessage}
                            </div>
                          ) : null}

                          <div className="subsection-footer">
                            <button className="btn-cancel" onClick={closeChangePasswordFlow}>
                              Hủy
                            </button>
                            {changePasswordStep === 1 ? (
                              <button
                                className="btn-confirm"
                                onClick={handleVerifyCurrentPassword}
                                disabled={changePasswordLoading}
                              >
                                {changePasswordLoading ? "Đang xác thực..." : "Xác thực"}
                              </button>
                            ) : (
                              <button
                                className="btn-confirm"
                                onClick={handleChangePassword}
                                disabled={changePasswordLoading}
                              >
                                {changePasswordLoading ? "Đang cập nhật..." : "Đổi mật khẩu"}
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  {activeSettingsTab === "devices" && (
                    <DeviceManager handleLogout={handleLogout} />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default memo(Chat);







