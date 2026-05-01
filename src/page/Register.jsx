import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CiLock } from "react-icons/ci";
import { IoIosPhonePortrait } from "react-icons/io";
import "../resource/style/Login/login.css";
import {
  checkEmailExists,
  sendRegisterOtp,
  userRegisterWithOtp,
  verifyRegisterOtp,
} from "../util/api";

const extractPayload = (response) =>
  response?.data?.data ?? response?.data ?? response ?? null;

const normalizeEmail = (rawEmail) => String(rawEmail || "").trim().toLowerCase();

export default function Register() {
  const navigate = useNavigate();
  const [step, setStep] = useState("EMAIL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [registerToken, setRegisterToken] = useState("");
  const [registerData, setRegisterData] = useState({
    phone: "",
    password: "",
    confirmPassword: "",
    firstName: "",
    lastName: "",
    dob: "",
    gender: "MALE",
  });

  const handleCheckEmail = async () => {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      setError("Vui lòng nhập email.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      const response = await checkEmailExists({ email: normalizedEmail });
      const payload = extractPayload(response);
      const nextStep = String(payload?.nextStep || "").toUpperCase();
      setEmail(normalizedEmail);

      if (nextStep === "LOGIN" || payload?.exists === true) {
        setError("Email đã tồn tại. Vui lòng đăng nhập.");
        return;
      }

      setStep("REGISTER_FORM");
    } catch (err) {
      setError(err.response?.data?.message || "Không thể kiểm tra email.");
    } finally {
      setLoading(false);
    }
  };

  const handleSendRegisterOtp = async () => {
    const { phone, password, confirmPassword, firstName, lastName, dob, gender } = registerData;
    if (!phone || !password || !firstName || !lastName || !dob || !gender) {
      setError("Vui lòng điền đầy đủ thông tin.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      await sendRegisterOtp({ email: normalizeEmail(email) });
      setStep("REGISTER_OTP");
    } catch (err) {
      setError(err.response?.data?.message || "Không thể gửi OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpCode) {
      setError("Vui lòng nhập OTP.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      const response = await verifyRegisterOtp({
        email: normalizeEmail(email),
        otpCode: otpCode.trim(),
        type: "REGISTER",
      });
      const token = extractPayload(response);
      if (!token) {
        setError("Không nhận được register token từ hệ thống.");
        return;
      }
      setRegisterToken(String(token));
      setStep("REGISTER_SUBMIT");
    } catch (err) {
      setError(err.response?.data?.message || "OTP không hợp lệ.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    try {
      setLoading(true);
      setError("");
      await userRegisterWithOtp({
        email: normalizeEmail(email),
        phone: registerData.phone,
        registerToken,
        password: registerData.password,
        firstName: registerData.firstName,
        lastName: registerData.lastName,
        dob: registerData.dob,
        gender: registerData.gender,
      });
      navigate("/auth/login");
    } catch (err) {
      setError(err.response?.data?.message || "Đăng ký thất bại.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-title-container text-center mb-20">
        <h2 className="login-title">Zalo</h2>
        <p>Đăng ký tài khoản Zalo</p>
      </div>

      <div className="login-form-login p-20 bg-white br-8">
        {error ? <div className="error-box mb-10">{error}</div> : null}

        {step === "EMAIL" ? (
          <div className="flex align-center mb-20">
            <IoIosPhonePortrait className="icon-login" />
            <input
              className="input-login"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
        ) : null}

        {step === "REGISTER_FORM" ? (
          <div className="register-step-3">
            <div className="flex align-center mb-20">
              <IoIosPhonePortrait className="icon-login" />
              <input className="input-login" type="text" value={email} disabled />
            </div>
            <div className="flex align-center mb-20">
              <IoIosPhonePortrait className="icon-login" />
              <input
                className="input-login"
                placeholder="Họ"
                value={registerData.firstName}
                onChange={(event) =>
                  setRegisterData((prev) => ({ ...prev, firstName: event.target.value }))
                }
              />
              <input
                className="input-login"
                placeholder="Tên"
                value={registerData.lastName}
                onChange={(event) =>
                  setRegisterData((prev) => ({ ...prev, lastName: event.target.value }))
                }
              />
            </div>
            <div className="flex align-center mb-20">
              <IoIosPhonePortrait className="icon-login" />
              <input
                className="input-login"
                placeholder="Số điện thoại"
                value={registerData.phone}
                onChange={(event) =>
                  setRegisterData((prev) => ({ ...prev, phone: event.target.value }))
                }
              />
            </div>
            <div className="flex align-center mb-20">
              <IoIosPhonePortrait className="icon-login" />
              <input
                className="input-login"
                type="date"
                value={registerData.dob}
                onChange={(event) =>
                  setRegisterData((prev) => ({ ...prev, dob: event.target.value }))
                }
              />
            </div>
            <div className="flex align-center mb-20">
              <IoIosPhonePortrait className="icon-login" />
              <select
                className="input-login"
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
            <div className="flex align-center mb-20">
              <CiLock className="icon-login" />
              <input
                className="input-login"
                type="password"
                placeholder="Mật khẩu"
                value={registerData.password}
                onChange={(event) =>
                  setRegisterData((prev) => ({ ...prev, password: event.target.value }))
                }
              />
            </div>
            <div className="flex align-center mb-20">
              <CiLock className="icon-login" />
              <input
                className="input-login"
                type="password"
                placeholder="Xác nhận mật khẩu"
                value={registerData.confirmPassword}
                onChange={(event) =>
                  setRegisterData((prev) => ({ ...prev, confirmPassword: event.target.value }))
                }
              />
            </div>
          </div>
        ) : null}

        {step === "REGISTER_OTP" ? (
          <div className="flex align-center mb-20">
            <CiLock className="icon-login" />
            <input
              className="input-login"
              type="text"
              placeholder="Nhập OTP email"
              value={otpCode}
              onChange={(event) => setOtpCode(event.target.value)}
            />
          </div>
        ) : null}

        {step === "REGISTER_SUBMIT" ? (
          <div className="flex align-center mb-20">
            <IoIosPhonePortrait className="icon-login" />
            <input
              className="input-login"
              type="text"
              value="Đã xác thực email, sẵn sàng đăng ký"
              disabled
            />
          </div>
        ) : null}

        {step === "EMAIL" ? (
          <button className="full-btn btn-login" disabled={loading} onClick={handleCheckEmail}>
            Tiếp tục
          </button>
        ) : null}
        {step === "REGISTER_FORM" ? (
          <button className="full-btn btn-login" disabled={loading} onClick={handleSendRegisterOtp}>
            Xác thực email
          </button>
        ) : null}
        {step === "REGISTER_OTP" ? (
          <button className="full-btn btn-login" disabled={loading || !otpCode} onClick={handleVerifyOtp}>
            Xác thực OTP
          </button>
        ) : null}
        {step === "REGISTER_SUBMIT" ? (
          <button
            className="full-btn btn-login"
            disabled={loading || !registerToken}
            onClick={handleRegister}
          >
            Hoàn tất đăng ký
          </button>
        ) : null}

        <button
          className="full-btn btn-login mt-10"
          style={{ background: "#e0e0e0", color: "#333" }}
          onClick={() => navigate("/auth/login")}
          type="button"
        >
          Trở về đăng nhập
        </button>
      </div>
    </div>
  );
}
