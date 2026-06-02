import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createZaloLockChallenge,
  unlockZaloLock,
  verifyZaloLockPin,
} from "../util/api";
import "../resource/style/Login/login.css";

const getPayload = (response) => response?.data?.data ?? response?.data ?? {};

export default function ZaloLock() {
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [remainingAttempts, setRemainingAttempts] = useState(5);
  const [lockedUntilEpochMillis, setLockedUntilEpochMillis] = useState(0);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const challengeRes = await createZaloLockChallenge();
        const challengeData = getPayload(challengeRes);
        setChallengeToken(String(challengeData?.challengeToken || ""));
        setRemainingAttempts(Number(challengeData?.remainingAttempts ?? 5));
        setLockedUntilEpochMillis(Number(challengeData?.lockedUntilEpochMillis ?? 0));
      } catch (error) {
        setMessage(error?.response?.data?.message || "Không thể tạo phiên xác thực PIN.");
      }
    };

    void init();
  }, []);

  const handleUnlock = async () => {
    if (!pin.trim()) {
      setMessage("Vui lòng nhập PIN.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      let response;
      if (challengeToken) {
        response = await unlockZaloLock({
          challengeToken,
          pin: pin.trim(),
        });
      } else {
        response = await verifyZaloLockPin({ pin: pin.trim() });
      }

      const payload = getPayload(response);
      setRemainingAttempts(Number(payload?.remainingAttempts ?? remainingAttempts));
      setLockedUntilEpochMillis(Number(payload?.lockedUntilEpochMillis ?? 0));

      if (payload?.success === true) {
        localStorage.setItem("zaloLockRequired", "true");
        localStorage.setItem("zaloLockUnlocked", "true");
        navigate("/", { replace: true });
        return;
      }

      setMessage(payload?.message || "PIN không đúng.");
    } catch (error) {
      const payload = getPayload(error?.response);
      if (payload && typeof payload === "object") {
        setRemainingAttempts(Number(payload?.remainingAttempts ?? remainingAttempts));
        setLockedUntilEpochMillis(Number(payload?.lockedUntilEpochMillis ?? 0));
      }
      setMessage(error?.response?.data?.message || "PIN không đúng hoặc đã hết số lần thử.");
    } finally {
      setLoading(false);
    }
  };

  const lockUntilText =
    lockedUntilEpochMillis > Date.now()
      ? `Tài khoản tạm khóa đến ${new Date(lockedUntilEpochMillis).toLocaleString()}`
      : "";

  return (
    <div className="login-container mt-2">
      <div className="login-title-container">
        <h2 className="textcenter">Xác thực PIN</h2>
        <p className="textcenter">Nhập mã PIN để mở khóa Zalo Web</p>
      </div>

      <div className="login-form-login">
        <div className="login-form-login-account">
          <div className="login-form-login-wrap">
            <div className="flex">
              <input
                type="password"
                placeholder="Nhập PIN"
                value={pin}
                onChange={(event) => setPin(event.target.value)}
              />
            </div>
          </div>
          <div className="state-login">
            {lockUntilText || `Số lần thử còn lại: ${remainingAttempts}`}
          </div>
          {message ? <div className="state-login">{message}</div> : null}
          <div className={`login-container-btn ${loading ? "login-disable" : ""}`}>
            <div className="login-btn-login">
              <button onClick={handleUnlock} disabled={loading}>
                {loading ? "Đang xác thực..." : "Mở khóa"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
