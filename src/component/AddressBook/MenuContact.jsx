import React, { useEffect, useState, useContext, useRef, memo } from "react";
import { UserContext } from "../../Context/UserContext";
import { ContactContext } from "../../Context/ContactConext";
import "../../resource/style/Chat/contact.css";
import "../../resource/style/AddressBook/menuContact.css";
import { CiSearch } from "react-icons/ci";
import { HiOutlineUsers, HiOutlineUserPlus, HiOutlineUserGroup } from "react-icons/hi2";
import { IoMdClose } from "react-icons/io";
import { IoTriangle } from "react-icons/io5";
import { BsFillCameraFill } from "react-icons/bs";
import {
  getFriendByName,
  getAllGroup,
  getFriendRes,
  getGroupReq,
  getUserByPhone,
  crudFriend,
  getAllFriend,
} from "../../util/api/index.jsx";
import { createConversationV1 } from "../../services/chat/conversationApi";
import { mapConversation } from "../../mappers/conversationMapper";

export const LoiMoiKetBan = "Loi moi ket ban";
export const LoiMoiVaoNhom = "Loi moi vao nhom";
export const DanhSachBanBe = "Danh sach ban be";
export const DanhSachNhom = "Danh sach nhom";

function MenuContact({ handleChangeContact, handleSetContentMenuContact }) {
  const initialRecentSearch = (() => {
    try {
      const local = localStorage.getItem("user-search");
      return local ? JSON.parse(local) : [];
    } catch {
      return [];
    }
  })();
  const listMenu = [
    { title: DanhSachBanBe, icon: <HiOutlineUsers /> },
    { title: DanhSachNhom, icon: <HiOutlineUserGroup /> },
    { title: LoiMoiKetBan, icon: <HiOutlineUserPlus /> },
    { title: LoiMoiVaoNhom, icon: <HiOutlineUserGroup /> },
  ];
  const [textSearch, setTextSearch] = useState("");
  const [isSearch, setIsSearch] = useState({
    state: false,
    recent: true,
    response: false,
  });
  const [dataSearch, setDataSearch] = useState({
    recent: initialRecentSearch,
    response: [],
  });
  const [addUser, setAddUser] = useState({
    friend: false,
    group: false,
  });
  const [dataUserPhone, setDataUserPhone] = useState({
    username: "",
    show: false,
    data: null,
    state: null,
    cancel: null,
    unfriend: null,
    checkId: null,
  });
  const [dataCreateGr, setDataCreateGr] = useState({
    username: "",
    listMember: [],
    showAvt: false,
    avatar: null,
  });
  const [friendOptions, setFriendOptions] = useState([]);
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
  const { userData } = useContext(UserContext);
  const { upsertConversation, fetchConversation } = useContext(ContactContext);
  const searchTimeout = useRef(null);

  useEffect(() => {
    const fetchFriendOptions = async () => {
      if (!userData?._id) {
        return;
      }

      try {
        const response = await getAllFriend({ id: userData._id });
        const nextFriends = Array.isArray(response?.data)
          ? response.data.map((friend) => ({
              userId: friend.userId || friend._id,
              displayName:
                friend.username || friend.displayName || friend.name || friend.phone,
              avatarUrl: friend.avatar || friend.avatarUrl || "",
            }))
          : [];
        setFriendOptions(nextFriends.filter((friend) => friend.userId));
      } catch (error) {
        console.error("Failed to load friend options:", error);
      }
    };

    fetchFriendOptions();
  }, [userData?._id]);

  const handleSearchDb = (value) => {
    if (value !== "") {
      if (searchTimeout.current) {
        clearTimeout(searchTimeout.current);
      }
      searchTimeout.current = setTimeout(async () => {
        const response = await getFriendByName({
          friendName: value,
          userId: userData._id,
        });
        setDataSearch((prevState) => ({
          ...prevState,
          response: response.status === 200 ? response.data : [],
        }));
        setIsSearch((prevState) => ({
          ...prevState,
          response: true,
          recent: false,
        }));
      }, 300);
    }
  };

  const handleChangeTextSearch = (e) => {
    const value = e.target.value;
    setTextSearch(value);
    if (value === "") {
      clearTimeout(searchTimeout.current);
      setIsSearch((prevState) => ({
        ...prevState,
        recent: true,
        response: false,
      }));
    }
    handleSearchDb(value);
  };

  const handleChangeIsSearch = (value) => {
    setIsSearch((prevState) => ({
      ...prevState,
      state: value,
    }));
    if (!value) {
      setTextSearch("");
    }
  };

  const storeLocal = (value) => {
    const nextRecent = [
      value,
      ...dataSearch.recent.filter((item) => item._id !== value._id),
    ];
    setDataSearch((prevState) => ({
      ...prevState,
      recent: nextRecent,
    }));
    localStorage.setItem("user-search", JSON.stringify(nextRecent));
  };

  const handleChoiceContact = (value) => {
    storeLocal(value);
    handleChangeContact({ ...value, userId: value?.userId || value?._id });
    setIsSearch((prevState) => ({
      ...prevState,
      state: false,
    }));
    setTextSearch("");
  };

  const handleShowAddFriend = (value) => {
    setAddUser((prevState) => ({
      ...prevState,
      friend: value,
    }));

    if (!value) {
      setDataUserPhone({
        username: "",
        show: false,
        data: null,
        state: null,
        cancel: null,
        unfriend: null,
        checkId: null,
      });
    }
  };

  const handleShowAddGroup = (value) => {
    setAddUser((prevState) => ({
      ...prevState,
      group: value,
    }));
  };

  const handleAddMember = (value) => {
    setDataCreateGr((prevState) => {
      const exists = prevState.listMember.includes(value);
      return {
        ...prevState,
        listMember: exists
          ? prevState.listMember.filter((item) => item !== value)
          : [value, ...prevState.listMember],
      };
    });
  };

  const handleCreateGroup = async () => {
    handleShowAddGroup(false);

    try {
      const response = await createConversationV1({
        type: "GROUP",
        name: dataCreateGr.username,
        participantIds: dataCreateGr.listMember,
      });
      const nextConversation = mapConversation(response);
      upsertConversation(nextConversation);
      handleChangeContact(nextConversation);
    } catch (error) {
      console.error("Failed to create group conversation:", error);
    }

    setDataCreateGr({
      username: "",
      listMember: [],
      showAvt: false,
      avatar: null,
    });
  };

  const handleShowAvatarGr = (value) => {
    setDataCreateGr((prevState) => ({
      ...prevState,
      showAvt: value,
    }));
  };

  const handleChoiceAvatarGr = (value) => {
    setDataCreateGr((prevState) => ({
      ...prevState,
      avatar: value,
    }));
  };

  const handleChangURl = (e) => {
    setDataCreateGr((prevState) => ({
      ...prevState,
      avatar: e.target.value,
    }));
  };

  const handleSaveAvatarGr = () => {
    if (dataCreateGr.avatar !== null) {
      handleShowAvatarGr(false);
    }
  };

  const handleChangeNameGr = (e) => {
    setDataCreateGr((prevState) => ({
      ...prevState,
      username: e.target.value,
    }));
  };

  const handleChangePhone = (e) => {
    setDataUserPhone((prevState) => ({
      ...prevState,
      username: e.target.value,
    }));
  };

  const handleFindUserByPhone = async () => {
    if (dataUserPhone.username !== "") {
      const response = await getUserByPhone({
        phone: dataUserPhone.username,
        id: userData._id,
      });
      if (response.status === 200) {
        setDataUserPhone({
          username: "",
          show: true,
          data: response.data.data,
          state: response.data.state,
          cancel: response.data.cancel ? response.data.cancel : null,
          unfriend: response.data.unfriend ? response.data.unfriend : null,
          checkId: response.data.data?._id || null,
        });
      } else {
        setDataUserPhone({
          username: "",
          show: false,
          data: null,
          state: response.data.state,
          cancel: null,
          unfriend: null,
          checkId: null,
        });
      }
    }
  };

  const handleCRUDFriend = async (friendId, state) => {
    const response = await crudFriend({
      userId: userData._id,
      friendId,
      state,
    });

    if (response.status === 200) {
      fetchConversation();
    }
  };

  const handleFetchDataUser = async (title) => {
    if (title === DanhSachBanBe) {
      const response = await getAllFriend({ id: userData._id });
      if (response.status === 200 || response.status === 204) {
        handleSetContentMenuContact({
          state: true,
          data: response.data,
          title: DanhSachBanBe,
          count: `Ban be (${response.data?.length || 0})`,
        });
      }
    } else if (title === DanhSachNhom) {
      const response = await getAllGroup({ id: userData._id });
      if (response.status === 200 || response.status === 204) {
        handleSetContentMenuContact({
          state: true,
          data: response.data,
          title: DanhSachNhom,
          count: `Nhom (${response.data?.length || 0})`,
        });
      }
    } else if (title === LoiMoiKetBan) {
      const response = await getFriendRes({ id: userData._id });
      if (response.status === 200 || response.status === 204) {
        handleSetContentMenuContact({
          state: true,
          data: response.data,
          title: LoiMoiKetBan,
          count: `Loi moi ket ban (${response.data?.length || 0})`,
        });
      }
    } else if (title === LoiMoiVaoNhom) {
      const response = await getGroupReq({ id: userData._id });
      if (response.status === 200 || response.status === 204) {
        handleSetContentMenuContact({
          state: true,
          data: response.data,
          title: LoiMoiVaoNhom,
          count: `Loi moi vao nhom (${response.data?.length || 0})`,
        });
      }
    }
  };

  return (
    <>
      <div className="contact-container-contact">
        <div className="contact-contact-search ">
          <div className="flex">
            <div className="contact-group-search flex">
              <CiSearch className="icon-search" />
              <input
                type="text"
                value={textSearch}
                onChange={handleChangeTextSearch}
                placeholder="Tim kiem"
                onClick={() => handleChangeIsSearch(true)}
              />
            </div>
            {isSearch.state ? (
              <div className="btn-close-search">
                <p onClick={() => handleChangeIsSearch(false)}>Dong</p>
              </div>
            ) : (
              <div className="contact-group-add-user flex">
                <HiOutlineUserPlus
                  className="icon-user-contact"
                  onClick={() => handleShowAddFriend(true)}
                />
                <HiOutlineUsers
                  className="icon-user-contact"
                  onClick={() => handleShowAddGroup(true)}
                />
              </div>
            )}
            <div className="add-friend-group">
              {addUser.friend ? (
                <div className="screen-mask">
                  <div className="wrap-add">
                    <div className="header-add-friend flex">
                      <p>Them ban</p>
                      <IoMdClose
                        className="btn-close"
                        onClick={() => handleShowAddFriend(false)}
                      />
                    </div>
                    <div className="add-by-phone">
                      <div className="phone-friend flex">
                        <div className="img-phone flex">
                          <span></span>
                          <p>(+84)</p>
                          <IoTriangle
                            style={{
                              color: "#7589a3",
                              fontSize: "11px",
                              transform: "rotate(60deg)",
                              margin: "auto 10px",
                            }}
                          />
                        </div>
                        <div className="input-number">
                          <input
                            type="text"
                            value={dataUserPhone.username}
                            onChange={handleChangePhone}
                            placeholder="So dien thoai"
                          />
                        </div>
                      </div>
                      <div className="recent-result">
                        <p>Ket qua</p>
                        {dataUserPhone.state && dataUserPhone.state.length > 20 ? (
                          <p>{dataUserPhone.state}</p>
                        ) : null}
                      </div>
                      {dataUserPhone.data !== null ? (
                        <div className="wrap-result-phone flex">
                          <div className="flex" style={{ maxWidth: "200px" }}>
                            <img src={dataUserPhone.data.avatar} alt="" />
                            <div>
                              <p className="username ">{dataUserPhone.data.username}</p>
                              <p className="phone">{dataUserPhone.data.phone}</p>
                            </div>
                          </div>
                          <div>
                            {dataUserPhone.cancel ? (
                              <button
                                style={{ backgroundColor: "#eaedf0", color: "black" }}
                                onClick={() =>
                                  handleCRUDFriend(
                                    dataUserPhone.data._id,
                                    dataUserPhone.cancel
                                  )
                                }
                              >
                                {dataUserPhone.cancel}
                              </button>
                            ) : null}
                            {dataUserPhone.unfriend ? (
                              <button
                                style={{ backgroundColor: "#eaedf0", color: "black" }}
                                onClick={() =>
                                  handleCRUDFriend(
                                    dataUserPhone.data._id,
                                    dataUserPhone.unfriend
                                  )
                                }
                              >
                                {dataUserPhone.unfriend}
                              </button>
                            ) : null}
                            <button
                              onClick={() =>
                                handleCRUDFriend(dataUserPhone.data._id, dataUserPhone.state)
                              }
                            >
                              {dataUserPhone?.state}
                            </button>
                          </div>
                        </div>
                      ) : null}
                      <div className="btn-find-friend flex">
                        <button onClick={() => handleShowAddFriend(false)}>Huy</button>
                        <button
                          style={{ backgroundColor: "#0068ff", color: "white" }}
                          onClick={handleFindUserByPhone}
                        >
                          Tim kiem
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
              {dataCreateGr.showAvt ? (
                <div className="screen-mask" style={{ zIndex: 1001 }}>
                  <div className="choice-avatar-gr">
                    <div className="header-add-friend flex">
                      <p>Cap nhat anh dai dien</p>
                      <IoMdClose
                        className="btn-close"
                        onClick={() => handleShowAvatarGr(false)}
                      />
                    </div>
                    <div className="input-number-group">
                      <CiSearch className="icon-search" />
                      <input
                        type="text"
                        placeholder="Nhap url hinh anh"
                        value={dataCreateGr.avatar || ""}
                        onChange={handleChangURl}
                      />
                    </div>
                    <div>
                      <ul className="ex-avatar flex">
                        {listAvatarGr.map((item) => (
                          <li key={item} onClick={() => handleChoiceAvatarGr(item)}>
                            <img
                              src={item}
                              alt=""
                              className={item === dataCreateGr.avatar ? "ex-avatar-choice" : ""}
                            />
                          </li>
                        ))}
                      </ul>
                      <div className="btn-find-friend flex" style={{ position: "relative" }}>
                        <button onClick={() => handleShowAvatarGr(false)}>Huy</button>
                        <button
                          onClick={handleSaveAvatarGr}
                          style={{ backgroundColor: "#0068ff", color: "white" }}
                        >
                          Cap nhat
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
              {addUser.group ? (
                <div className="screen-mask">
                  <div className="wrap-add wrap-add-group">
                    <div className="header-add-friend flex">
                      <p>Tao nhom</p>
                      <IoMdClose
                        className="btn-close"
                        onClick={() => handleShowAddGroup(false)}
                      />
                    </div>
                    <div className="add-by-phone">
                      <div className="phone-group flex">
                        {dataCreateGr.avatar ? (
                          <img
                            src={dataCreateGr.avatar}
                            onClick={() => handleShowAvatarGr(true)}
                          />
                        ) : (
                          <BsFillCameraFill
                            className="avatar-group"
                            onClick={() => handleShowAvatarGr(true)}
                          />
                        )}
                        <div className="input-number group">
                          <input
                            type="text"
                            placeholder="Nhap ten nhom"
                            onChange={handleChangeNameGr}
                            value={dataCreateGr.username}
                          />
                        </div>
                      </div>
                      <div className="list-contact">
                        {friendOptions.map((item) => (
                          <li key={item.userId} onClick={() => handleAddMember(item.userId)}>
                            <div className="contact-detial-conversation flex">
                              <div className="flex">
                                <div className="checkbox-add">
                                  <input
                                    type="button"
                                    className={`${
                                      dataCreateGr.listMember.includes(item.userId)
                                        ? "active"
                                        : ""
                                    }`}
                                  />
                                </div>
                                <div className="contact-avatar-friend">
                                  <img src={item.avatarUrl} alt="" />
                                </div>
                                <div className="contact-overview-mess">
                                  <h3>{item.displayName}</h3>
                                </div>
                              </div>
                            </div>
                          </li>
                        ))}
                      </div>
                      <div className="btn-find-friend flex">
                        <button onClick={() => handleShowAddGroup(false)}>Huy</button>
                        <button
                          onClick={handleCreateGroup}
                          style={{
                            backgroundColor: "#0068ff",
                            width: "125px",
                            color: "white",
                          }}
                        >
                          Tao nhom
                          {dataCreateGr.listMember.length > 0
                            ? ` (${dataCreateGr.listMember.length})`
                            : ""}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        {isSearch.state ? (
          <div className="recent-search">
            <ul className="wrap-recent-search">
              {isSearch.recent ? (
                <div>
                  <p style={{ margin: "10px 0 10px 20px", fontWeight: "500" }}>
                    Tim gan day
                  </p>
                  <div className="wrap-result-search">
                    {dataSearch.recent.map((item, index) => (
                      <li key={index} onClick={() => handleChoiceContact(item)}>
                        <div className="flex">
                          <img src={item.avatar || item.avatarUrl} alt="" />
                          <p>{item.username || item.displayName}</p>
                        </div>
                      </li>
                    ))}
                  </div>
                </div>
              ) : null}

              {isSearch.response ? (
                <div>
                  <div className="wrap-result-search">
                    {Array.isArray(dataSearch.response)
                      ? dataSearch.response.map((item, index) => (
                          <li key={index} onClick={() => handleChoiceContact(item)}>
                            <div className="flex">
                              <img src={item.avatar || item.avatarUrl} alt="" />
                              <p>{item.username || item.displayName}</p>
                            </div>
                          </li>
                        ))
                      : null}
                  </div>
                </div>
              ) : null}
            </ul>
          </div>
        ) : null}
        {!isSearch?.state ? (
          <div className="menu-contact">
            <ul>
              {listMenu.map((item, index) => (
                <li
                  key={index}
                  className="flex"
                  onClick={() => handleFetchDataUser(item.title)}
                >
                  <div className="icon-contact">{item.icon}</div>
                  <p>{item.title}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </>
  );
}

export default memo(MenuContact);
