import React, { useState, useEffect, useContext, memo, useRef, useCallback } from "react";
import { UserContext } from "../Context/UserContext";
import { FiUser } from "react-icons/fi";
import { MdDelete, MdRefresh } from "react-icons/md";
import axios from "axios";
import "../resource/style/Chat/chat.css";
import Message from "../component/Message/Message";
import AddressBook from "../component/AddressBook/AddressBook";
import ToDo from "../component/ToDo/ToDo";
import Clod from "../component/Cloud/Cloud";
import ToolBox from "../component/ToolBox/ToolBox";
import Setting from "../component/Setting/Setting";
import mess from "../resource/svg/chat/chat.svg";
import addressbook from "../resource/svg/chat/addressbook.svg";
import todo from "../resource/svg/chat/todo.svg";
import cloud from "../resource/svg/chat/cloud.svg";
import toolbox from "../resource/svg/chat/toolbox.svg";
import setting from "../resource/svg/chat/setting.svg";

function Chat({ handleLogout }) {
  const { userData } = useContext(UserContext);

  const [showPageAddressBook, setShowPageAddressBook] = useState(false);
  const topMenu = [mess, addressbook, todo];
  const bottomMenu = [cloud, toolbox, setting];
  const [menuActive, setMenuactive] = useState(0);
  const listComponent = [
    <Message showPageAddressBook={showPageAddressBook} />,
    <AddressBook onClick={() => handleShowPageAddressBook(true)} />,
    <ToDo />,
    <Clod />,
    <ToolBox />,
  ];
  const CurrentComponent = listComponent[menuActive];
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
  const [loginLocations, setLoginLocations] = useState([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [logoutingDeviceId, setLogoutingDeviceId] = useState(null);
  const [deviceError, setDeviceError] = useState(null);
  const boxRef = useRef(null);
  const boxAvatar = useRef(null);
  const boxSettingRef = useRef(null);
  const settingIconRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        !boxAvatar.current.contains(event.target) &&
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

  // Fetch devices from backend
  const fetchDevices = useCallback(async () => {
    try {
      setLoadingDevices(true);
      setDeviceError(null);
      const response = await axios.get("http://localhost:8080/api/v1/auth/devices", {
        withCredentials: true,
      });

      if (response.data.data) {
        // Format data từ backend
        const formattedLocations = response.data.data.map((device) => ({
          id: device.id,
          deviceId: device.deviceId,
          device: device.deviceName,
          platform: device.platform,
          time: formatRelativeTime(device.lastSeenAt),
          lastSeenAt: device.lastSeenAt,
        }));
        setLoginLocations(formattedLocations);
      }
    } catch (error) {
      console.error("Error fetching devices:", error);
      setDeviceError("Không thể tải danh sách thiết bị. Vui lòng thử lại.");
    } finally {
      setLoadingDevices(false);
    }
  }, []);

  // Get device icon based on platform
  const getDeviceIcon = (platform) => {
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

  // Format relative time (vd: "Hôm nay lúc 10:30", "Hôm qua lúc 15:45", "2 ngày trước")
  const formatRelativeTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMs = now - date;
    const diffInHours = diffInMs / (1000 * 60 * 60);
    const diffInDays = diffInHours / 24;

    if (diffInDays < 1) {
      // Hôm nay
      return `Hôm nay lúc ${date.toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    } else if (diffInDays < 2) {
      // Hôm qua
      return `Hôm qua lúc ${date.toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    } else {
      // Các ngày trước
      const days = Math.floor(diffInDays);
      return `${days} ngày trước`;
    }
  };

  // Fetch devices when accountSubSection changes to loginLocations
  useEffect(() => {
    if (accountSubSection === "loginLocations") {
      fetchDevices();
    }
  }, [accountSubSection, fetchDevices]);

  const handleLogoutDevice = async (deviceId, platform, deviceName) => {
    if (!window.confirm(`Bạn có chắc chắn muốn đăng xuất khỏi "${deviceName}" không?`)) {
      return;
    }

    try {
      setLogoutingDeviceId(deviceId);
      setDeviceError(null);
      
      await axios.post(
        "http://localhost:8080/api/v1/auth/logout-device",
        {
          deviceId: deviceId,
          platform: platform,
        },
        {
          withCredentials: true,
        }
      );

      // Check if this is the current device
      const currentDeviceId = localStorage.getItem("deviceId");
      if (currentDeviceId === deviceId) {
        // This is the current device - call the logout handler
        console.log("Đăng xuất device hiện tại");
        handleLogout();
      } else {
        // This is another device - just refresh the list
        console.log(`Đã đăng xuất khỏi thiết bị: ${deviceName}`);
        await fetchDevices();
      }
    } catch (error) {
      console.error("Error logging out device:", error);
      setDeviceError(error.response?.data?.message || "Lỗi khi đăng xuất khỏi thiết bị. Vui lòng thử lại.");
    } finally {
      setLogoutingDeviceId(null);
    }
  };

  const handleChangeMenuActive = (index) => {
    if (index == 0 || index == 1) {
      setMenuactive(index);
    } else if (index == 5) {
      handleShowSettingMenu();
    }
  };
  const handleShowSetting = (value) => {
    setShowSetting(value);
  };

  const handleShowSettingMenu = () => {
    setShowSettingMenu(!showSettingMenu);
  };

  const handleShowStartup = () => {
    isShowStartup ? setIsShoeStartup(false) : setIsShoeStartup(true);
  };
  const handleShowPageAddressBook = (value) => {
    setShowPageAddressBook(value);
  };

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordData(prevState => ({
      ...prevState,
      [name]: value
    }));
  };

  const handleChangePassword = () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      alert("Mật khẩu xác nhận không khớp!");
      return;
    }
    if (passwordData.newPassword.length < 6) {
      alert("Mật khẩu mới phải có ít nhất 6 ký tự!");
      return;
    }
    // TODO: Call API to change password
    alert("Đổi mật khẩu thành công!");
    setPasswordData({
      oldPassword: "",
      newPassword: "",
      confirmPassword: ""
    });
    setAccountSubSection(null);
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
                  <p>{userData.username}</p>
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
                    onClick={() => setActiveSettingsTab("system")}
                  >
                    Hệ thống
                  </div>
                  <div 
                    className={`settings-tab ${activeSettingsTab === "account" ? "active" : ""}`}
                    onClick={() => setActiveSettingsTab("account")}
                  >
                    Tài khoản
                  </div>
                </div>
                <div className="settings-modal-content">
                  {activeSettingsTab === "system" && (
                    <>
                      <div className="settings-option">
                        <label>
                          <input type="checkbox" /> Thông báo
                        </label>
                      </div>
                      <div className="settings-option">
                        <label>
                          <input type="checkbox" /> Âm thanh
                        </label>
                      </div>
                      <div className="settings-option">
                        <label>
                          <input type="checkbox" /> Chế độ tối
                        </label>
                      </div>
                    </>
                  )}
                  {activeSettingsTab === "account" && (
                    <>
                      {!accountSubSection && (
                        <>
                          <div className="settings-option">
                            <p className="change-password-link" onClick={() => setAccountSubSection("changePassword")}>Đổi mật khẩu</p>
                          </div>
                          <div className="settings-option">
                            <p className="view-login-locations-link" onClick={() => setAccountSubSection("loginLocations")}>Xem nơi đã đăng nhập</p>
                          </div>
                        </>
                      )}
                      {accountSubSection === "changePassword" && (
                        <div className="account-subsection">
                          <button className="btn-back" onClick={() => setAccountSubSection(null)}>← Quay lại</button>
                          <h4>Đổi mật khẩu</h4>
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
                              placeholder="Xác nhận mật khẩu mới"
                            />
                          </div>
                          <div className="subsection-footer">
                            <button className="btn-cancel" onClick={() => setAccountSubSection(null)}>Hủy</button>
                            <button className="btn-confirm" onClick={handleChangePassword}>Đổi mật khẩu</button>
                          </div>
                        </div>
                      )}
                      {accountSubSection === "loginLocations" && (
                        <div className="account-subsection">
                          <button className="btn-back" onClick={() => setAccountSubSection(null)}>← Quay lại</button>
                          <h4>Nơi đã đăng nhập</h4>
                          
                          {deviceError && (
                            <div className="device-error-message">
                              {deviceError}
                            </div>
                          )}
                          
                          <div className="devices-refresh-btn">
                            <button
                              onClick={fetchDevices}
                              disabled={loadingDevices}
                              title="Làm mới danh sách"
                              className="btn-refresh"
                            >
                              <MdRefresh size={16} />
                              {loadingDevices ? "Đang tải..." : "Làm mới"}
                            </button>
                          </div>

                          <div className="login-locations-list">
                            {loadingDevices && loginLocations.length === 0 ? (
                              <p style={{ textAlign: "center", padding: "20px", color: "#999" }}>Đang tải...</p>
                            ) : loginLocations.length === 0 ? (
                              <p style={{ textAlign: "center", padding: "20px", color: "#999" }}>Không có thiết bị nào</p>
                            ) : (
                              loginLocations.map((location) => (
                                <div key={location.id} className="login-location-item">
                                  <div className="device-icon-container">
                                    {getDeviceIcon(location.platform)}
                                  </div>
                                  <div className="location-info">
                                    <p className="device-name">{location.device}</p>
                                    <p className="device-platform">{location.platform}</p>
                                    <p className="login-time">{location.time}</p>
                                  </div>
                                  <button
                                    className="btn-logout-device"
                                    onClick={() => handleLogoutDevice(location.deviceId, location.platform, location.device)}
                                    disabled={logoutingDeviceId === location.deviceId}
                                    title="Đăng xuất thiết bị này"
                                  >
                                    {logoutingDeviceId === location.deviceId ? (
                                      <span>Đang xử lý...</span>
                                    ) : (
                                      <>
                                        <MdDelete size={16} />
                                        Đăng xuất
                                      </>
                                    )}
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </>
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
