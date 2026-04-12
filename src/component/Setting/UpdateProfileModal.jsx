import React, { useState, useContext } from "react";
import { UserContext } from "../../Context/UserContext";
import { updateUserProfile } from "../../util/api";
import "../../resource/style/component/setting.css";
import { IoMdClose } from "react-icons/io";

export default function UpdateProfileModal({ onClose }) {
  const { userData, setUserData } = useContext(UserContext);
  const [form, setForm] = useState({
    firstName: userData.firstName || "",
    lastName: userData.lastName || "",
    displayName: userData.displayName || userData.username || "",
    gender: userData.gender || "",
    dob: userData.dob || "",
    phone: userData.phone || "",
    bio: userData.bio || "",
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await updateUserProfile(form);
      // console.log("res", res);
      
      if (res && res.data && res.data.data) {
        setUserData(res.data.data);
      }
      setLoading(false);
      onClose();
    } catch (err) {
      setLoading(false);
      alert("Cập nhật thất bại!");
    }
  };

  return (
    <div className="modal-overlay update-profile-overlay">
      <div className="modal-content update-profile-modal">
        <div className="modal-header">
          <h2>Cập nhật thông tin cá nhân</h2>
          <IoMdClose className="btn-close" onClick={onClose} />
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Họ tên</label>
            <input
              type="text"
              name="displayName"
              value={form.displayName}
              onChange={handleChange}
              required
            />
          </div>
          <div className="form-group">
            <label>Giới tính</label>
            <select name="gender" value={form.gender} onChange={handleChange}>
              <option value="">Chọn</option>
              <option value="male">Nam</option>
              <option value="female">Nữ</option>
              <option value="other">Khác</option>
            </select>
          </div>
          <div className="form-group">
            <label>Ngày sinh</label>
            <input
              type="date"
              name="dob"
              value={form.dob}
              onChange={handleChange}
            />
          </div>
          <div className="form-group">
            <label>Số điện thoại</label>
            <input
              type="text"
              name="phone"
              value={form.phone}
              onChange={handleChange}
              required
            />
          </div>
          <div className="form-group">
            <label>Bio</label>
            <input
              type="text"
              name="bio"
              value={form.bio}
              onChange={handleChange}
              placeholder="Giới thiệu bản thân"
            />
          </div>
          {/* Avatar field removed as requested */}
          <div className="form-actions">
            <button type="button" onClick={onClose} className="btn-cancel">
              Hủy
            </button>
            <button type="submit" className="btn-update" disabled={loading}>
              {loading ? "Đang lưu..." : "Cập nhật"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
