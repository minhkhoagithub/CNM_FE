import React, {
  useEffect,
  useState,
  useContext,
  useRef,
  memo,
  useMemo,
} from "react";
import { UserContext } from "../../Context/UserContext";
import { ContactContext } from "../../Context/ContactConext";
import "../../resource/style/Chat/contact.css";
import { CiSearch } from "react-icons/ci";
import { HiOutlineUserPlus } from "react-icons/hi2";
import { HiOutlineUserGroup } from "react-icons/hi2";
import { MdExpandMore } from "react-icons/md";
import { IoIosMore } from "react-icons/io";
import { IoMdClose } from "react-icons/io";
import { IoTriangle } from "react-icons/io5";
import { BsFillCameraFill } from "react-icons/bs";
import { RxDotFilled } from "react-icons/rx";
import {
  createConversationV1,
  updateConversationArchiveV1,
  updateConversationMuteV1,
  updateConversationPinV1,
} from "../../services/chat/conversationApi";
import { mapConversation } from "../../mappers/conversationMapper";
import "../../resource/style/AddressBook/menuContact.css";
import {
  crudFriend,
  getUserByPhone,
  searchUsersV2,
  sendFriendRequestV2,
} from "../../util/api";

const mapSearchUserToUi = (item) => ({
  _id: item.userId,
  userId: item.userId,
  displayName: item.displayName || item.username,
  username: item.username || item.displayName,
  avatarUrl: item.avatarUrl || "",
  avatar: item.avatarUrl || "",
  relationshipStatus: item.relationshipStatus || "NONE",
});
const getFriendActionMeta = (relationshipStatus) => {
  switch (relationshipStatus) {
    case "FRIEND":
      return { label: "Ban be", disabled: true };
    case "REQUEST_SENT":
      return { label: "Da gui loi moi", disabled: true };
    case "REQUEST_RECEIVED":
      return { label: "Da nhan loi moi", disabled: true };
    default:
      return { label: "Ket ban", disabled: false };
  }
};


const getUnreadConversationCount = (conversation) =>
  Number(conversation?.unreadCount || 0);

const getConversationDisplayName = (conversation) =>
  conversation?.displayName || conversation?.trustedDisplayName || conversation?.title || "";

const getConversationAvatarUrl = (conversation) =>
  conversation?.avatarUrl || conversation?.trustedAvatarUrl || conversation?.avatar || "";

const getConversationPreview = (conversation) =>
  conversation?.lastMessage || `Gui loi chao den ${getConversationDisplayName(conversation)}`;

function Contact({
  handleChangeContact,
  showPageAddressBook,
}) {
  const [textSearch, setTextSearch] = useState("");
  const [isSearch, setIsSearch] = useState({
    state: false,
    recent: true,
    response: false,
  });
  const [dataSearch, setDataSearch] = useState({
    recent: [],
    response: [],
  });
  const [addUser, setAddUser] = useState({
    friend: false,
    group: false,
  });
  const [allMessActive, setAllMessActive] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [conversationSettingsError, setConversationSettingsError] = useState("");
  const [pendingConversationId, setPendingConversationId] = useState(null);

  const [dataUserPhone, setDataUserPhone] = useState({
    username: "",
    show: false,
    data: null,
    state: null,
    cancel: null,
    unfriend: null,
    checkId: null,
  });
  const [friendSearch, setFriendSearch] = useState({
  keyword: "",
  loading: false,
  searched: false,
  results: [],
  error: "",
});

  const [dataCreateGr, setDataCreateGr] = useState({
    username: null,
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
  const {
    conversations,
    fetchConversation,
    fetchArchivedConversations,
    upsertConversation,
    archivedConversations,
    selectedConversationId,
    updateConversationById,
  } = useContext(ContactContext);
  const { userData } = useContext(UserContext);
  const getRecentSearchStorageKey = (userId) =>
  `message-user-search:${userId || "guest"}`;

const getSearchItemId = (item) => item?.userId || item?._id || item?.id || null;

  const searchTimeout = useRef(null);
  const displayedConversationList = showArchived ? archivedConversations : conversations;
  const displayedConversationListNotSeen = useMemo(
    () =>
      displayedConversationList.filter(
        (item) => getUnreadConversationCount(item) > 0
      ),
    [displayedConversationList]
  );

  // useEffect(() => {
  //   const local = localStorage.getItem("user-search");
  //   if (local !== null) {
  //     setDataSearch((prevState) => {
  //       return {
  //         ...prevState,
  //         recent: JSON.parse(local),
  //       };
  //     });
  //   }
  // }, []);
  useEffect(() => {
  try {
    const userId = userData?._id || userData?.userId || "guest";
    const storageKey = getRecentSearchStorageKey(userId);
    const local = localStorage.getItem(storageKey);

    setDataSearch((prevState) => ({
      ...prevState,
      recent: local ? JSON.parse(local) : [],
    }));
  } catch {
    setDataSearch((prevState) => ({
      ...prevState,
      recent: [],
    }));
  }
}, [userData?._id, userData?.userId]);


  useEffect(() => {
    if (textSearch === "") {
      clearTimeout(searchTimeout.current);
      setIsSearch((prevState) => {
        return {
          ...prevState,
          recent: true,
          response: false,
        };
      });
    }
  }, [textSearch]);

  // const handleSearchDb = (value) => {
  //   if (value !== "") {
  //     if (searchTimeout.current) {
  //       clearTimeout(searchTimeout.current);
  //     }
  //     searchTimeout.current = setTimeout(async () => {
  //       const response = await getFriendByName({
  //         friendName: value,
  //         userId: userData._id,
  //       });
  //       if (response.status === 200) {
  //         setDataSearch((prevState) => {
  //           return {
  //             ...prevState,
  //             response: response.data,
  //           };
  //         });
  //       } else {
  //         setDataSearch((prevState) => {
  //           return {
  //             ...prevState,
  //             response: [],
  //           };
  //         });
  //       }
  //       setIsSearch((prevState) => {
  //         return {
  //           ...prevState,
  //           response: true,
  //           recent: false,
  //         };
  //       });
  //     }, 300);
  //   }
  // };

const handleSearchDb = (value) => {
  if (value !== "") {
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }

    searchTimeout.current = setTimeout(async () => {
      const response = await searchUsersV2({ keyword: value });

      const nextResults = Array.isArray(response.data)
        ? response.data
            .filter((item) => item.relationshipStatus === "FRIEND")
            .map(mapSearchUserToUi)
        : [];

      setDataSearch((prevState) => {
        return {
          ...prevState,
          response: nextResults,
        };
      });

      setIsSearch((prevState) => {
        return {
          ...prevState,
          response: true,
          recent: false,
        };
      });
    }, 300);
  }
};


  const handleChangeTextSearch = (e) => {
    let data = e.target.value;
    setTextSearch(data);
    handleSearchDb(data);
  };

  const handleChangeShowMessSeen = (value) => {
    setAllMessActive(value);
  };

  const handleChangeIsSearch = (value) => {
    setIsSearch((prevState) => {
      return {
        ...prevState,
        state: value,
      };
    });
    if (!value) {
      setTextSearch("");
    }
  };

  const handleToggleArchivedView = async () => {
    setConversationSettingsError("");

    if (!showArchived) {
      try {
        await fetchArchivedConversations();
      } catch (error) {
        console.error("Failed to load archived conversations:", error);
        setConversationSettingsError("Khong the tai danh sach luu tru.");
        return;
      }
    }

    setShowArchived((prevState) => !prevState);
  };

  const handleConversationSettingChange = async (event, conversation, action) => {
    event.stopPropagation();

    const conversationId = conversation?.id;
    if (!conversationId) {
      return;
    }

    setConversationSettingsError("");
    setPendingConversationId(conversationId);

    try {
      if (action === "pin") {
        const nextPinned = !conversation.pinned;
        await updateConversationPinV1(conversationId, nextPinned);
        updateConversationById(conversationId, { pinned: nextPinned });
      }

      if (action === "archive") {
        const nextArchived = !conversation.archived;
        await updateConversationArchiveV1(conversationId, nextArchived);
        updateConversationById(conversationId, { archived: nextArchived });
      }

      if (action === "mute") {
        const nextMuted = !conversation.muted;
        await updateConversationMuteV1(conversationId, nextMuted);
        updateConversationById(conversationId, { muted: nextMuted });
      }
    } catch (error) {
      console.error("Failed to update conversation setting:", error);
      setConversationSettingsError("Khong the cap nhat thiet lap hoi thoai.");
    } finally {
      setPendingConversationId(null);
    }
  };

  // const handleChoiceContact = (value) => {
  //   storeLocal(value);
  //   handleChangeContact({ ...value, userId: userData._id });
  //   setIsSearch((prevState) => {
  //     return {
  //       ...prevState,
  //       state: false,
  //     };
  //   });
  //   setTextSearch("");
  // };

  const handleChoiceContact = (value) => {
  storeLocal(value);
  console.log("Selected contact:", value);
  handleChangeContact({
    ...value,
    userId: value?.userId || value?._id,
  });
  setIsSearch((prevState) => {
    return {
      ...prevState,
      state: false,
    };
  });
  setTextSearch("");
};


  // const storeLocal = (value) => {
  //   setDataSearch((prevState) => {
  //     const filterRecent = prevState.recent.filter((x) => x._id !== value._id);
  //     return {
  //       response: prevState.response,
  //       recent: [value, ...filterRecent],
  //     };
  //   });
  //   localStorage.setItem("user-search", JSON.stringify(dataSearch.recent));
  // };

const storeLocal = (value) => {
  const userId = userData?._id || userData?.userId || "guest";
  const storageKey = getRecentSearchStorageKey(userId);
  const selectedId = getSearchItemId(value);

  const nextRecent = [
    value,
    ...dataSearch.recent.filter((item) => getSearchItemId(item) !== selectedId),
  ].slice(0, 10);

  setDataSearch((prevState) => ({
    ...prevState,
    recent: nextRecent,
  }));

  localStorage.setItem(storageKey, JSON.stringify(nextRecent));
};



  // const handleShowAddFriend = (value) => {
  //   setAddUser((prevState) => {
  //     return {
  //       ...prevState,
  //       friend: value,
  //     };
  //   });

  //   if (!value) {
  //     setDataUserPhone({
  //       username: "",
  //       show: false,
  //       data: null,
  //       state: null,
  //       cancel: null,
  //     });
  //   }
  // };

  const handleShowAddFriend = (value) => {
  setAddUser((prevState) => ({
    ...prevState,
    friend: value,
  }));

  if (!value) {
    setFriendSearch({
      keyword: "",
      loading: false,
      searched: false,
      results: [],
      error: "",
    });
  }
};


  const handleShowAddGroup = (value) => {
    setAddUser((prevState) => {
      return {
        ...prevState,
        group: value,
      };
    });
  };

  const handleAddMember = (value) => {
    setDataCreateGr((prevState) => {
      if (prevState.listMember.length < 0) {
        return {
          ...prevState,
          listMember: [value],
        };
      } else {
        const check = prevState.listMember.includes(value);
        if (check) {
          const filter = prevState.listMember.filter((item) => item !== value);
          return {
            ...prevState,
            listMember: [...filter],
          };
        } else {
          return {
            ...prevState,
            listMember: [value, ...prevState.listMember],
          };
        }
      }
    });
  };

  const handleCreateGroup = async () => {
    handleShowAddGroup(false);

    const response = await createConversationV1({
      type: "GROUP",
      name: dataCreateGr.username,
      participantIds: dataCreateGr.listMember,
    });
    upsertConversation(mapConversation(response));
    setDataCreateGr({
      username: null,
      listMember: [],
      showAvt: false,
      avatar: null,
    });
  };

  const handleShowAvatarGr = (value) => {
    setDataCreateGr((prevState) => {
      return {
        ...prevState,
        showAvt: value,
      };
    });
  };

  const handleChoiceAvatarGr = (value) => {
    setDataCreateGr((prevState) => {
      return {
        ...prevState,
        avatar: value,
      };
    });
  };

  const handleChangURl = (e) => {
    setDataCreateGr((prevState) => {
      return {
        ...prevState,
        avatar: e.target.value,
      };
    });
  };

  const handleSaveAvatarGr = () => {
    if (dataCreateGr.avatar !== null) {
      handleShowAvatarGr(false);
    }
  };
  const handleChangeNameGr = (e) => {
    setDataCreateGr((prevState) => {
      return {
        ...prevState,
        username: e.target.value,
      };
    });
  };
  // const handleChangePhone = (e) => {
  //   setDataUserPhone((prevState) => {
  //     return {
  //       ...prevState,
  //       username: e.target.value,
  //     };
  //   });
  // };
  const handleChangeSearchKeyword = (e) => {
  setFriendSearch((prevState) => ({
    ...prevState,
    keyword: e.target.value,
    error: "",
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
        });
      } else {
        setDataUserPhone({
          username: "",
          show: false,
          data: null,
          state: response.data.state,
          cancel: null,
          unfriend: null,
        });
      }
    }
  };

  const handleFindUsersForAddFriend = async () => {
  const keyword = friendSearch.keyword.trim();

  if (!keyword) {
    setFriendSearch((prevState) => ({
      ...prevState,
      searched: true,
      results: [],
      error: "Vui long nhap ten, username, ho ten hoac so dien thoai",
    }));
    return;
  }

  setFriendSearch((prevState) => ({
    ...prevState,
    loading: true,
    searched: false,
    error: "",
  }));

  try {
    const response = await searchUsersV2({ keyword });

    const results = Array.isArray(response.data)
      ? response.data.map(mapSearchUserToUi)
      : [];

    setFriendSearch((prevState) => ({
      ...prevState,
      loading: false,
      searched: true,
      results,
      error: "",
    }));
  } catch (error) {
    console.error("Failed to search users for add friend:", error);

    setFriendSearch((prevState) => ({
      ...prevState,
      loading: false,
      searched: true,
      results: [],
      error: "Khong the tim kiem luc nay",
    }));
  }
};

  const handleCRUDFriend = async (friendId, state) => {
    const response = await crudFriend({
      userId: userData._id,
      friendId: friendId,
      state: state,
    });

    if (response.status === 200) {
      fetchConversation();
    }
  };
  const handleSendFriendRequestFromSearch = async (user) => {
  if (!user?.userId || user.relationshipStatus !== "NONE") {
    return;
  }

  try {
    const response = await sendFriendRequestV2({ receiverId: user.userId });

    if (response.status === 200) {
      setFriendSearch((prevState) => ({
        ...prevState,
        results: prevState.results.map((item) =>
          item.userId === user.userId
            ? { ...item, relationshipStatus: "REQUEST_SENT" }
            : item
        ),
      }));
    }
  } catch (error) {
    console.error("Failed to send friend request:", error);
  }
};

const handleClearRecentSearch = () => {
  const userId = userData?._id || userData?.userId || "guest";
  const storageKey = getRecentSearchStorageKey(userId);

  setDataSearch((prevState) => ({
    ...prevState,
    recent: [],
  }));

  localStorage.removeItem(storageKey);
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
                placeholder="Tìm kiếm"
                onClick={() => handleChangeIsSearch(true)}
              />
            </div>
            {isSearch.state ? (
              <div className="btn-close-search">
                <p onClick={() => handleChangeIsSearch(false)}>Đóng</p>
              </div>
            ) : (
              <div className="contact-group-add-user flex">
                <HiOutlineUserPlus
                  className="icon-user-contact"
                  onClick={() => handleShowAddFriend(true)}
                />
                <HiOutlineUserGroup
                  className="icon-user-contact"
                  onClick={() => handleShowAddGroup(true)}
                />
              </div>
            )}
            <div className="add-friend-group">
              {addUser.friend && (
                <div className="screen-mask">
                  <div className="wrap-add">
                    <div className="header-add-friend flex">
                      <p>Thêm bạn</p>
                      <IoMdClose
                        className="btn-close"
                        onClick={() => handleShowAddFriend(false)}
                      />
                    </div>
                    {/* <div className="add-by-phone">
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
                            placeholder="Số điện thoại"
                          />
                        </div>
                      </div>
                      <div className="recent-result">
                        <p>
                          Kết quả{" "}
                          {dataUserPhone.show !== null ? "" : "gần nhất"}
                        </p>
                        {dataUserPhone.state &&
                          dataUserPhone.state.length > 20 && (
                            <p>{dataUserPhone.state}</p>
                          )}
                      </div>
                      {dataUserPhone.data !== null && (
                        <div className="wrap-result-phone flex">
                          <div className="flex" style={{ maxWidth: "200px" }}>
                            <img src={dataUserPhone.data.avatar || undefined} alt="" />
                            <div>
                              <p className="username ">
                                {dataUserPhone.data.username}
                              </p>
                              <p className="phone">
                                {dataUserPhone.data.phone}
                              </p>
                            </div>
                          </div>
                          <div>
                            {dataUserPhone.cancel &&
                              dataUserPhone.cancel !== null && (
                                <button
                                  style={{
                                    backgroundColor: "#eaedf0",
                                    color: "black",
                                  }}
                                  onClick={() =>
                                    handleCRUDFriend(
                                      dataUserPhone.data._id,
                                      dataUserPhone.cancel
                                    )
                                  }
                                >
                                  {dataUserPhone.cancel}
                                </button>
                              )}
                            {dataUserPhone.unfriend &&
                              dataUserPhone.unfriend !== null && (
                                <button
                                  style={{
                                    backgroundColor: "#eaedf0",
                                    color: "black",
                                  }}
                                  onClick={() =>
                                    handleCRUDFriend(
                                      dataUserPhone.data._id,
                                      dataUserPhone.unfriend
                                    )
                                  }
                                >
                                  {dataUserPhone.unfriend}
                                </button>
                              )}
                            <button
                              onClick={() =>
                                handleCRUDFriend(
                                  dataUserPhone.data._id,
                                  dataUserPhone.state
                                )
                              }
                            >
                              {dataUserPhone?.state}
                            </button>
                          </div>
                        </div>
                      )}
                      {dataUserPhone.show &&
                        dataUserPhone.checkId == dataUserPhone.data._id && (
                          <div className="recent-result">
                            <p>
                              {dataUserPhone.data === null &&
                                dataUserPhone.state &&
                                `${dataUserPhone.state}`}
                            </p>
                          </div>
                        )}
                      <div className="btn-find-friend flex">
                        <button onClick={() => handleShowAddFriend(false)}>
                          Hủy
                        </button>
                        <button
                          style={{ backgroundColor: "#0068ff", color: "white" }}
                          onClick={handleFindUserByPhone}
                        >
                          Tìm kiếm
                        </button>
                      </div>
                    </div> */}
                    <div className="add-by-phone">
                      <div className="phone-friend flex">
                        <div className="input-number" style={{ width: "100%" }}>
                          <input
                            type="text"
                            value={friendSearch.keyword}
                            onChange={handleChangeSearchKeyword}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                handleFindUsersForAddFriend();
                              }
                            }}
                            placeholder="Nhap ten, username hoac so dien thoai"
                          />
                        </div>
                      </div>

                      <div className="btn-find-friend flex">
                        <button onClick={() => handleShowAddFriend(false)}>Huy</button>
                        <button
                          style={{ backgroundColor: "#0068ff", color: "white" }}
                          onClick={handleFindUsersForAddFriend}
                          disabled={friendSearch.loading}
                        >
                          {friendSearch.loading ? "Dang tim..." : "Tim kiem"}
                        </button>
                      </div>

                      <div className="recent-result">
                        <p>Ket qua</p>
                        {friendSearch.error ? <p>{friendSearch.error}</p> : null}
                        {friendSearch.searched &&
                        friendSearch.results.length === 0 &&
                        !friendSearch.error ? (
                          <p>Khong tim thay nguoi dung</p>
                        ) : null}
                      </div>

                      <div className="friend-search-results">
                        {friendSearch.results.map((user) => {
                          const action = getFriendActionMeta(user.relationshipStatus);

                          return (
                            <div key={user.userId} className="wrap-result-phone flex">
                              <div className="flex" style={{ maxWidth: "220px" }}>
                                <img src={user.avatar || user.avatarUrl || undefined} alt="" />
                                <div>
                                  <p className="username">{user.displayName || user.username}</p>
                                  {user.username ? (
                                    <p className="friend-search-subtitle">@{user.username}</p>
                                  ) : null}
                                </div>
                              </div>

                              <div>
                                <button
                                  disabled={action.disabled}
                                  onClick={() => handleSendFriendRequestFromSearch(user)}
                                >
                                  {action.label}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                  </div>
                </div>
              )}
              {dataCreateGr.showAvt && (
                <div className="screen-mask" style={{ zIndex: 1001 }}>
                  <div className="choice-avatar-gr">
                    <div className="header-add-friend flex">
                      <p>Cập nhật ảnh đại diện</p>
                      <IoMdClose
                        className="btn-close"
                        onClick={() => handleShowAvatarGr(false)}
                      />
                    </div>
                    <div className="input-number-group">
                      <CiSearch className="icon-search" />
                      <input
                        type="text"
                        placeholder="Nhập url hình ảnh"
                        value={dataCreateGr.avatar}
                        onChange={handleChangURl}
                      />
                    </div>
                    <div>
                      <ul className="ex-avatar flex">
                        {listAvatarGr?.map((item, index) => (
                          <li
                            key={index}
                            onClick={() => handleChoiceAvatarGr(item)}
                          >
                            <img
                              src={item}
                              alt=""
                              className={
                                item === dataCreateGr.avatar
                                  ? "ex-avatar-choice"
                                  : ""
                              }
                            />
                          </li>
                        ))}
                      </ul>
                      <div
                        className="btn-find-friend flex"
                        style={{ position: "relative" }}
                      >
                        <button onClick={() => handleShowAvatarGr(false)}>
                          Hủy
                        </button>
                        <button
                          onClick={handleSaveAvatarGr}
                          style={{ backgroundColor: "#0068ff", color: "white" }}
                        >
                          Cập nhật
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {addUser.group && (
                <div className="screen-mask">
                  <div className="wrap-add wrap-add-group">
                    <div className="header-add-friend flex">
                      <p>Tạo nhóm</p>
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
                            placeholder="Nhập tên nhóm"
                            onChange={handleChangeNameGr}
                            value={dataCreateGr.username}
                          />
                        </div>
                      </div>
                      <div className="input-number-group">
                        <CiSearch className="icon-search" />
                        <input
                          type="text"
                          placeholder="Nhập tên, số điện thoại, hoặc danh sách số"
                        />
                      </div>
                      <div className="list-contact">
                        {friendOptions &&
                          friendOptions.map((item, index) => (
                            <li
                              key={index}
                              onClick={() => handleAddMember(item.userId)}
                            >
                              <div className="contact-detial-conversation flex">
                                <div className="flex">
                                  <div className="checkbox-add">
                                    <input
                                      type="button"
                                      className={`${
                                        dataCreateGr.listMember.includes(
                                          item.userId
                                        )
                                          ? "active"
                                          : ""
                                      }`}
                                    />
                                  </div>
                                  <div className="contact-avatar-friend">
                                    <img src={item.avatarUrl || undefined} alt="" />
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
                        <button onClick={() => handleShowAddGroup(false)}>
                          Hủy
                        </button>
                        <button
                          onClick={handleCreateGroup}
                          style={{
                            backgroundColor: "#0068ff",
                            width: "125px",
                            color: "white",
                          }}
                        >
                          Tạo nhóm{" "}
                          {dataCreateGr.listMember.length < 1
                            ? ""
                            : ` (${dataCreateGr.listMember.length})`}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          {((!showPageAddressBook && !isSearch.state) ||
            (isSearch.response && !isSearch.recent)) && (
            <div className="contact-filter-converstation flex">
              <div className="contact-left-filter">
                <div className="flex">
                  <p
                    className={`${allMessActive ? "all-mess-active" : ""}`}
                    onClick={() => handleChangeShowMessSeen(true)}
                  >
                    Tất cả
                  </p>
                  <div>
                    {!isSearch.state ? (
                      <p
                        onClick={() => handleChangeShowMessSeen(false)}
                        className={`${allMessActive ? "" : "all-mess-active"}`}
                      >
                        Chưa đọc
                      </p>
                    ) : (
                      <p
                        // onClick={() => handleChangeShowMessSeen(true)}
                        className={`${allMessActive ? "" : "all-mess-active"}`}
                      >
                        Liên hệ
                      </p>
                    )}
                  </div>
                  <hr
                    className={`contact-hr-left-filter ${
                      allMessActive ? "" : "contact-hr-left-filter-active"
                    }`}
                  />
                </div>
              </div>
              {!isSearch.state ? (
                <div className="contact-right-filter">
                  <div className="contact- flex">
                    <div
                      className="contact-classification-filter flex"
                      onClick={handleToggleArchivedView}
                    >
                      <p>Phân loại</p>
                      <p style={{ fontSize: 12, marginRight: 4 }}>
                        {showArchived ? "Luu tru" : "Mo luu tru"}
                      </p>
                      <MdExpandMore className="icon-filter" />
                    </div>
                    <div className="contact-more-filter">
                      <IoIosMore className="icon-filter" />
                    </div>
                  </div>
                </div>
              ) : (
                ""
              )}
            </div>
          )}
          {conversationSettingsError ? (
            <p className="contact-feedback-error">
              {conversationSettingsError}
            </p>
          ) : null}
          {!isSearch.state ? (
            <div className="contact-list-status-row">
              <span className={`contact-list-scope-chip ${showArchived ? "archived" : "active"}`}>
                {showArchived ? "Dang xem luu tru" : "Dang xem hoi thoai"}
              </span>
              <span className="contact-list-scope-subtle">
                {displayedConversationList.length}
                {showArchived ? " muc" : " hoi thoai"}
              </span>
            </div>
          ) : null}
        </div>
        {isSearch.state ? (
          <div className="recent-search">
            <ul className="wrap-recent-search">
              {isSearch.recent && (
                <div>
                  <div
                  style={{
                    margin: "10px 20px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <p style={{ fontWeight: "500", margin: 0 }}>Tìm gần đây</p>
                  {dataSearch.recent.length > 0 ? (
                    <button
                      type="button"
                      onClick={handleClearRecentSearch}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "#0068ff",
                        cursor: "pointer",
                        fontWeight: "500",
                      }}
                    >
                      Xóa tất cả
                    </button>
                  ) : null}
                </div>

                  <div className="wrap-result-search">
                    {isSearch.recent &&
                      dataSearch.recent !== null &&
                      dataSearch.recent.map((item, index) => (
                        <li
                          key={getSearchItemId(item) || index}
                          onClick={() => handleChoiceContact(item)}
                        >
                          <div className="flex">
                            <img src={item.avatarUrl || undefined} alt="" />
                            <p>{item.displayName}</p>
                          </div>
                        </li>
                      ))}
                  </div>
                </div>
              )}

              {isSearch.response && (
                <div>
                  <div className="wrap-result-search">
                    {/* {isSearch.response &&
                      dataSearch.response !== null &&
                      Array.isArray(dataSearch.response) &&
                      dataSearch.response.map((item, index) => (
                        <li
                          key={index}
                          onClick={() => handleChoiceContact(item)}
                        >
                          <div className="flex">
                            <img src={item.avatarUrl} alt="" />
                            <p>{item.displayName}</p>
                          </div>
                        </li>
                      ))} */}
                      {isSearch.response &&
                        dataSearch.response !== null &&
                        Array.isArray(dataSearch.response) &&
                        dataSearch.response.map((item, index) => (
                          <li
                            key={item.userId || item._id || index}
                            onClick={() => handleChoiceContact(item)}
                          >
                            <div className="flex">
                              <img
                                src={item.avatar || item.avatarUrl || undefined}
                                alt=""
                              />
                              <p>{item.displayName || item.username}</p>
                            </div>
                          </li>
                        ))}

                  </div>
                </div>
              )}
            </ul>
          </div>
        ) : (
          !showPageAddressBook && (
            <div className="contact-wrap-conversation">
              <div className="contact-listConversation">
                {allMessActive ? (
                  <ul>
                    {displayedConversationList &&
                      displayedConversationList.map((data, index) => (
                        <li
                          className={
                            data?.id === selectedConversationId
                              ? "conversation-active"
                              : ""
                          }
                          key={index}
                          onClick={() => {
                            handleChangeContact(data);
                          }}
                        >
                          <div
                            className={`contact-detial-conversation flex ${
                              data?.pinned ? "contact-conversation-pinned" : ""
                            } ${data?.muted ? "contact-conversation-muted" : ""}`}
                          >
                            <div className="flex">
                              <div className="contact-avatar-friend">
                                <img
                                  src={getConversationAvatarUrl(data) || undefined}
                                  alt=""
                                />
                              </div>
                              <div className="contact-overview-mess">
                                <h3>
                                  <span>{getConversationDisplayName(data)}</span>
                                  <span className="contact-conversation-flags">
                                    {data.pinned ? (
                                      <span className="contact-conversation-pill pinned">
                                        Ghim
                                      </span>
                                    ) : null}
                                    {data.muted ? (
                                      <span className="contact-conversation-pill muted">
                                        Tat TB
                                      </span>
                                    ) : null}
                                  </span>
                                </h3>
                                <p title={getConversationPreview(data)}>
                                  {getConversationPreview(data)}
                                </p>
                              </div>
                            </div>
                            <div className="contact-last-onl flex">
                              <p className="contact-row-status">
                                {data.lastActive === "Active" ? (
                                  <RxDotFilled
                                    style={{
                                      fontSize: "20px",
                                      color: "#30a04b",
                                    }}
                                  />
                                ) : (
                                  data.lastActive
                                )}
                              </p>

                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                }}
                                style={{
                                  display: "none",
                                  flexDirection: "column",
                                  alignItems: "flex-end",
                                }}
                              >
                                <IoIosMore className="icon-more-conversation" />
                                <div
                                  className="box-del-conversation"
                                  key={index}
                                  style={{ width: 150, display: "block", fontSize: 0 }}
                                >
                                  <p
                                    style={{ fontSize: 13 }}
                                    onClick={(event) =>
                                      handleConversationSettingChange(event, data, "pin")
                                    }
                                  >
                                    {data.pinned ? "Bo ghim" : "Ghim"}
                                  </p>
                                  <p
                                    style={{ fontSize: 13 }}
                                    onClick={(event) =>
                                      handleConversationSettingChange(event, data, "archive")
                                    }
                                  >
                                    {data.archived ? "Bo luu tru" : "Luu tru"}
                                  </p>
                                  <p
                                    style={{ fontSize: 13 }}
                                    onClick={(event) =>
                                      handleConversationSettingChange(event, data, "mute")
                                    }
                                  >
                                    {data.muted ? "Bat thong bao" : "Tat thong bao"}
                                  </p>
                                  {pendingConversationId === data.id ? (
                                    <p style={{ fontSize: 13 }}>Dang cap nhat...</p>
                                  ) : null}
                                  <p>Xóa hội thoại</p>
                                </div>
                              </div>
                              {getUnreadConversationCount(data) > 0 && (
                                <div className="wrap-count-seen">
                                  <p className="count-seen">
                                    {getUnreadConversationCount(data)}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <ul>
                    {displayedConversationListNotSeen &&
                      displayedConversationListNotSeen.map((data, index) => (
                        <li
                          className={data?.id === selectedConversationId ? "conversation-active" : ""}
                          key={data?.id || index}
                          onClick={() => handleChangeContact(data)}
                        >
                          <div
                            className={`contact-detial-conversation flex ${
                              data?.pinned ? "contact-conversation-pinned" : ""
                            } ${data?.muted ? "contact-conversation-muted" : ""}`}
                          >
                            <div className="flex">
                              <div className="contact-avatar-friend">
                                <img
                                  src={getConversationAvatarUrl(data) || undefined}
                                  alt=""
                                />
                              </div>
                              <div className="contact-overview-mess">
                                <h3>
                                  <span>{getConversationDisplayName(data)}</span>
                                  <span className="contact-conversation-flags">
                                    {data?.pinned ? (
                                      <span className="contact-conversation-pill pinned">Ghim</span>
                                    ) : null}
                                    {data?.muted ? (
                                      <span className="contact-conversation-pill muted">Tat TB</span>
                                    ) : null}
                                  </span>
                                </h3>
                                <p title={getConversationPreview(data)}>{getConversationPreview(data)}</p>
                              </div>
                            </div>
                            <div className="contact-last-onl flex">
                              <p className="contact-row-status">
                                {data?.lastActive === "Active" ? (
                                  <RxDotFilled
                                    style={{
                                      fontSize: "20px",
                                      color: "#30a04b",
                                    }}
                                  />
                                ) : (
                                  data?.lastActive
                                )}
                              </p>
                              {getUnreadConversationCount(data) > 0 ? (
                                <div className="wrap-count-seen">
                                  <p className="count-seen">{getUnreadConversationCount(data)}</p>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </div>
          )
        )}
      </div>
    </>
  );
}

export default memo(Contact);


