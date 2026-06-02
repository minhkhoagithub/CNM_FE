import React, { useState, useContext } from "react";
import UpdateProfileModal from "./UpdateProfileModal";
import { UserContext } from "../../Context/UserContext";
import "../../resource/style/component/setting.css";
import coverimg from "../../resource/img/coverImg/coverimg.jpg";
import { CiEdit } from "react-icons/ci";
import { IoMdClose } from "react-icons/io";
import { CiCamera } from "react-icons/ci";
import { IoChevronBackOutline } from "react-icons/io5";
import { CiSearch } from "react-icons/ci";
import { FiUser } from "react-icons/fi";
import DeviceManager from "./DeviceManager";
import axios from "axios";
import { updateAvatar, updateCoverImage } from "../../util/api";


export default function Setting({ handleShowSetting }) {
  const { userData, setUserData } = useContext(UserContext);
  const [showChoiceAvatar, setShowChoiceAvatar] = useState(false);
  const [showUpdateProfile, setShowUpdateProfile] = useState(false);
  const [activeTab, setActiveTab] = useState("profile"); // "profile" or "devices"
  const [newAvatar, setNewAvatar] = useState("");
  const [dataUpdate, setDataUpdate] = useState({
    avatar: "",
  });
  const listAvatarGr = [
    "https://res.zaloapp.com/pc/avt_group/1_family.jpg",
    "https://res.zaloapp.com/pc/avt_group/2_family.jpg",
    "https://res.zaloapp.com/pc/avt_group/3_family.jpg",
    "https://res.zaloapp.com/pc/avt_group/4_work.jpg",
    "https://res.zaloapp.com/pc/avt_group/5_work.jpg",
    "https://res.zaloapp.com/pc/avt_group/6_work.jpg",
    "https://res.zaloapp.com/pc/avt_group/7_friends.jpg",
    "https://res.zaloapp.com/pc/avt_group/8_friends.jpg",
    "https://res.zaloapp.com/pc/avt_group/9_friends.jpg",
    "https://res.zaloapp.com/pc/avt_group/10_school.jpg",
    "https://res.zaloapp.com/pc/avt_group/11_school.jpg",
    "https://res.zaloapp.com/pc/avt_group/12_school.jpg",
  ];

    // Hàm cập nhật cover image sử dụng API mới
  const handleUpdateCoverImage = async (file) => {
    try {
      if (!file) return;
      const response = await updateCoverImage(file);
      if (response.data && response.data.data) {
        setUserData(response.data.data);
      }
      
    } catch (err) {
      console.error("Lỗi cập nhật ảnh cover:", err);
      alert("Cập nhật ảnh cover thất bại!");
    }
  };

  const handleShowChoiceAvatar = (value) => {
    setShowChoiceAvatar(value);
  };
  const handleChoiceNewAvatar = (item) => {
    setNewAvatar(item);
    setDataUpdate((prevState) => {
      return {
        ...prevState,
        avatar: item,
      };
    });
  };
  const handleChangeDataUpdate = (e) => {
    setDataUpdate((prevState) => {
      return {
        ...prevState,
        [e.target.name]: e.target.value,
      };
    });
  };
  // Hàm cập nhật avatar sử dụng API mới
  const handleUpdateAvatar = async (file) => {
    try {
      if (!file) return;
      const response = await updateAvatar(file);
      if (response.data && response.data.data) {
        setUserData(response.data.data);
        setShowChoiceAvatar(false);
        handleShowSetting(false);
      }
    } catch (err) {
      console.error("Lỗi cập nhật avatar:", err);
      alert("Cập nhật ảnh đại diện thất bại!");
    }
  };

  return (
    <>
      <div className="screen-mask">
        <div className="box-setting">

          <div className="account-infor">
            <div
              className="flex"
              style={{
                justifyContent: "space-between",
                borderBottom: "1px solid #d6dbe1",
              }}
            >
                  <h3>Thông tin tài khoản</h3>
                  {/* <div className="flex">
                    <h3>
                      <IoChevronBackOutline
                        className="icon-back"
                        onClick={() => handleShowChoiceAvatar(false)}
                      />
                      Cập nhật ảnh đại diện
                    </h3>
                  </div> */}
  

              <IoMdClose
                className="btn-close"
                onClick={() => handleShowSetting(false)}
              />
            </div>

            {/* Profile Tab Content */}
            {activeTab === "profile" && (
              <>
                {!showChoiceAvatar ? (
                  <div>
                    <div className="account-infor">
                      <div className="cover-img" style={{ position: 'relative' }}>
                        <img src={userData.coverUrl || coverimg} alt="cover" style={{ width: '100%', height: 180, objectFit: 'cover' }} />
                        {/* Input file ẩn để chọn ảnh cover mới */}
                        <input
                          type="file"
                          accept="image/*"
                          id="cover-upload-input"
                          style={{ display: "none",  }}
                          onChange={e => {
                            if (e.target.files && e.target.files[0]) {
                              handleUpdateCoverImage(e.target.files[0]);
                            }
                          }}
                        />
                        <CiCamera
                          className="icon-camera-cover"
                          onClick={() => document.getElementById("cover-upload-input").click()}
                        />
                      </div>

                      <div className="avatar-img">
                        {userData.avatar ? (
                          <img src={userData.avatar} alt="" />
                        ) : (
                          <div className="default-avatar-container">
                            <FiUser className="default-avatar-icon" />
                          </div>
                        )}
                        <div
                          className="flex"
                          style={{
                            justifyContent: "center",
                            alignContent: "center",
                            alignItems: "center",
                            cursor: "pointer",
                          }}
                        >
                          <div className="flex" style={{ flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
                            <p className="username" style={{ marginBottom: 4 }}>{userData.displayName}</p>
                          </div>
                        </div>
                      </div>
                      {/* Input file ẩn để chọn ảnh mới */}
                      <input
                        type="file"
                        accept="image/*"
                        id="avatar-upload-input"
                        style={{ display: "none" }}
                        onChange={e => {
                          if (e.target.files && e.target.files[0]) {
                            handleUpdateAvatar(e.target.files[0]);
                          }
                        }}
                      />
                      <CiCamera
                        className="icon-camera"
                        style={{ cursor: "pointer" }}
                        onClick={() => document.getElementById("avatar-upload-input").click()}
                      />
                    </div>
                    <div className="user-infor">
                      <h3>Thông tin cá nhân</h3>
                      <div>
                        <table>
                          <tbody>
                            <tr>
                              <td>Giới tính</td>
                              <td>{userData.gender === "male" ? "Nam" : userData.gender === "female" ? "Nữ" : "Khác"}</td>
                            </tr>
                            <tr>
                              <td>Ngày sinh</td>
                              <td>{userData.dob}</td>
                            </tr>
                            <tr>
                              <td>Điện thoại</td>
                              <td>{userData.phone}</td>
                            </tr>
                          </tbody>
                        </table>
                        <p
                          style={{
                            color: "#7589a3",
                            margin: "10px 20px",
                            fontSize: "13px",
                          }}
                        >
                          Chỉ bạn bè có lưu số của bạn trong danh bạ máy xem được số
                          này
                        </p>
                      </div>
                      <div>
                        <div
                          style={{
                            paddingTop: "10px",
                            borderTop: "1px solid rgb(202, 199, 200)",
                            width: "350px",
                            margin: "auto",
                          }}
                        >
                          <div className="wrap-btn-update flex" onClick={() => setShowUpdateProfile(true)} style={{cursor: 'pointer'}}>
                            <p className="btn-update" style={{ fontWeight: 500 }}>
                              Cập nhật
                            </p>
                            <CiEdit className="icon-edit" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="change-avatar">
                    <div className="input-number-group">
                      <CiSearch className="icon-search" />
                      <input
                        type="text"
                        placeholder="Nhập url hình ảnh"
                        name="avatar"
                        value={dataUpdate.avatar}
                        onChange={handleChangeDataUpdate}
                      />
                    </div>
                    <div>
                      <ul className="ex-avatar flex">
                        {listAvatarGr?.map((item, index) => (
                          <li key={index}>
                            <img
                              src={item}
                              alt=""
                              className={
                                item === newAvatar ? "ex-avatar-choice" : ""
                              }
                              onClick={() => handleChoiceNewAvatar(item)}
                            />
                          </li>
                        ))}
                      </ul>
                      <div className="btn-find-friend flex">
                        <button onClick={() => handleShowChoiceAvatar(false)}>
                          Hủy
                        </button>
                        <button
                          onClick={handleUpdateAvatar}
                          style={{ backgroundColor: "#0068ff", color: "white" }}
                        >
                          Cập nhật
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Devices Tab Content */}
            {activeTab === "devices" && (
              <div style={{ padding: "0 15px" }}>
                <DeviceManager />
              </div>
            )}
          </div>
        </div>
      </div>
    {showUpdateProfile && <UpdateProfileModal onClose={() => setShowUpdateProfile(false)} />}
    </>
  );
}
