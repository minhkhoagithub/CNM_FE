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
      gender: "male", // default value
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
    const { firstName, lastName, phone, password, confirmPassword, dob, gender } = registerData;
    if (!firstName || !lastName || !phone || !password || !dob)
      return setError("Vui lòng điền đủ thông tin");
    if (!gender || gender === "")
      return setError("Giới tính không được để trống");
    // Kiểm tra mật khẩu có ít nhất 1 ký tự hoa
    if (!/[A-Z]/.test(password))
        return setError("Mật khẩu phải có ít nhất 1 ký tự viết hoa");
    // Kiểm tra số điện thoại: 10 số, bắt đầu bằng 0
    if (!/^0\d{9}$/.test(phone))
        return setError("Số điện thoại phải gồm 10 số và bắt đầu bằng số 0");
    // Kiểm tra ngày sinh đủ 13 tuổi
    const dobDate = new Date(dob);
    const now = new Date();
    const age = now.getFullYear() - dobDate.getFullYear() - (now.getMonth() < dobDate.getMonth() || (now.getMonth() === dobDate.getMonth() && now.getDate() < dobDate.getDate()) ? 1 : 0);
    if (isNaN(dobDate.getTime()) || age < 13)
        return setError("Bạn phải đủ 13 tuổi trở lên");
    if (password !== confirmPassword)
        return setError("Mật khẩu không khớp");
    // ...existing code...
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
          gender,
          });
      alert("Đăng ký thành công!");
      navigate("/auth/login");
    } catch (err) {
      // Xử lý lỗi trả về từ backend dạng errors[]
      const apiErrors = err.response?.data?.errors;
      if (Array.isArray(apiErrors) && apiErrors.length > 0) {
        // Ưu tiên lỗi gender
        const genderError = apiErrors.find(e => e.field === "gender");
        if (genderError) {
          setError(genderError.reason || "Giới tính không hợp lệ");
          return;
        }
        // Nếu có lỗi khác thì lấy lỗi đầu tiên
        setError(apiErrors[0].reason || "Đăng ký thất bại");
        return;
      }
      setError(err.response?.data?.message || "Đăng ký thất bại");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-title-container text-center mb-20">
        <h2 className="login-title">Zalo</h2>
        <p>{step === 3 ? "Thông tin cá nhân" : "Đăng ký tài khoản Zalo"}</p>
      </div>

      <div className="login-form-login p-20 bg-white br-8">
        {error && <div className="error-box mb-10">{error}</div>}

        {step === 1 && (
          <>
            <div className="flex align-center mb-20">
              <IoMail className="icon-login" />
              <input
                className="input-login"
                type="email"
                placeholder="Nhập email"
                value={emailOtpData.email}
                onChange={(e) => setEmailOtpData({...emailOtpData, email: e.target.value})}
              />
            </div>
            <button className={`full-btn btn-login${loading ? ' login-disable' : ''}`} onClick={handleSendOtp} disabled={loading}>Tiếp tục</button>
          </>
        )}

        {step === 2 && (
          <>
            <div className="flex align-center mb-20">
              <CiLock className="icon-login" />
              <input
                className="input-login"
                type="text"
                placeholder="Nhập OTP 6 số"
                maxLength="6"
                value={emailOtpData.otpCode}
                onChange={(e) => setEmailOtpData({...emailOtpData, otpCode: e.target.value})}
              />
            </div>
            <button className={`full-btn btn-login${loading ? ' login-disable' : ''}`} onClick={handleVerifyOtp} disabled={loading}>Xác thực</button>
            <p className="text-center pointer mt-10 fs-14" onClick={() => setStep(1)}>Quay lại</p>
          </>
        )}

        {step === 3 && (
          <div className="register-step-3">
            <div className="flex align-center mb-20">
              <HiOutlineUser className="icon-login" />
              <input className="input-login" placeholder="Họ" onChange={(e) => setRegisterData({...registerData, firstName: e.target.value})} />
              <input className="input-login" placeholder="Tên" onChange={(e) => setRegisterData({...registerData, lastName: e.target.value})} />
            </div>
            <div className="flex align-center mb-20">
              <IoIosPhonePortrait className="icon-login" />
              <input className="input-login" placeholder="Số điện thoại" onChange={(e) => setRegisterData({...registerData, phone: e.target.value})} />
            </div>
            <div className="flex align-center mb-20">
              <CiCalendarDate className="icon-login" />
              <input className="input-login" type="date" onChange={(e) => setRegisterData({...registerData, dob: e.target.value})} />
            </div>
            <div className="flex align-center mb-20">
              <span className="icon-login" style={{width: 20}}></span>
              <select className="input-login" value={registerData.gender} onChange={e => setRegisterData({...registerData, gender: e.target.value})}>
                <option value="male">Nam</option>
                <option value="female">Nữ</option>
                <option value="other">Khác</option>
              </select>
            </div>
            <div className="flex align-center mb-20">
              <CiLock className="icon-login" />
              <input className="input-login" type="password" placeholder="Mật khẩu" onChange={(e) => setRegisterData({...registerData, password: e.target.value})} />
            </div>
            <div className="flex align-center mb-20">
              <CiLock className="icon-login" />
              <input className="input-login" type="password" placeholder="Xác nhận mật khẩu" onChange={(e) => setRegisterData({...registerData, confirmPassword: e.target.value})} />
            </div>
            <button className={`full-btn btn-login${loading ? ' login-disable' : ''}`} onClick={handleRegister} disabled={loading}>Hoàn tất đăng ký</button>
          </div>
        )}
        {/* Nút trở về đăng nhập */}
        <button
          className="full-btn btn-login mt-10"
          style={{ background: '#e0e0e0', color: '#333' }}
          onClick={() => navigate('/auth/login')}
          type="button"
        >
          Trở về đăng nhập
        </button>
      </div>
    </div>
  );
}