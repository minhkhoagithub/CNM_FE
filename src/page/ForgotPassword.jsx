import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../resource/style/Login/forgot-password.css";
import { IoIosPhonePortrait } from "react-icons/io";
import { CiLock } from "react-icons/ci";
import { MdEmail } from "react-icons/md";
import { sendForgotPasswordOtp, verifyForgotPasswordOtp, resetPassword } from "../util/api";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: Send OTP, 2: Verify OTP, 3: Reset Password
  const [identifier, setIdentifier] = useState(""); // Email or Phone
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [otpTimer, setOtpTimer] = useState(0);
  const [canResendOtp, setCanResendOtp] = useState(false);

  // Step 1: Send OTP
  const handleSendOtp = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    if (!identifier.trim()) {
      setErrorMessage("Vui lòng nhập email hoặc số điện thoại");
      return;
    }

    setLoading(true);
    try {
      const response = await sendForgotPasswordOtp({ identifier: identifier.trim() });

      if (response.status === 200) {
        setStep(2); // Move to OTP verification
        setErrorMessage("");
        setOtpTimer(900); // 15 minutes in seconds
        setCanResendOtp(false);
      }
    } catch (error) {
      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        "Không thể gửi OTP. Vui lòng thử lại.";
      setErrorMessage(errorMessage);
      console.error("Send OTP error:", error);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    if (!otp.trim() || otp.length !== 6) {
      setErrorMessage("Vui lòng nhập mã OTP 6 chữ số");
      return;
    }

    setLoading(true);
    try {
      const response = await verifyForgotPasswordOtp({
        identifier: identifier.trim(),
        otp: otp.trim(),
      });

      if (response.status === 200) {
        setResetToken(response.data.data.resetToken);
        setStep(3); // Move to password reset
        setErrorMessage("");
      }
    } catch (error) {
      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        "OTP không chính xác. Vui lòng thử lại.";
      setErrorMessage(errorMessage);
      console.error("Verify OTP error:", error);
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Reset Password
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    if (!newPassword.trim()) {
      setErrorMessage("Vui lòng nhập mật khẩu mới");
      return;
    }

    if (!confirmPassword.trim()) {
      setErrorMessage("Vui lòng xác nhận mật khẩu");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("Mật khẩu không khớp");
      return;
    }

    if (newPassword.length < 6 || newPassword.length > 50) {
      setErrorMessage("Mật khẩu phải từ 6-50 ký tự");
      return;
    }

    const passwordRegex = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{6,50}$/;
    if (!passwordRegex.test(newPassword)) {
      setErrorMessage(
        "Mật khẩu phải chứa chữ hoa, chữ thường và số"
      );
      return;
    }

    setLoading(true);
    try {
      const response = await resetPassword({
        identifier: identifier.trim(),
        resetToken: resetToken,
        newPassword: newPassword,
        confirmPassword: confirmPassword,
      });

      if (response.status === 200) {
        setErrorMessage("");
        // Redirect to login after 2 seconds
        setTimeout(() => {
          navigate("/auth/login");
        }, 2000);
      }
    } catch (error) {
      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        "Không thể đặt lại mật khẩu. Vui lòng thử lại.";
      setErrorMessage(errorMessage);
      console.error("Reset password error:", error);
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP
  const handleResendOtp = async (e) => {
    e.preventDefault();
    if (!canResendOtp) return;
    
    setErrorMessage("");
    setLoading(true);
    try {
      const response = await sendForgotPasswordOtp({ identifier: identifier.trim() });

      if (response.status === 200) {
        setErrorMessage("");
        setOtp("");
        setOtpTimer(900);
        setCanResendOtp(false);
      }
    } catch (error) {
      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        "Không thể gửi lại OTP";
      setErrorMessage(errorMessage);
      console.error("Resend OTP error:", error);
    } finally {
      setLoading(false);
    }
  };

  // OTP Timer
  React.useEffect(() => {
    if (otpTimer === 0 && step === 2) {
      setCanResendOtp(true);
      return;
    }

    const timer = setTimeout(() => {
      setOtpTimer(otpTimer - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [otpTimer, step]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  return (
    <div className="forgot-password-container">
      <div className="forgot-password-title-container">
        <div>
          <h2 className="textcenter">Zalo</h2>
        </div>
        <div>
          <p className="textcenter">Đặt lại mật khẩu</p>
          <p className="textcenter">Nhập email hoặc số điện thoại của bạn</p>
        </div>
      </div>

      <div className="forgot-password-form-container">
        <div className="forgot-password-header">
          <div className="forgot-password-steps">
            <div
              className={`forgot-password-step ${
                step >= 1 ? "forgot-password-step-active" : ""
              }`}
            >
              1
            </div>
            <div className="forgot-password-step-line"></div>
            <div
              className={`forgot-password-step ${
                step >= 2 ? "forgot-password-step-active" : ""
              }`}
            >
              2
            </div>
            <div className="forgot-password-step-line"></div>
            <div
              className={`forgot-password-step ${
                step >= 3 ? "forgot-password-step-active" : ""
              }`}
            >
              3
            </div>
          </div>
          <div className="forgot-password-step-title">
            {step === 1 && <p>Xác nhận tài khoản</p>}
            {step === 2 && <p>Nhập mã xác thực OTP</p>}
            {step === 3 && <p>Đặt mật khẩu mới</p>}
          </div>
        </div>

        {/* Error Message */}
        {errorMessage && (
          <div className="forgot-password-error">
            <p>{errorMessage}</p>
          </div>
        )}

        {/* Step 1: Send OTP */}
        {step === 1 && (
          <form onSubmit={handleSendOtp} className="forgot-password-form">
            <div className="forgot-password-form-group">
              <div className="forgot-password-input-wrapper">
                <MdEmail className="icon-input" />
                <input
                  type="text"
                  placeholder="Email hoặc số điện thoại"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="forgot-password-input"
                />
              </div>
            </div>

            <div className="forgot-password-button-group">
              <button
                type="submit"
                className="forgot-password-btn-primary"
                disabled={loading || !identifier.trim()}
              >
                {loading ? "Đang gửi..." : "Gửi OTP"}
              </button>
              <button
                type="button"
                className="forgot-password-btn-secondary"
                onClick={() => navigate("/auth/login")}
              >
                Quay lại Đăng nhập
              </button>
            </div>
          </form>
        )}

        {/* Step 2: Verify OTP */}
        {step === 2 && (
          <form onSubmit={handleVerifyOtp} className="forgot-password-form">
            <div className="forgot-password-account-info">
              <p>Mã xác thực đã được gửi đến:</p>
              <p className="forgot-password-identifier">{identifier}</p>
            </div>

            <div className="forgot-password-form-group">
              <div className="forgot-password-input-wrapper">
                <input
                  type="text"
                  placeholder="Nhập 6 chữ số OTP"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  maxLength="6"
                  className="forgot-password-input forgot-password-otp-input"
                />
              </div>
            </div>

            <div className="forgot-password-otp-timer">
              <p>Mã OTP hết hạn trong: <span>{formatTime(otpTimer)}</span></p>
            </div>

            <div className="forgot-password-button-group">
              <button
                type="submit"
                className="forgot-password-btn-primary"
                disabled={loading || otp.length !== 6}
              >
                {loading ? "Đang xác thực..." : "Xác thực OTP"}
              </button>
              <button
                type="button"
                className={`forgot-password-btn-resend ${
                  canResendOtp ? "" : "forgot-password-btn-disabled"
                }`}
                onClick={handleResendOtp}
                disabled={!canResendOtp || loading}
              >
                {canResendOtp ? "Gửi lại OTP" : "Gửi lại OTP"}
              </button>
              <button
                type="button"
                className="forgot-password-btn-secondary"
                onClick={() => {
                  setStep(1);
                  setOtp("");
                  setErrorMessage("");
                }}
              >
                Quay lại
              </button>
            </div>
          </form>
        )}

        {/* Step 3: Reset Password */}
        {step === 3 && (
          <form onSubmit={handleResetPassword} className="forgot-password-form">
            <div className="forgot-password-password-info">
              <p>Tài khoản: <span className="forgot-password-identifier">{identifier}</span></p>
              <p className="forgot-password-password-rule">
                Mật khẩu phải chứa: chữ hoa, chữ thường, số (6-50 ký tự)
              </p>
            </div>

            <div className="forgot-password-form-group">
              <div className="forgot-password-input-wrapper">
                <CiLock className="icon-input" />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Mật khẩu mới"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="forgot-password-input"
                />
              </div>
            </div>

            <div className="forgot-password-form-group">
              <div className="forgot-password-input-wrapper">
                <CiLock className="icon-input" />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Xác nhận mật khẩu"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="forgot-password-input"
                />
              </div>
            </div>

            <div className="forgot-password-show-password">
              <input
                type="checkbox"
                id="showPassword"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
              />
              <label htmlFor="showPassword">Hiển thị mật khẩu</label>
            </div>

            <div className="forgot-password-button-group">
              <button
                type="submit"
                className="forgot-password-btn-primary"
                disabled={
                  loading ||
                  !newPassword.trim() ||
                  !confirmPassword.trim()
                }
              >
                {loading ? "Đang cập nhật..." : "Cập nhật mật khẩu"}
              </button>
              <button
                type="button"
                className="forgot-password-btn-secondary"
                onClick={() => {
                  setStep(2);
                  setNewPassword("");
                  setConfirmPassword("");
                  setErrorMessage("");
                }}
                disabled={loading}
              >
                Quay lại
              </button>
            </div>

            {loading && (
              <div className="forgot-password-success-message">
                <p>✓ Mật khẩu đã được đặt lại thành công!<br />Đang chuyển hướng...</p>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
