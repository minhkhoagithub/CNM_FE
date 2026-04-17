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
// import {
//   getFriendByName,
//   getAllGroup,
//   getFriendRes,
//   getGroupReq,
//   getUserByPhone,
//   crudFriend,
//   getAllFriend,
// } from "../../util/api/index.jsx";
import {
  getGroupReq,
  searchUsersV2,
  getFriendsV2,
  getIncomingFriendRequestsV2,
  sendFriendRequestV2,
  unfriendUserV2,
  getBlockedUsersV2,
} from "../../util/api/index.jsx";

import {
  createConversationV1,
  getConversations,
  updateConversationAvatarV1,
} from "../../services/chat/conversationApi";
import { mapConversation } from "../../mappers/conversationMapper";

export const LoiMoiKetBan = "Loi moi ket ban";
export const LoiMoiVaoNhom = "Loi moi vao nhom";
export const DanhSachBanBe = "Danh sach ban be";
export const DanhSachNhom = "Danh sach nhom";
export const DanhSachChan = "Danh sach chan";

// const mapSearchUserToUi = (item) => ({
//   _id: item.userId,
//   userId: item.userId,
//   username: item.displayName || item.username,
//   displayName: item.displayName || item.username,
//   avatar: item.avatarUrl || "",
//   avatarUrl: item.avatarUrl || "",
//   relationshipStatus: item.relationshipStatus || "NONE",
// });

const mapSearchUserToUi = (item) => ({
  _id: item.userId,
  userId: item.userId,
  username: item.displayName || item.username,
  displayName: item.displayName || item.username,
  avatar: item.avatarUrl || "",
  avatarUrl: item.avatarUrl || "",
  relationshipStatus: item.relationshipStatus || "NONE",
});

const mapFriendshipToUi = (item) => ({
  _id: item.friend?.userId,
  userId: item.friend?.userId,
  username: item.friend?.displayName || item.friend?.username,
  displayName: item.friend?.displayName || item.friend?.username,
  avatar: item.friend?.avatarUrl || "",
  avatarUrl: item.friend?.avatarUrl || "",
  friendshipId: item.friendshipId,
});

const mapIncomingRequestToUi = (item) => ({
  _id: item.sender?.userId,
  userId: item.sender?.userId,
  username: item.sender?.displayName || item.sender?.username,
  displayName: item.sender?.displayName || item.sender?.username,
  avatar: item.sender?.avatarUrl || "",
  avatarUrl: item.sender?.avatarUrl || "",
  requestId: item.id,
});

const mapBlockedUserToUi = (item) => ({
  _id: item.blockedUser?.userId,
  userId: item.blockedUser?.userId,
  username: item.blockedUser?.displayName || item.blockedUser?.username,
  displayName: item.blockedUser?.displayName || item.blockedUser?.username,
  avatar: item.blockedUser?.avatarUrl || "",
  avatarUrl: item.blockedUser?.avatarUrl || "",
  blockId: item.id,
  reason: item.reason || "",
  blockedAt: item.createdAt,
});

const mapGroupConversationToAddressBookUi = (conversation, currentUserId) => {
  const mappedConversation = mapConversation(conversation, { currentUserId });
  return {
    ...mappedConversation,
    _id: mappedConversation.id,
    userId: mappedConversation.id,
    username: mappedConversation.displayName,
    displayName: mappedConversation.displayName,
    avatar: mappedConversation.avatarUrl || "",
    avatarUrl: mappedConversation.avatarUrl || "",
  };
};


function MenuContact({ handleChangeContact, handleSetContentMenuContact }) {
  // const initialRecentSearch = (() => {
  //   try {
  //     const local = localStorage.getItem("user-search");
  //     return local ? JSON.parse(local) : [];
  //   } catch {
  //     return [];
  //   }
  // })();
    const { userData } = useContext(UserContext);
  const { upsertConversation, fetchConversation } = useContext(ContactContext);
  const [friendRequestCount, setFriendRequestCount] = useState(0);

  const getRecentSearchStorageKey = (userId) => `user-search:${userId || "guest"}`;

const getSearchItemId = (item) => item?.userId || item?._id || item?.id || null;

const [dataSearch, setDataSearch] = useState({
  recent: [],
  response: [],
});

const fetchIncomingFriendRequestCount = async () => {
  if (!userData?._id) return;

  try {
    const response = await getIncomingFriendRequestsV2();
    const requests = Array.isArray(response.data) ? response.data : [];
    setFriendRequestCount(requests.length);
  } catch (error) {
    console.error("Failed to load incoming friend request count:", error);
    setFriendRequestCount(0);
  }
};

useEffect(() => {
  fetchIncomingFriendRequestCount();
}, [userData?._id]);


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


  const listMenu = [
    { title: DanhSachBanBe, icon: <HiOutlineUsers /> },
    { title: DanhSachNhom, icon: <HiOutlineUserGroup /> },
    { title: LoiMoiKetBan, icon: <HiOutlineUserPlus /> },
    { title: LoiMoiVaoNhom, icon: <HiOutlineUserGroup /> },
    { title: DanhSachChan, icon: <HiOutlineUsers />},
  ];
  const [textSearch, setTextSearch] = useState("");
  const [isSearch, setIsSearch] = useState({
    state: false,
    recent: true,
    response: false,
  });
  // const [dataSearch, setDataSearch] = useState({
  //   recent: initialRecentSearch,
  //   response: [],
  // });
  const [addUser, setAddUser] = useState({
    friend: false,
    group: false,
  });
  // const [dataUserPhone, setDataUserPhone] = useState({
  //   username: "",
  //   show: false,
  //   data: null,
  //   state: null,
  //   cancel: null,
  //   unfriend: null,
  //   checkId: null,
  // });
  const [dataUserSearch, setDataUserSearch] = useState({
  keyword: "",
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

  const searchTimeout = useRef(null);

  // useEffect(() => {
  //   const fetchFriendOptions = async () => {
  //     if (!userData?._id) {
  //       return;
  //     }

  //     try {
  //       const response = await getAllFriend({ id: userData._id });
  //       const nextFriends = Array.isArray(response?.data)
  //         ? response.data.map((friend) => ({
  //             userId: friend.userId || friend._id,
  //             displayName:
  //               friend.username || friend.displayName || friend.name || friend.phone,
  //             avatarUrl: friend.avatar || friend.avatarUrl || "",
  //           }))
  //         : [];
  //       setFriendOptions(nextFriends.filter((friend) => friend.userId));
  //     } catch (error) {
  //       console.error("Failed to load friend options:", error);
  //     }
  //   };

  //   fetchFriendOptions();
  // }, [userData?._id]);

  // Phiên bản mới với API V2
  useEffect(() => {
  const fetchFriendOptions = async () => {
    if (!userData?._id) return;

    try {
      const response = await getFriendsV2();
      const nextFriends = Array.isArray(response.data)
        ? response.data.map(mapFriendshipToUi)
        : [];

      setFriendOptions(
        nextFriends.map((friend) => ({
          userId: friend.userId,
          displayName: friend.displayName || friend.username,
          avatarUrl: friend.avatarUrl || friend.avatar || "",
        }))
      );
    } catch (error) {
      console.error("Failed to load friend options:", error);
    }
  };

  fetchFriendOptions();
}, [userData?._id]);


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
  //       setDataSearch((prevState) => ({
  //         ...prevState,
  //         response: response.status === 200 ? response.data : [],
  //       }));
  //       setIsSearch((prevState) => ({
  //         ...prevState,
  //         response: true,
  //         recent: false,
  //       }));
  //     }, 300);
  //   }
  // };
  // Phiên bản mới với API V2
  const handleSearchDb = (value) => {
  if (value !== "") {
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }

    searchTimeout.current = setTimeout(async () => {
      const response = await searchUsersV2({ keyword: value });

      setDataSearch((prevState) => ({
        ...prevState,
        response: Array.isArray(response.data)
          ? response.data.map(mapSearchUserToUi)
          : [],
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

  // const storeLocal = (value) => {
  //   const nextRecent = [
  //     value,
  //     ...dataSearch.recent.filter((item) => item._id !== value._id),
  //   ];
  //   setDataSearch((prevState) => ({
  //     ...prevState,
  //     recent: nextRecent,
  //   }));
  //   localStorage.setItem("user-search", JSON.stringify(nextRecent));
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

const handleClearRecentSearch = () => {
  const userId = userData?._id || userData?.userId || "guest";
  const storageKey = getRecentSearchStorageKey(userId);

  setDataSearch((prevState) => ({
    ...prevState,
    recent: [],
  }));

  localStorage.removeItem(storageKey);
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

  // const handleShowAddFriend = (value) => {
  //   setAddUser((prevState) => ({
  //     ...prevState,
  //     friend: value,
  //   }));

  //   if (!value) {
  //     setDataUserPhone({
  //       username: "",
  //       show: false,
  //       data: null,
  //       state: null,
  //       cancel: null,
  //       unfriend: null,
  //       checkId: null,
  //     });
  //   }
  // };
//   const handleShowAddFriend = (value) => {
//   setAddUser((prevState) => ({
//     ...prevState,
//     friend: value,
//   }));

//   if (!value) {
//     setDataUserSearch({
//       keyword: "",
//       show: false,
//       data: null,
//       state: null,
//       cancel: null,
//       unfriend: null,
//       checkId: null,
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
      let nextConversation = mapConversation(response);
      upsertConversation(nextConversation);

      const selectedAvatarUrl = String(dataCreateGr.avatar || "").trim();
      if (response?.id && selectedAvatarUrl) {
        console.log("[WEB GROUP AVATAR FOLLOWUP]", {
          source: "address-book-create",
          status: "submitting",
          conversationId: response.id,
          avatarUrlLength: selectedAvatarUrl.length,
        });

        try {
          const avatarResponse = await updateConversationAvatarV1(
            response.id,
            selectedAvatarUrl
          );
          nextConversation = mapConversation(avatarResponse);
          upsertConversation(nextConversation);
          console.log("[WEB GROUP AVATAR FOLLOWUP]", {
            source: "address-book-create",
            status: "success",
            conversationId: response.id,
            avatarUrl: nextConversation?.avatarUrl || "",
          });
        } catch (avatarError) {
          console.error("[WEB GROUP AVATAR FOLLOWUP]", {
            source: "address-book-create",
            status: "failed",
            conversationId: response.id,
            error: avatarError,
          });
        }
      }

      console.log("[WEB GROUP METADATA SYNC]", {
        source: "address-book-create",
        conversationId: nextConversation?.id,
        displayName: nextConversation?.displayName,
        avatarUrl: nextConversation?.avatarUrl || "",
      });
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

  // const handleChangePhone = (e) => {
  //   setDataUserPhone((prevState) => ({
  //     ...prevState,
  //     username: e.target.value,
  //   }));
  // };
//   const handleChangeSearchKeyword = (e) => {
//   setDataUserSearch((prevState) => ({
//     ...prevState,
//     keyword: e.target.value,
//   }));
// };

const handleChangeSearchKeyword = (e) => {
  setFriendSearch((prevState) => ({
    ...prevState,
    keyword: e.target.value,
    error: "",
  }));
};


  // const handleFindUserByPhone = async () => {
  //   if (dataUserPhone.username !== "") {
  //     const response = await getUserByPhone({
  //       phone: dataUserPhone.username,
  //       id: userData._id,
  //     });
  //     if (response.status === 200) {
  //       setDataUserPhone({
  //         username: "",
  //         show: true,
  //         data: response.data.data,
  //         state: response.data.state,
  //         cancel: response.data.cancel ? response.data.cancel : null,
  //         unfriend: response.data.unfriend ? response.data.unfriend : null,
  //         checkId: response.data.data?._id || null,
  //       });
  //     } else {
  //       setDataUserPhone({
  //         username: "",
  //         show: false,
  //         data: null,
  //         state: response.data.state,
  //         cancel: null,
  //         unfriend: null,
  //         checkId: null,
  //       });
  //     }
  //   }
  // };
  // Phiên bản mới với API V2

  const handleFindUserByPhone = async () => {
  if (!dataUserPhone.username.trim()) return;

  const response = await searchUsersV2({
    keyword: dataUserPhone.username.trim(),
  });

  const foundUser =
    Array.isArray(response.data) && response.data.length > 0
      ? mapSearchUserToUi(response.data[0])
      : null;

  if (foundUser) {
    setDataUserPhone({
      username: "",
      show: true,
      data: foundUser,
      state: foundUser.relationshipStatus,
      cancel: null,
      unfriend: foundUser.relationshipStatus === "FRIEND" ? "Xoa ban be" : null,
      checkId: foundUser.userId,
    });
    return;
  }

  setDataUserPhone({
    username: "",
    show: false,
    data: null,
    state: "Khong tim thay nguoi dung",
    cancel: null,
    unfriend: null,
    checkId: null,
  });
};

// const handleFindUser = async () => {
//   if (!dataUserSearch.keyword.trim()) return;

//   const response = await searchUsersV2({
//     keyword: dataUserSearch.keyword.trim(),
//   });

//   const foundUser =
//     Array.isArray(response.data) && response.data.length > 0
//       ? mapSearchUserToUi(response.data[0])
//       : null;

//   if (foundUser) {
//     setDataUserSearch({
//       keyword: "",
//       show: true,
//       data: foundUser,
//       state: foundUser.relationshipStatus,
//       cancel: null,
//       unfriend: foundUser.relationshipStatus === "FRIEND" ? "Xoa ban be" : null,
//       checkId: foundUser.userId,
//     });
//     return;
//   }

//   setDataUserSearch({
//     keyword: "",
//     show: false,
//     data: null,
//     state: "Khong tim thay nguoi dung",
//     cancel: null,
//     unfriend: null,
//     checkId: null,
//   });
// };

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



  // const handleCRUDFriend = async (friendId, state) => {
  //   const response = await crudFriend({
  //     userId: userData._id,
  //     friendId,
  //     state,
  //   });

  //   if (response.status === 200) {
  //     fetchConversation();
  //   }
  // };
// Phiên bản mới với API V2
  const handleCRUDFriend = async (friendId, state) => {
  if (state === "NONE" || state === "Ket ban") {
    const response = await sendFriendRequestV2({ receiverId: friendId });
    if (response.status === 200) {
      setDataUserPhone((prevState) => ({
        ...prevState,
        state: "REQUEST_SENT",
        unfriend: null,
      }));
    }
    return;
  }

  if (state === "FRIEND" || state === "Xoa ban be") {
    const response = await unfriendUserV2({ friendUserId: friendId });
    if (response.status === 200) {
      setDataUserPhone((prevState) => ({
        ...prevState,
        state: "NONE",
        unfriend: null,
      }));
      fetchConversation();
    }
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



  // const handleFetchDataUser = async (title) => {
  //   if (title === DanhSachBanBe) {
  //     const response = await getAllFriend({ id: userData._id });
  //     if (response.status === 200 || response.status === 204) {
  //       handleSetContentMenuContact({
  //         state: true,
  //         data: response.data,
  //         title: DanhSachBanBe,
  //         count: `Ban be (${response.data?.length || 0})`,
  //       });
  //     }
  //   } else if (title === DanhSachNhom) {
  //     const response = await getAllGroup({ id: userData._id });
  //     if (response.status === 200 || response.status === 204) {
  //       handleSetContentMenuContact({
  //         state: true,
  //         data: response.data,
  //         title: DanhSachNhom,
  //         count: `Nhom (${response.data?.length || 0})`,
  //       });
  //     }
  //   } else if (title === LoiMoiKetBan) {
  //     const response = await getFriendRes({ id: userData._id });
  //     if (response.status === 200 || response.status === 204) {
  //       handleSetContentMenuContact({
  //         state: true,
  //         data: response.data,
  //         title: LoiMoiKetBan,
  //         count: `Loi moi ket ban (${response.data?.length || 0})`,
  //       });
  //     }
  //   } else if (title === LoiMoiVaoNhom) {
  //     const response = await getGroupReq({ id: userData._id });
  //     if (response.status === 200 || response.status === 204) {
  //       handleSetContentMenuContact({
  //         state: true,
  //         data: response.data,
  //         title: LoiMoiVaoNhom,
  //         count: `Loi moi vao nhom (${response.data?.length || 0})`,
  //       });
  //     }
  //   }
  // };
  // Phiên bản mới với API V2
  const handleFetchDataUser = async (title) => {
  if (title === DanhSachBanBe) {
    const response = await getFriendsV2();
    const friends = Array.isArray(response.data)
      ? response.data.map(mapFriendshipToUi)
      : [];

    handleSetContentMenuContact({
      state: true,
      data: friends,
      title: DanhSachBanBe,
      count: `Ban be (${friends.length})`,
    });
    return;
  }

  // if (title === LoiMoiKetBan) {
  //   const response = await getIncomingFriendRequestsV2();
  //   const requests = Array.isArray(response.data)
  //     ? response.data.map(mapIncomingRequestToUi)
  //     : [];

  //   handleSetContentMenuContact({
  //     state: true,
  //     data: requests,
  //     title: LoiMoiKetBan,
  //     count: `Loi moi ket ban (${requests.length})`,
  //   });
  //   return;
  // }
  if (title === LoiMoiKetBan) {
  const response = await getIncomingFriendRequestsV2();
  const requests = Array.isArray(response.data)
    ? response.data.map(mapIncomingRequestToUi)
    : [];

  setFriendRequestCount(requests.length);

  handleSetContentMenuContact({
    state: true,
    data: requests,
    title: LoiMoiKetBan,
    count: `Loi moi ket ban (${requests.length})`,
  });
  return;
}


  if (title === DanhSachNhom) {
    try {
      const response = await getConversations();
      const groups = Array.isArray(response)
        ? response
            .map((conversation) =>
              mapGroupConversationToAddressBookUi(
                conversation,
                userData?.userId || userData?._id
              )
            )
            .filter((conversation) => conversation.type === "group")
        : [];

      console.log("[WEB GROUP LIST SOURCE]", {
        source: "conversation-api",
        count: groups.length,
      });

      handleSetContentMenuContact({
        state: true,
        data: groups,
        title: DanhSachNhom,
        count: `Nhom (${groups.length})`,
      });
    } catch (error) {
      console.error("[WEB GROUP LIST SOURCE]", {
        source: "conversation-api",
        status: "failed",
        error,
      });
      handleSetContentMenuContact({
        state: true,
        data: [],
        title: DanhSachNhom,
        count: "Nhom (0)",
      });
    }
    return;
  }

  if (title === LoiMoiVaoNhom) {
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
  if (title === DanhSachChan) {
    const response = await getBlockedUsersV2();
    const blockedUsers = Array.isArray(response.data)
      ? response.data.map(mapBlockedUserToUi)
      : [];

    handleSetContentMenuContact({
      state: true,
      data: blockedUsers,
      title: DanhSachChan,
      count: `Da chan (${blockedUsers.length})`,
    });
    return;
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
                        <div className="input-number">
                          <input
                            type="text"
                            value={friendSearch.keyword}
                            onChange={handleChangeSearchKeyword}
                            placeholder="Nhập tên, username hoặc số điện thoại"
                          />
                        </div>
                      </div>

                      <div className="btn-find-friend flex">
                        <button onClick={() => handleShowAddFriend(false)}>Hủy</button>
                        <button
                          style={{ backgroundColor: "#0068ff", color: "white" }}
                          onClick={handleFindUsersForAddFriend}
                          disabled={friendSearch.loading}
                        >
                          {friendSearch.loading ? "Đang tìm..." : "Tìm kiếm"}
                        </button>
                      </div>

                      <div className="recent-result">
                        <p>Kết quả</p>
                        {friendSearch.error ? <p>{friendSearch.error}</p> : null}
                        {friendSearch.searched && friendSearch.results.length === 0 && !friendSearch.error ? (
                          <p>Không tìm thấy người dùng</p>
                        ) : null}
                      </div>

                      <div className="wrap-list-result">
                        {friendSearch.results.map((user) => {
                          const action = getFriendActionMeta(user.relationshipStatus);

                          return (
                            <div key={user.userId} className="wrap-result-phone flex">
                              <div className="flex" style={{ maxWidth: "220px" }}>
                                <img src={user.avatar || user.avatarUrl} alt="" />
                                <div>
                                  <p className="username">{user.displayName || user.username}</p>
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
              {/* {isSearch.recent ? (
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
              ) : null} */}
              {isSearch.recent ? (
                <div>
                  <div
                    style={{
                      margin: "10px 20px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <p style={{ fontWeight: "500", margin: 0 }}>Tim gan day</p>
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
                        Xoa tat ca
                      </button>
                    ) : null}
                  </div>

                  <div className="wrap-result-search">
                    {dataSearch.recent.length > 0 ? (
                      dataSearch.recent.map((item, index) => (
                        <li key={getSearchItemId(item) || index} onClick={() => handleChoiceContact(item)}>
                          <div className="flex">
                            <img src={item.avatar || item.avatarUrl} alt="" />
                            <p>{item.username || item.displayName}</p>
                          </div>
                        </li>
                      ))
                    ) : (
                      <p style={{ margin: "0 20px 12px", color: "#7589a3" }}>
                        Chua co lich su tim kiem
                      </p>
                    )}
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
              {/* {listMenu.map((item, index) => (
                <li
                  key={index}
                  className="flex"
                  onClick={() => handleFetchDataUser(item.title)}
                >
                  <div className="icon-contact">{item.icon}</div>
                  <p>{item.title}</p>
                </li>
              ))} */}
              {listMenu.map((item, index) => (
              <li
                key={index}
                className="flex"
                onClick={() => handleFetchDataUser(item.title)}
              >
                <div className="icon-contact">{item.icon}</div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                  }}
                >
                  <p>{item.title}</p>

                  {item.title === LoiMoiKetBan && friendRequestCount > 0 ? (
                    <span className="menu-contact-badge">
                      {friendRequestCount > 99 ? "99+" : friendRequestCount}
                    </span>
                  ) : null}
                </div>
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
