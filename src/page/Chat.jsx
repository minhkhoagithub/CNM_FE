import React, { useState, useEffect, useContext, memo, useRef, useCallback } from "react";
import { UserContext } from "../Context/UserContext";
import { FiUser } from "react-icons/fi";
import "../resource/style/Chat/chat.css";
import Message from "../component/Message/Message";
import AddressBook from "../component/AddressBook/AddressBook";
import ToDo from "../component/ToDo/ToDo";
import Clod from "../component/Cloud/Cloud";
import ToolBox from "../component/ToolBox/ToolBox";
import Setting from "../component/Setting/Setting";
import DeviceManager from "../component/Setting/DeviceManager";
import { changePassword, verifyCurrentPassword } from "../util/api";
import mess from "../resource/svg/chat/chat.svg";
import addressbook from "../resource/svg/chat/addressbook.svg";
import todo from "../resource/svg/chat/todo.svg";
import cloud from "../resource/svg/chat/cloud.svg";
import toolbox from "../resource/svg/chat/toolbox.svg";
import setting from "../resource/svg/chat/setting.svg";
function Chat({ handleLogout, onConversationSelect }) {
  const { userData } = useContext(UserContext);

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

  const handleChangeMenuActive = (index) => {
    if (index === 0 || index === 1) {
      setMenuactive(index);
    } else if (index === 5) {
      handleShowSettingMenu();
    }
  };

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
                    className={`settings-tab ${activeSettingsTab === "devices" ? "active" : ""}`}
                    onClick={() => { setActiveSettingsTab("devices"); setAccountSubSection(null); }}
                  >
                    Thiết bị
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
                            <p className="change-password-link" onClick={openChangePasswordFlow}>
                              Đổi mật khẩu
                            </p>
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

