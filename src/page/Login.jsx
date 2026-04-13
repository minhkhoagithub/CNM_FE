import React, { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import FingerprintJS from "@fingerprintjs/fingerprintjs";
import QRCode from "qrcode";
import { IoIosPhonePortrait } from "react-icons/io";
import { CiLock } from "react-icons/ci";
import { UAParser } from "ua-parser-js";
import { UserContext } from "../Context/UserContext";
import "../resource/style/Login/login.css";
import {
  checkDeviceLoginStatus,
  createDeviceLoginRequest,
  getCurrentUser,
  userLogin,
} from "../util/api";

const getWebDeviceInfo = async () => {
  try {
    const fp = await FingerprintJS.load();
    const result = await fp.get();
    const parser = new UAParser();
    const ua = parser.getResult();

    const osName = ua.os.name || "Unknown";
    const osVersion = ua.os.version || "";
    const browserName = ua.browser.name || "Unknown";
    const osFullName = osVersion ? `${osName} ${osVersion}` : osName;
    const deviceName = `${browserName} on ${osFullName}`;
    const deviceId = result.visitorId;

    localStorage.setItem("deviceId", deviceId);

    return {
      deviceId,
      deviceName,
      platform: "WEB",
    };
  } catch (error) {
    console.error("Error getting device info:", error);

    const fallbackDeviceId =
      localStorage.getItem("deviceId") || `WEB_${Date.now()}`;

    localStorage.setItem("deviceId", fallbackDeviceId);

    return {
      deviceId: fallbackDeviceId,
      deviceName: "Zalo Web",
      platform: "WEB",
    };
  }
};

export default function Login({ handleChangeStateChat }) {
  const [activeQr, setActiveQr] = useState(true);

  return (
    <div className="login-container mt-2">
      <div className="login-title-container">
        <div>
          <h2 className="textcenter">Zalo</h2>
        </div>
        <div>
          <p className="textcenter">Đăng nhập tài khoản Zalo</p>
        </div>
      </div>

      <div className="login-form-login">
        <div className="login-header-login ">
          <div className="login-header-login-wrap flex">
            <p
              className={`${activeQr ? "login-header-login-active" : ""}`}
              onClick={() => setActiveQr(true)}
            >
              với mã qr
            </p>
            <p
              className={`${activeQr ? "" : "login-header-login-active"}`}
              onClick={() => setActiveQr(false)}
            >
              với số điện thoại
            </p>
            <hr className="login-hr-header-login" />
            <hr
              className={`login-hr-bottom-header ${
                activeQr ? "" : "login-hr-bottom-header-active"
              }`}
            />
          </div>
        </div>

        {activeQr ? (
          <LoginQr />
        ) : (
          <LoginAccount handleChangeStateChat={handleChangeStateChat} />
        )}
      </div>
    </div>
  );
}

function LoginQr() {
  const { setUserData } = useContext(UserContext);
  const navigate = useNavigate();
  const [qrImage, setQrImage] = useState("");
  const [approvalId, setApprovalId] = useState("");
  const [statusMessage, setStatusMessage] = useState("Đang tạo mã QR...");
  const [errorMessage, setErrorMessage] = useState("");
  const [reloadSeed, setReloadSeed] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const initQrLogin = async () => {
      try {
        setErrorMessage("");
        setStatusMessage("Đang tạo mã QR...");
        setQrImage("");
        setApprovalId("");

        const deviceInfo = await getWebDeviceInfo();
        const response = await createDeviceLoginRequest(deviceInfo);
        const payload = response.data?.data;

        if (!payload?.approvalId || !payload?.qrContent) {
          throw new Error("Không nhận được dữ liệu QR hợp lệ từ hệ thống.");
        }

        const qrDataUrl = await QRCode.toDataURL(payload.qrContent, {
          width: 200,
          margin: 1,
        });

        if (!isMounted) {
          return;
        }

        setQrImage(qrDataUrl);
        setApprovalId(payload.approvalId);
        setStatusMessage("Dùng ứng dụng Zalo trên điện thoại để quét mã này.");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setErrorMessage(
          error.response?.data?.message ||
            error.message ||
            "Không thể tạo mã QR đăng nhập.",
        );
        setStatusMessage("Không thể tạo mã QR.");
      }
    };

    void initQrLogin();

    return () => {
      isMounted = false;
    };
  }, [reloadSeed]);

  useEffect(() => {
    if (!approvalId) {
      return undefined;
    }

    let isMounted = true;

    const pollStatus = async () => {
      try {
        const response = await checkDeviceLoginStatus(approvalId);
        const payload = response.data?.data;
        const status = payload?.status;

        if (!isMounted || !status) {
          return;
        }

        if (status === "PENDING") {
          setStatusMessage("Đã tạo mã QR. Chờ điện thoại xác nhận đăng nhập.");
          return;
        }

        if (status === "REJECTED") {
          setErrorMessage("Yêu cầu đăng nhập đã bị từ chối trên điện thoại.");
          setStatusMessage("Hãy tạo mã QR mới để thử lại.");
          return;
        }

        if (status === "EXPIRED") {
          setErrorMessage("Mã QR đã hết hạn.");
          setStatusMessage("Hãy tạo mã QR mới để tiếp tục.");
          return;
        }

        if (status === "COMPLETED") {
          setStatusMessage("Đăng nhập thành công. Đang chuyển vào Zalo Web...");

          const currentUserResponse = await getCurrentUser();
          const currentUser = currentUserResponse?.data || currentUserResponse;

          localStorage.setItem("isLogin", "true");
          localStorage.setItem("userProfile", JSON.stringify(currentUser || {}));
          setUserData(currentUser);
          navigate("/");
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setErrorMessage(
          error.response?.data?.message ||
            error.message ||
            "Không thể kiểm tra trạng thái đăng nhập.",
        );
      }
    };

    void pollStatus();
    const intervalId = window.setInterval(() => {
      void pollStatus();
    }, 2000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [approvalId, navigate, setUserData]);

  return (
    <div className="login-login-qr">
      <div className="login-wrap-qr">
        <div className="login-img-qr">
          {qrImage ? (
            <img src={qrImage} alt="Mã QR đăng nhập Zalo Web" />
          ) : (
            <div
              style={{
                width: 200,
                height: 200,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#f5f7fb",
                color: "#666",
                marginBottom: 10,
              }}
            >
              Đang tạo mã...
            </div>
          )}
          <p className="login-blue">Chỉ dùng để đăng nhập</p>
          <p>Zalo trên máy tính</p>
        </div>
      </div>
      <div className="login-introduce-footer">
        <p>{statusMessage}</p>
        {errorMessage ? (
          <div style={{ textAlign: "center", marginTop: 10 }}>
            <p style={{ color: "#d93025", fontWeight: 600 }}>{errorMessage}</p>
            <button
              type="button"
              className="btn-login"
              style={{ width: 220, margin: "10px auto 0" }}
              onClick={() => setReloadSeed((current) => current + 1)}
            >
              Tạo mã QR mới
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function LoginAccount({ handleChangeStateChat }) {
  const { setUserData } = useContext(UserContext);
  const navigate = useNavigate();
  const [value, setValue] = useState({
    username: "",
    password: "",
    deviceId: "",
    deviceName: "",
    platform: "WEB",
  });
  const [stateLogin, setStateLogin] = useState("");
  const [disableBtn, setDisableBtn] = useState(true);
  const [pendingApprovalId, setPendingApprovalId] = useState("");

  useEffect(() => {
    const initializeDeviceInfo = async () => {
      const deviceInfo = await getWebDeviceInfo();
      setValue((prev) => ({
        ...prev,
        ...deviceInfo,
      }));
    };

    void initializeDeviceInfo();
  }, []);

  useEffect(() => {
    setDisableBtn(!(value.username.length >= 4 && value.password.length >= 4));
  }, [value]);

  useEffect(() => {
    if (!pendingApprovalId) {
      return undefined;
    }

    let active = true;

    const pollApprovalStatus = async () => {
      try {
        const response = await checkDeviceLoginStatus(pendingApprovalId);
        const payload = response.data?.data;
        const status = payload?.status;

        if (!active || !status) {
          return;
        }

        if (status === "PENDING") {
          setStateLogin("Đã gửi yêu cầu phê duyệt tới thiết bị cũ.");
          return;
        }

        if (status === "REJECTED") {
          setPendingApprovalId("");
          setStateLogin("Thiết bị cũ đã từ chối yêu cầu đăng nhập.");
          return;
        }

        if (status === "EXPIRED") {
          setPendingApprovalId("");
          setStateLogin("Yêu cầu phê duyệt đã hết hạn. Hãy đăng nhập lại.");
          return;
        }

        if (status === "COMPLETED") {
          const currentUserResponse = await getCurrentUser();
          const currentUser = currentUserResponse?.data || currentUserResponse;

          localStorage.setItem("isLogin", "true");
          localStorage.setItem("userProfile", JSON.stringify(currentUser || {}));
          setUserData(currentUser);
          setStateLogin("");
          setPendingApprovalId("");
          navigate("/");
        }
      } catch (error) {
        if (!active) {
          return;
        }

        setPendingApprovalId("");
        setStateLogin(
          error.response?.data?.message ||
            error.message ||
            "Không thể kiểm tra trạng thái phê duyệt.",
        );
      }
    };

    void pollApprovalStatus();
    const intervalId = window.setInterval(() => {
      void pollApprovalStatus();
    }, 2000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [navigate, pendingApprovalId, setUserData]);

  const handleChangeData = (event) => {
    setValue({ ...value, [event.target.name]: event.target.value });
  };

  const handleLoginAccount = async () => {
    try {
      const response = await userLogin({
        username: value.username,
        password: value.password,
        deviceId: value.deviceId,
        platform: value.platform || "WEB",
        deviceName: value.deviceName,
      });

      const payload = response?.data?.data;

      if (payload?.status === "PENDING_APPROVAL" && payload?.approvalId) {
        setPendingApprovalId(payload.approvalId);
        setStateLogin("Đang chờ thiết bị cũ phê duyệt đăng nhập.");
        return;
      }

      if (response.status === 200) {
        localStorage.setItem("isLogin", "true");
        localStorage.setItem("userProfile", JSON.stringify(payload || {}));

        setUserData(payload);
        setStateLogin("");
        navigate("/");
      }
    } catch (error) {
      const errorMessage =
        error.response?.data?.message ||
        error.response?.data?.error ||
        "Tài khoản hoặc mật khẩu không đúng";

      setStateLogin(errorMessage);
    }
  };

  const handleButtonLogin = (event) => {
    if (!disableBtn && (event.code === "Enter" || event.code === "NumpadEnter")) {
      void handleLoginAccount();
    }
  };

  return (
    <div className="login-login-account">
      <div className="login-form-login-account">
        <div className="login-form-login-wrap">
          <div className="flex">
            <IoIosPhonePortrait className="icon-login" />
            <input
              type="text"
              placeholder="Số điện thoại hoặc email"
              name="username"
              value={value.username}
              onChange={handleChangeData}
              onKeyDown={handleButtonLogin}
            />
          </div>
          <div className="flex">
            <CiLock className="icon-login" />
            <input
              type="password"
              placeholder="Mật khẩu"
              value={value.password}
              name="password"
              onChange={handleChangeData}
              onKeyDown={handleButtonLogin}
            />
          </div>
        </div>
        {stateLogin && <div className="state-login">{stateLogin}</div>}
        <div
          className={`login-container-btn ${
            disableBtn ? "login-disable" : ""
          }`}
        >
          <div className="login-btn-login">
            <button onClick={handleLoginAccount}>Đăng nhập với mật khẩu</button>
          </div>
          <div className="login-btn-login-phone">
            <button>Đăng nhập bằng thiết bị di động</button>
            <div
              className={`login-introduce-login ${
                disableBtn ? "" : "login-introduce-login-active"
              }`}
            >
              <svg height="10" width="100">
                <polygon points="50,0 100,100 0,100" fill="#0190f3" />
              </svg>
              <p>Đăng nhập không dùng mật khẩu</p>
            </div>
          </div>
        </div>
      </div>

      <div
        className="login-forgot-pass"
        onClick={() => navigate("/auth/forgot-password")}
        style={{ cursor: "pointer" }}
      >
        <p>Quên mật khẩu?</p>
      </div>

      <div style={{ textAlign: "center", marginTop: 10 }}>
        <span>Bạn chưa có tài khoản? </span>
        <span
          style={{ color: "#0190f3", cursor: "pointer", fontWeight: 600 }}
          onClick={() => navigate("/auth/register")}
        >
          Đăng ký ngay
        </span>
      </div>
    </div>
  );
}
