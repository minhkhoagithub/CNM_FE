import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CiLock } from "react-icons/ci";
import { IoIosPhonePortrait } from "react-icons/io";
import {
  MdOutlineCake,
  MdOutlineCheckCircle,
  MdOutlineEmail,
  MdOutlinePerson,
  MdOutlineWc,
} from "react-icons/md";
import "../resource/style/Login/register.css";
import {
  checkEmailExists,
  sendRegisterOtp,
  userRegisterWithOtp,
  verifyRegisterOtp,
} from "../util/api";

const extractPayload = (response) =>
  response?.data?.data ?? response?.data ?? response ?? null;

const normalizeEmail = (rawEmail) => String(rawEmail || "").trim().toLowerCase();

const REGISTER_STEPS = [
  {
    key: "EMAIL",
    label: "Email",
    title: "Bắt đầu với email",
    description: "Nhập email bạn muốn dùng cho tài khoản Zalo.",
  },
  {
    key: "REGISTER_FORM",
    label: "Thông tin",
    title: "Tạo hồ sơ cá nhân",
    description: "Điền thông tin cơ bản để hoàn tất bước xác thực.",
  },
  {
    key: "REGISTER_OTP",
    label: "OTP",
    title: "Xác thực email",
    description: "Nhập mã OTP đã được gửi đến email của bạn.",
  },
  {
    key: "REGISTER_SUBMIT",
    label: "Hoàn tất",
    title: "Sẵn sàng tạo tài khoản",
    description: "Email đã được xác thực, bấm hoàn tất để đăng ký.",
  },
];

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

  const activeStepIndex = Math.max(
    0,
    REGISTER_STEPS.findIndex((item) => item.key === step)
  );
  const currentStep = REGISTER_STEPS[activeStepIndex] || REGISTER_STEPS[0];

  return (
    <main className="register-page">
      <section className="register-shell">
        <aside className="register-brand-panel">
          <div>
            <div className="register-brand-wordmark">Zalo</div>
            <h1>Tạo tài khoản để bắt đầu kết nối</h1>
            <p>
              Hoàn tất vài thông tin cơ bản, xác thực email và sử dụng Zalo trên web.
            </p>
          </div>

          <div className="register-brand-highlights" aria-hidden="true">
            <div className="register-highlight-item">
              <span>01</span>
              <p>Email xác thực rõ ràng</p>
            </div>
            <div className="register-highlight-item">
              <span>02</span>
              <p>Thông tin cá nhân gọn gàng</p>
            </div>
            <div className="register-highlight-item">
              <span>03</span>
              <p>Sẵn sàng đăng nhập sau khi hoàn tất</p>
            </div>
          </div>
        </aside>

        <section className="register-card">
          <header className="register-card-header">
            <p className="register-kicker">Đăng ký tài khoản</p>
            <h2>{currentStep.title}</h2>
            <p>{currentStep.description}</p>
          </header>

          <div className="register-stepper" aria-label="Tiến trình đăng ký">
            {REGISTER_STEPS.map((item, index) => (
              <div
                className={`register-step-item ${index <= activeStepIndex ? "is-active" : ""}`}
                key={item.key}
              >
                <span>{index + 1}</span>
                <p>{item.label}</p>
              </div>
            ))}
          </div>

          <div className="register-form-body">
            {error ? <div className="register-error-box">{error}</div> : null}

            {step === "EMAIL" ? (
              <div className="register-field">
                <label>Email</label>
                <div className="register-input-shell">
                  <MdOutlineEmail />
                  <input
                    type="email"
                    placeholder="Nhập email của bạn"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
              </div>
            ) : null}

            {step === "REGISTER_FORM" ? (
              <div className="register-form-grid">
                <div className="register-field register-field-full">
                  <label>Email đăng ký</label>
                  <div className="register-input-shell is-disabled">
                    <MdOutlineEmail />
                    <input type="text" value={email} disabled />
                  </div>
                </div>

                <div className="register-field">
                  <label>Họ</label>
                  <div className="register-input-shell">
                    <MdOutlinePerson />
                    <input
                      placeholder="Nhập họ"
                      value={registerData.firstName}
                      onChange={(event) =>
                        setRegisterData((prev) => ({ ...prev, firstName: event.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="register-field">
                  <label>Tên</label>
                  <div className="register-input-shell">
                    <MdOutlinePerson />
                    <input
                      placeholder="Nhập tên"
                      value={registerData.lastName}
                      onChange={(event) =>
                        setRegisterData((prev) => ({ ...prev, lastName: event.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="register-field">
                  <label>Số điện thoại</label>
                  <div className="register-input-shell">
                    <IoIosPhonePortrait />
                    <input
                      placeholder="Nhập số điện thoại"
                      value={registerData.phone}
                      onChange={(event) =>
                        setRegisterData((prev) => ({ ...prev, phone: event.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="register-field">
                  <label>Ngày sinh</label>
                  <div className="register-input-shell">
                    <MdOutlineCake />
                    <input
                      type="date"
                      value={registerData.dob}
                      onChange={(event) =>
                        setRegisterData((prev) => ({ ...prev, dob: event.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="register-field">
                  <label>Giới tính</label>
                  <div className="register-input-shell">
                    <MdOutlineWc />
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
                </div>

                <div className="register-field">
                  <label>Mật khẩu</label>
                  <div className="register-input-shell">
                    <CiLock />
                    <input
                      type="password"
                      placeholder="Nhập mật khẩu"
                      value={registerData.password}
                      onChange={(event) =>
                        setRegisterData((prev) => ({ ...prev, password: event.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="register-field register-field-full">
                  <label>Xác nhận mật khẩu</label>
                  <div className="register-input-shell">
                    <CiLock />
                    <input
                      type="password"
                      placeholder="Nhập lại mật khẩu"
                      value={registerData.confirmPassword}
                      onChange={(event) =>
                        setRegisterData((prev) => ({
                          ...prev,
                          confirmPassword: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {step === "REGISTER_OTP" ? (
              <div className="register-field">
                <label>Mã OTP email</label>
                <div className="register-input-shell">
                  <CiLock />
                  <input
                    type="text"
                    placeholder="Nhập OTP email"
                    value={otpCode}
                    onChange={(event) => setOtpCode(event.target.value)}
                  />
                </div>
              </div>
            ) : null}

            {step === "REGISTER_SUBMIT" ? (
              <div className="register-success-box">
                <MdOutlineCheckCircle />
                <div>
                  <h3>Đã xác thực email</h3>
                  <p>Sẵn sàng tạo tài khoản Zalo với email {normalizeEmail(email)}.</p>
                </div>
              </div>
            ) : null}

            <div className="register-actions">
              {step === "EMAIL" ? (
                <button className="register-primary-btn" disabled={loading} onClick={handleCheckEmail}>
                  {loading ? "Đang kiểm tra..." : "Tiếp tục"}
                </button>
              ) : null}
              {step === "REGISTER_FORM" ? (
                <button
                  className="register-primary-btn"
                  disabled={loading}
                  onClick={handleSendRegisterOtp}
                >
                  {loading ? "Đang gửi OTP..." : "Xác thực email"}
                </button>
              ) : null}
              {step === "REGISTER_OTP" ? (
                <button
                  className="register-primary-btn"
                  disabled={loading || !otpCode}
                  onClick={handleVerifyOtp}
                >
                  {loading ? "Đang xác thực..." : "Xác thực OTP"}
                </button>
              ) : null}
              {step === "REGISTER_SUBMIT" ? (
                <button
                  className="register-primary-btn"
                  disabled={loading || !registerToken}
                  onClick={handleRegister}
                >
                  {loading ? "Đang đăng ký..." : "Hoàn tất đăng ký"}
                </button>
              ) : null}

              <button
                className="register-secondary-btn"
                onClick={() => navigate("/auth/login")}
                type="button"
              >
                Trở về đăng nhập
              </button>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
