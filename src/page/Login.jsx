import React, { useCallback, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import FingerprintJS from "@fingerprintjs/fingerprintjs";
import QRCode from "qrcode";
import { IoIosPhonePortrait } from "react-icons/io";
import { CiLock } from "react-icons/ci";
import { UAParser } from "ua-parser-js";
import { UserContext } from "../Context/UserContext";
import "../resource/style/Login/login.css";
import {
  checkEmailExists,
  checkDeviceLoginStatus,
  createDeviceLoginRequest,
  getCurrentUser,
  sendRegisterOtp,
  userLogin,
  userRegisterWithOtp,
  verifyRegisterOtp,
} from "../util/api";

const extractPayload = (response) =>
  response?.data?.data ?? response?.data ?? response ?? null;

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
              với mã QR
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
        const payload = extractPayload(response);

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
    let transientErrorCount = 0;

    const pollStatus = async () => {
      try {
        const response = await checkDeviceLoginStatus(approvalId);
        const payload = extractPayload(response);
        const status = String(payload?.status || "").toUpperCase();

        if (!isMounted || !status) {
          return;
        }

        if (status === "PENDING") {
          transientErrorCount = 0;
          setStatusMessage("Đã tạo mã QR. Chờ điện thoại xác nhận đăng nhập.");
          return;
        }

        if (status === "APPROVED") {
          transientErrorCount = 0;
          setStatusMessage("Đã được phê duyệt. Đang hoàn tất đăng nhập...");
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
          const fallbackUserId = String(payload?.requestedByUserId || payload?.userId || "").trim();

          if (fallbackUserId) {
            const fallbackUser = { userId: fallbackUserId };
            localStorage.setItem("isLogin", "true");
            localStorage.setItem("userProfile", JSON.stringify(fallbackUser));
            setUserData(fallbackUser);
            navigate("/");
            return;
          }

          const currentUserResponse = await getCurrentUser();
          const currentUser = extractPayload(currentUserResponse);

          localStorage.setItem("isLogin", "true");
          localStorage.setItem("userProfile", JSON.stringify(currentUser || {}));
          setUserData(currentUser);
          navigate("/");
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        transientErrorCount += 1;
        if (transientErrorCount >= 10) {
          setErrorMessage(
            error.response?.data?.message ||
              error.message ||
              "Không thể kiểm tra trạng thái đăng nhập.",
          );
          return;
        }

        setStatusMessage("Đang đợi xác nhận từ thiết bị...");
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
  const [step, setStep] = useState("EMAIL");
  const [email, setEmail] = useState("");
  const [value, setValue] = useState({
    password: "",
    deviceId: "",
    deviceName: "",
    platform: "WEB",
  });
  const [registerData, setRegisterData] = useState({
    phone: "",
    password: "",
    confirmPassword: "",
    firstName: "",
    lastName: "",
    dob: "",
    gender: "MALE",
  });
  const [otpCode, setOtpCode] = useState("");
  const [registerToken, setRegisterToken] = useState("");
  const [stateLogin, setStateLogin] = useState("");
  const [loading, setLoading] = useState(false);
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
    if (!pendingApprovalId) {
      return undefined;
    }

    let active = true;
    let transientErrorCount = 0;

    const pollApprovalStatus = async () => {
      try {
        const response = await checkDeviceLoginStatus(pendingApprovalId);
        const payload = extractPayload(response);
        const status = String(payload?.status || "").toUpperCase();

        if (!active || !status) {
          return;
        }

        if (status === "PENDING") {
          transientErrorCount = 0;
          setStateLogin("Đã gửi yêu cầu phê duyệt tới thiết bị cũ.");
          return;
        }

        if (status === "APPROVED") {
          transientErrorCount = 0;
          setStateLogin("Đã được phê duyệt. Đang hoàn tất đăng nhập...");
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
          const fallbackUserId = String(payload?.requestedByUserId || payload?.userId || "").trim();
          if (fallbackUserId) {
            const fallbackUser = { userId: fallbackUserId };
            localStorage.setItem("isLogin", "true");
            localStorage.setItem("userProfile", JSON.stringify(fallbackUser));
            setUserData(fallbackUser);
            setStateLogin("");
            setPendingApprovalId("");
            navigate("/");
            return;
          }

          const currentUserResponse = await getCurrentUser();
          const currentUser = extractPayload(currentUserResponse);

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

        transientErrorCount += 1;
        if (transientErrorCount >= 10) {
          setPendingApprovalId("");
          setStateLogin(
            error.response?.data?.message ||
              error.message ||
              "Không thể kiểm tra trạng thái phê duyệt.",
          );
          return;
        }

        setStateLogin("Đang đợi xác nhận từ thiết bị cũ...");
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
  const normalizeEmail = useCallback((rawEmail) => String(rawEmail || "").trim().toLowerCase(), []);
  const handleCheckEmail = async () => {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      setStateLogin("Vui lòng nhập email.");
      return;
    }

    try {
      setLoading(true);
      setStateLogin("");
      const response = await checkEmailExists({ email: normalizedEmail });
      const payload = extractPayload(response);
      const nextStep = String(payload?.nextStep || "").toUpperCase();
      setEmail(normalizedEmail);

      if (nextStep === "LOGIN" || payload?.exists === true) {
        setStep("LOGIN");
        return;
      }

      if (nextStep === "REGISTER" || payload?.exists === false) {
        setStep("REGISTER_FORM");
        return;
      }

      setStateLogin(payload?.message || "Không xác định được bước tiếp theo.");
    } catch (error) {
      setStateLogin(
        error.response?.data?.message || "Không thể kiểm tra email lúc này."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLoginAccount = async () => {
    try {
      setLoading(true);
      const response = await userLogin({
        username: normalizeEmail(email),
        password: value.password,
        deviceId: value.deviceId,
        platform: value.platform || "WEB",
        deviceName: value.deviceName,
      });

      const payload = extractPayload(response);

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
        "Tài khoản hoặc mật khẩu không đúng.";

      setStateLogin(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSendRegisterOtp = async () => {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      setStateLogin("Email không hợp lệ.");
      return;
    }

    const { phone, password, confirmPassword, firstName, lastName, dob, gender } = registerData;
    if (!phone || !password || !firstName || !lastName || !dob || !gender) {
      setStateLogin("Vui lòng nhập đầy đủ thông tin đăng ký.");
      return;
    }
    if (password !== confirmPassword) {
      setStateLogin("Mật khẩu xác nhận không khớp.");
      return;
    }

    try {
      setLoading(true);
      setStateLogin("");
      await sendRegisterOtp({ email: normalizedEmail });
      setStep("REGISTER_OTP");
    } catch (error) {
      setStateLogin(error.response?.data?.message || "Không thể gửi OTP đăng ký.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyRegisterOtp = async () => {
    const normalizedEmail = normalizeEmail(email);
    if (!otpCode) {
      setStateLogin("Vui lòng nhập OTP.");
      return;
    }

    try {
      setLoading(true);
      setStateLogin("");
      const response = await verifyRegisterOtp({
        email: normalizedEmail,
        otpCode: otpCode.trim(),
        type: "REGISTER",
      });
      const token = extractPayload(response);
      if (!token) {
        setStateLogin("Không nhận được register token từ máy chủ.");
        return;
      }
      setRegisterToken(String(token));
      setStep("REGISTER_SUBMIT");
    } catch (error) {
      setStateLogin(error.response?.data?.message || "OTP không hợp lệ.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitRegister = async () => {
    const normalizedEmail = normalizeEmail(email);
    try {
      setLoading(true);
      setStateLogin("");
      await userRegisterWithOtp({
        email: normalizedEmail,
        phone: registerData.phone,
        registerToken,
        password: registerData.password,
        firstName: registerData.firstName,
        lastName: registerData.lastName,
        dob: registerData.dob,
        gender: registerData.gender,
      });
      setStateLogin("Đăng ký thành công. Vui lòng đăng nhập.");
      setStep("LOGIN");
      setValue((prev) => ({ ...prev, password: "" }));
    } catch (error) {
      setStateLogin(error.response?.data?.message || "Đăng ký thất bại.");
    } finally {
      setLoading(false);
    }
  };

  const handleButtonLogin = (event) => {
    if (value.password && (event.code === "Enter" || event.code === "NumpadEnter")) {
      void handleLoginAccount();
    }
  };

  return (
    <div className="login-login-account">
      <div className="login-form-login-account">
        <div className="login-form-login-wrap">
          {step === "EMAIL" ? (
            <div className="flex">
              <IoIosPhonePortrait className="icon-login" />
              <input
                type="text"
                placeholder="Email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          ) : null}

          {step === "LOGIN" ? (
            <>
              <div className="flex">
                <IoIosPhonePortrait className="icon-login" />
                <input type="text" value={email} disabled />
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
            </>
          ) : null}

          {step === "REGISTER_FORM" ? (
            <>
              <div className="flex">
                <IoIosPhonePortrait className="icon-login" />
                <input type="text" value={email} disabled />
              </div>
              <div className="flex">
                <IoIosPhonePortrait className="icon-login" />
                <input
                  type="text"
                  placeholder="Số điện thoại"
                  value={registerData.phone}
                  onChange={(event) =>
                    setRegisterData((prev) => ({ ...prev, phone: event.target.value }))
                  }
                />
              </div>
              <div className="flex">
                <IoIosPhonePortrait className="icon-login" />
                <input
                  type="text"
                  placeholder="Họ"
                  value={registerData.firstName}
                  onChange={(event) =>
                    setRegisterData((prev) => ({ ...prev, firstName: event.target.value }))
                  }
                />
              </div>
              <div className="flex">
                <IoIosPhonePortrait className="icon-login" />
                <input
                  type="text"
                  placeholder="Tên"
                  value={registerData.lastName}
                  onChange={(event) =>
                    setRegisterData((prev) => ({ ...prev, lastName: event.target.value }))
                  }
                />
              </div>
              <div className="flex">
                <IoIosPhonePortrait className="icon-login" />
                <input
                  type="date"
                  value={registerData.dob}
                  onChange={(event) =>
                    setRegisterData((prev) => ({ ...prev, dob: event.target.value }))
                  }
                />
              </div>
              <div className="flex">
                <IoIosPhonePortrait className="icon-login" />
                <select
                  value={registerData.gender}
                  onChange={(event) =>
                    setRegisterData((prev) => ({
                      ...prev,
                      gender: String(event.target.value || "").toUpperCase(),
                    }))
                  }
                >
                  <option value="MALE">Nam</option>
                  <option value="FEMALE">Nữ</option>
                  <option value="OTHER">Khác</option>
                </select>
              </div>
              <div className="flex">
                <CiLock className="icon-login" />
                <input
                  type="password"
                  placeholder="Mật khẩu"
                  value={registerData.password}
                  onChange={(event) =>
                    setRegisterData((prev) => ({ ...prev, password: event.target.value }))
                  }
                />
              </div>
              <div className="flex">
                <CiLock className="icon-login" />
                <input
                  type="password"
                  placeholder="Xác nhận mật khẩu"
                  value={registerData.confirmPassword}
                  onChange={(event) =>
                    setRegisterData((prev) => ({ ...prev, confirmPassword: event.target.value }))
                  }
                />
              </div>
            </>
          ) : null}

          {step === "REGISTER_OTP" ? (
            <div className="flex">
              <CiLock className="icon-login" />
              <input
                type="text"
                placeholder="Nhập OTP email"
                value={otpCode}
                onChange={(event) => setOtpCode(event.target.value)}
              />
            </div>
          ) : null}

          {step === "REGISTER_SUBMIT" ? (
            <div className="flex">
              <IoIosPhonePortrait className="icon-login" />
              <input type="text" value="Đã xác thực email, sẵn sàng đăng ký" disabled />
            </div>
          ) : null}
        </div>
        {stateLogin && <div className="state-login">{stateLogin}</div>}
        <div className={`login-container-btn ${loading ? "login-disable" : ""}`}>
          <div className="login-btn-login">
            {step === "EMAIL" ? (
              <button onClick={handleCheckEmail} disabled={loading}>
                Tiếp tục
              </button>
            ) : null}
            {step === "LOGIN" ? (
              <button onClick={handleLoginAccount} disabled={loading || !value.password}>
                Đăng nhập với mật khẩu
              </button>
            ) : null}
            {step === "REGISTER_FORM" ? (
              <button onClick={handleSendRegisterOtp} disabled={loading}>
                Xác thực email
              </button>
            ) : null}
            {step === "REGISTER_OTP" ? (
              <button onClick={handleVerifyRegisterOtp} disabled={loading || !otpCode}>
                Xác thực OTP
              </button>
            ) : null}
            {step === "REGISTER_SUBMIT" ? (
              <button onClick={handleSubmitRegister} disabled={loading || !registerToken}>
                Đăng ký tài khoản
              </button>
            ) : null}
          </div>
          <div className="login-btn-login-phone">
            <button>Đăng nhập bằng thiết bị di động</button>
            <div
              className={`login-introduce-login ${
                loading ? "" : "login-introduce-login-active"
              }`}
            >
              <svg height="10" width="100">
                <polygon points="50,0 100,100 0,100" fill="#0190f3" />
              </svg>
              <p>Đăng nhập không dùng mật khẩu</p>
            </div>
          </div>
        </div>
        {step !== "EMAIL" ? (
          <div style={{ textAlign: "center", marginTop: 10 }}>
            <span
              style={{ color: "#0190f3", cursor: "pointer", fontWeight: 600 }}
              onClick={() => {
                setStep("EMAIL");
                setStateLogin("");
                setOtpCode("");
                setRegisterToken("");
                setValue((prev) => ({ ...prev, password: "" }));
              }}
            >
              Quay lại nhập email
            </span>
          </div>
        ) : null}
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

