import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../resource/style/Login/login.css";
import { IoMail } from "react-icons/io5";
import { CiLock } from "react-icons/ci";
import { HiOutlineUser } from "react-icons/hi";
import { CiCalendarDate } from "react-icons/ci";
import { IoIosPhonePortrait } from "react-icons/io";
import { sendRegisterOtp, verifyRegisterOtp, userRegisterWithOtp } from "../util/api";

export default function Register() {
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const [emailOtpData, setEmailOtpData] = useState({
    email: "",
    otpCode: "",
    otpSent: false,
    registerToken: "",
  });

  const [registerData, setRegisterData] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    password: "",
    confirmPassword: "",
    dob: "",
  });

  // Bước 1: Gửi OTP
  const handleSendOtp = async () => {
    if (!emailOtpData.email) return setError("Vui lòng nhập email");
    try {
      setError("");
      setLoading(true);
      await sendRegisterOtp({ email: emailOtpData.email });
      setEmailOtpData({ ...emailOtpData, otpSent: true });
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.message || "Không thể gửi mã OTP");
    } finally {
      setLoading(false);
    }
  };

  // Bước 2: Xác thực OTP và nhận Register Token
  const handleVerifyOtp = async () => {
    if (!emailOtpData.otpCode) return setError("Vui lòng nhập mã OTP");
    try {
      setError("");
      setLoading(true);
      const res = await verifyRegisterOtp({
        email: emailOtpData.email,
        otpCode: emailOtpData.otpCode,
      });

      // LẤY TOKEN: Backend trả về ApiResponse { data: "uuid-token" }
      const token = res.data?.data;
      if (token) {
        setEmailOtpData({ ...emailOtpData, registerToken: token });
        setStep(3);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Mã OTP không hợp lệ");
    } finally {
      setLoading(false);
    }
  };

  // Bước 3: Đăng ký tài khoản
  const handleRegister = async () => {
    const { firstName, lastName, phone, password, confirmPassword, dob } = registerData;
    if (!firstName || !lastName || !phone || !password || !dob)
        return setError("Vui lòng điền đủ thông tin");
    if (password !== confirmPassword)
        return setError("Mật khẩu không khớp");

    try {
      setError("");
      setLoading(true);
      await userRegisterWithOtp({
        email: emailOtpData.email,
        password,
        phone,
        registerToken: emailOtpData.registerToken,
        dob,
        firstName,
        lastName,
      });
      alert("Đăng ký thành công!");
      navigate("/auth/login");
    } catch (err) {
      setError(err.response?.data?.message || "Đăng ký thất bại");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-title-container" style={{ textAlign: 'center', marginBottom: '20px' }}>
        <h2 style={{ color: "#0190f3", fontSize: "32px" }}>Zalo</h2>
        <p>{step === 3 ? "Thông tin cá nhân" : "Đăng ký tài khoản Zalo"}</p>
      </div>

      <div className="login-form-login" style={{ padding: '20px', background: '#fff', borderRadius: '8px' }}>
        {error && <div className="error-box" style={{ color: 'red', marginBottom: '10px' }}>{error}</div>}

        {step === 1 && (
          <>
            <div className="flex">
              <IoMail className="icon-login" />
              <input
                type="email"
                placeholder="Nhập email"
                value={emailOtpData.email}
                onChange={(e) => setEmailOtpData({...emailOtpData, email: e.target.value})}
              />
            </div>
            <button className="full-btn" onClick={handleSendOtp} disabled={loading}>Tiếp tục</button>
          </>
        )}

        {step === 2 && (
          <>
            <div className="flex">
              <CiLock className="icon-login" />
              <input
                type="text"
                placeholder="Nhập OTP 6 số"
                maxLength="6"
                value={emailOtpData.otpCode}
                onChange={(e) => setEmailOtpData({...emailOtpData, otpCode: e.target.value})}
              />
            </div>
            <button className="full-btn" onClick={handleVerifyOtp} disabled={loading}>Xác thực</button>
            <p onClick={() => setStep(1)} style={{ cursor: 'pointer', textAlign: 'center', marginTop: '10px', fontSize: '14px' }}>Quay lại</p>
          </>
        )}

        {step === 3 && (
          <div className="register-step-3">
            <div className="flex">
              <HiOutlineUser className="icon-login" />
              <input placeholder="Họ" onChange={(e) => setRegisterData({...registerData, firstName: e.target.value})} />
              <input placeholder="Tên" onChange={(e) => setRegisterData({...registerData, lastName: e.target.value})} />
            </div>
            <div className="flex">
              <IoIosPhonePortrait className="icon-login" />
              <input placeholder="Số điện thoại" onChange={(e) => setRegisterData({...registerData, phone: e.target.value})} />
            </div>
            <div className="flex">
              <CiCalendarDate className="icon-login" />
              <input type="date" onChange={(e) => setRegisterData({...registerData, dob: e.target.value})} />
            </div>
            <div className="flex">
              <CiLock className="icon-login" />
              <input type="password" placeholder="Mật khẩu" onChange={(e) => setRegisterData({...registerData, password: e.target.value})} />
            </div>
            <div className="flex">
              <CiLock className="icon-login" />
              <input type="password" placeholder="Xác nhận mật khẩu" onChange={(e) => setRegisterData({...registerData, confirmPassword: e.target.value})} />
            </div>
            <button className="full-btn" onClick={handleRegister} disabled={loading}>Hoàn tất đăng ký</button>
          </div>
        )}
      </div>
    </div>
  );
}