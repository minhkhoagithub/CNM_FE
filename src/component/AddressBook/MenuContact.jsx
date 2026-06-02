import React, { useEffect, useState, useContext, useRef, memo } from "react";
import { UserContext } from "../../Context/UserContext";
import { ContactContext } from "../../Context/ContactConext";
import "../../resource/style/Chat/contact.css";
import "../../resource/style/AddressBook/menuContact.css";
import { CiSearch } from "react-icons/ci";
import { HiOutlineUsers, HiOutlineUserPlus, HiOutlineUserGroup } from "react-icons/hi2";
import { IoMdClose } from "react-icons/io";
import { IoTriangle } from "react-icons/io5";
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
import chatRealtimeService from "../../services/chat/chatRealtimeService";
import {
  getFriendRealtimeDestination,
  isFriendRealtimeEvent,
} from "../../services/friendRealtimeService";
import { CLOSE_FRIEND_STATUS_CHANGED_EVENT } from "../../services/closeFriendApi";
import { uploadAttachmentV1 } from "../../services/chat/messageApi";
import { mapConversation } from "../../mappers/conversationMapper";

export const LoiMoiKetBan = "Lời mời kết bạn";
export const DanhSachBanBe = "Danh sách bạn bè";
export const DanhSachNhom = "Danh sách nhóm";
export const DanhSachChan = "Danh sách chặn";

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
  isCloseFriend: Boolean(item.isCloseFriend),
  closeFriendNote: item.closeFriendNote || null,
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
  const currentUserId = userData?._id || userData?.userId || null;
  const [friendRequestCount, setFriendRequestCount] = useState(0);
  const [activeMenuTitle, setActiveMenuTitle] = useState(null);

  const getRecentSearchStorageKey = (userId) => `user-search:${userId || "guest"}`;

const getSearchItemId = (item) => item?.userId || item?._id || item?.id || null;

const [dataSearch, setDataSearch] = useState({
  recent: [],
  response: [],
});

const fetchIncomingFriendRequestCount = React.useCallback(async () => {
  if (!currentUserId) return;

  try {
    const response = await getIncomingFriendRequestsV2();
    const requests = Array.isArray(response.data) ? response.data : [];
    setFriendRequestCount(requests.length);
  } catch (error) {
    console.error("Failed to load incoming friend request count:", error);
    setFriendRequestCount(0);
  }
}, [currentUserId]);

useEffect(() => {
  void fetchIncomingFriendRequestCount();
}, [fetchIncomingFriendRequestCount]);


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
      return { label: "Bạn bè", disabled: true };
    case "REQUEST_SENT":
      return { label: "Đã gửi lời mời", disabled: true };
    case "REQUEST_RECEIVED":
      return { label: "Đã nhận lời mời", disabled: true };
    default:
      return { label: "Kết bạn", disabled: false };
  }
};

  const [dataCreateGr, setDataCreateGr] = useState({
    username: "",
    listMember: [],
    showAvt: false,
    avatar: null,
    avatarFile: null,
    avatarPreview: "",
  });
  const groupAvatarInputRef = useRef(null);
  const [friendOptions, setFriendOptions] = useState([]);
  const [createGroupError, setCreateGroupError] = useState("");
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
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
    setCreateGroupError("");
    setAddUser((prevState) => ({
      ...prevState,
      group: value,
    }));
  };

    useEffect(() => {
      const handleOpenCreateGroup = () => {
        handleShowAddGroup(true);
      };

      window.addEventListener("OPEN_CREATE_GROUP", handleOpenCreateGroup);
      return () => {
        window.removeEventListener("OPEN_CREATE_GROUP", handleOpenCreateGroup);
      };
    }, [handleShowAddGroup]);

  const handleAddMember = (value) => {
    setCreateGroupError("");
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
    if (isCreatingGroup) {
      return;
    }

    const groupName = String(dataCreateGr.username || "").trim();
    const participantIds = dataCreateGr.listMember.filter(Boolean);

    if (!groupName) {
      setCreateGroupError("Vui lòng nhập tên nhóm.");
      return;
    }

    if (participantIds.length < 2) {
      console.log("[GROUP VALIDATION]", {
        source: "web-address-book-create",
        participantCount: participantIds.length,
      });
      setCreateGroupError("Vui lòng chọn ít nhất 2 thành viên.");
      return;
    }

    setCreateGroupError("");
    setIsCreatingGroup(true);

    try {
      const response = await createConversationV1({
        type: "GROUP",
        name: groupName,
        participantIds,
      });
      let nextConversation = mapConversation(response);
      upsertConversation(nextConversation);

      const selectedAvatarUrl = String(dataCreateGr.avatar || "").trim();
      const selectedAvatarFile = dataCreateGr.avatarFile || null;
      if (response?.id && (selectedAvatarFile || selectedAvatarUrl)) {
        console.log("[GROUP AVATAR UPLOAD]", {
          source: "web-address-book-create",
          status: "submitting",
          conversationId: response.id,
          uploadMode: selectedAvatarFile ? "file" : "url",
        });

        try {
          let resolvedAvatarUrl = selectedAvatarUrl;
          if (selectedAvatarFile) {
            const uploadResult = await uploadAttachmentV1(selectedAvatarFile);
            resolvedAvatarUrl = String(uploadResult?.url || "").trim();
          }

          if (!resolvedAvatarUrl) {
            throw new Error("Missing uploaded avatar URL");
          }

          const avatarResponse = await updateConversationAvatarV1(
            response.id,
            resolvedAvatarUrl
          );
          nextConversation = mapConversation(avatarResponse);
          upsertConversation(nextConversation);
          console.log("[GROUP AVATAR UPLOAD]", {
            source: "web-address-book-create",
            status: "success",
            conversationId: response.id,
            avatarUrl: nextConversation?.avatarUrl || "",
          });
        } catch (avatarError) {
          console.error("[GROUP AVATAR UPLOAD]", {
            source: "web-address-book-create",
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
      setCreateGroupError("Không thể tạo nhóm. Vui lòng thử lại.");
      return;
    } finally {
      setIsCreatingGroup(false);
    }

    handleShowAddGroup(false);
    setDataCreateGr({
      username: "",
      listMember: [],
      showAvt: false,
      avatar: null,
      avatarFile: null,
      avatarPreview: "",
    });
  };

  const handleShowAvatarGr = (value) => {
    setDataCreateGr((prevState) => ({
      ...prevState,
      showAvt: value,
    }));
  };

  const handleChoiceAvatarGr = (value) => {
    console.log("[GROUP AVATAR PICK]", {
      source: "web-address-book-create",
      mode: "preset",
      value,
    });
    setDataCreateGr((prevState) => ({
      ...prevState,
      avatar: value,
      avatarFile: null,
      avatarPreview: value,
    }));
  };

  const handleChangURl = (e) => {
    const nextValue = e.target.value;
    setDataCreateGr((prevState) => ({
      ...prevState,
      avatar: nextValue,
      avatarFile: null,
      avatarPreview: nextValue,
    }));
  };

  const handleGroupAvatarFilePick = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    console.log("[GROUP AVATAR PICK]", {
      source: "web-address-book-create",
      mode: "file",
      fileName: file.name,
      fileSize: file.size,
      contentType: file.type,
    });
    setDataCreateGr((prevState) => ({
      ...prevState,
      avatar: null,
      avatarFile: file,
      avatarPreview: previewUrl,
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
      unfriend: foundUser.relationshipStatus === "FRIEND" ? "Xóa bạn bè" : null,
      checkId: foundUser.userId,
    });
    return;
  }

  setDataUserPhone({
    username: "",
    show: false,
    data: null,
    state: "Không tìm thấy người dùng",
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
//       unfriend: foundUser.relationshipStatus === "FRIEND" ? "Xóa bạn bè" : null,
//       checkId: foundUser.userId,
//     });
//     return;
//   }

//   setDataUserSearch({
//     keyword: "",
//     show: false,
//     data: null,
//     state: "Không tìm thấy người dùng",
//     cancel: null,
//     unfriend: null,
//     checkId: null,
//   });
// };

const handleFindUsersForAddFriend = React.useCallback(async () => {
  const keyword = friendSearch.keyword.trim();

  if (!keyword) {
    setFriendSearch((prevState) => ({
      ...prevState,
      searched: true,
      results: [],
      error: "Vui lòng nhập tên, username, họ tên hoặc số điện thoại",
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
      error: "Không thể tìm kiếm lúc này",
    }));
  }
}, [friendSearch.keyword]);



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

  if (state === "FRIEND" || state === "Xóa bạn bè") {
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
  //         count: `Bạn bè (${response.data?.length || 0})`,
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
  //         count: `Lời mời kết bạn (${response.data?.length || 0})`,
  //       });
  //     }
  //   } else if (title === LoiMoiVaoNhom) {
  //     const response = await getGroupReq({ id: userData._id });
  //     if (response.status === 200 || response.status === 204) {
  //       handleSetContentMenuContact({
  //         state: true,
  //         data: response.data,
  //         title: LoiMoiVaoNhom,
  //         count: `Lời mời vao nhóm (${response.data?.length || 0})`,
  //       });
  //     }
  //   }
  // };
  // Phiên bản mới với API V2
  const handleFetchDataUser = React.useCallback(async (title) => {
  setActiveMenuTitle(title);

  if (title === DanhSachBanBe) {
    const response = await getFriendsV2();
    const friends = Array.isArray(response.data)
      ? response.data.map(mapFriendshipToUi)
      : [];

    handleSetContentMenuContact({
      state: true,
      data: friends,
      title: DanhSachBanBe,
      count: `Bạn bè (${friends.length})`,
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
  //     count: `Lời mời kết bạn (${requests.length})`,
  //   });
  //   return;
  // }
  if (title === LoiMoiKetBan) {
    try {
      const response = await getIncomingFriendRequestsV2();
      const requests = Array.isArray(response.data)
        ? response.data.map(mapIncomingRequestToUi)
        : [];

      setFriendRequestCount(requests.length);

      handleSetContentMenuContact({
        state: true,
        data: requests,
        title: LoiMoiKetBan,
        count: `Lời mời kết bạn (${requests.length})`,
      });
    } catch (error) {
      console.error("Failed to load incoming friend requests:", error);
      setFriendRequestCount(0);
      handleSetContentMenuContact({
        state: true,
        data: [],
        title: LoiMoiKetBan,
        count: "Lời mời kết bạn (0)",
      });
    }
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
          count: `Nhóm (${groups.length})`,
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
          count: "Nhóm (0)",
      });
    }
    return;
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
}, [handleSetContentMenuContact, userData?._id, userData?.userId]);

useEffect(() => {
  if (!currentUserId || activeMenuTitle) {
    return;
  }

  void handleFetchDataUser(DanhSachBanBe);
}, [activeMenuTitle, currentUserId, handleFetchDataUser]);

useEffect(() => {
  if (!currentUserId) {
    return undefined;
  }

  const subscriptionKey = `address-book:friends:${currentUserId}`;
  chatRealtimeService
    .subscribe(
      subscriptionKey,
      getFriendRealtimeDestination(currentUserId),
      async (event) => {
        if (!isFriendRealtimeEvent(event)) {
          return;
        }

        await fetchIncomingFriendRequestCount();

        if (activeMenuTitle === DanhSachBanBe || activeMenuTitle === LoiMoiKetBan) {
          await handleFetchDataUser(activeMenuTitle);
        }

        if (addUser.group) {
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
            console.error("Failed to refresh group friend options:", error);
          }
        }

        if (addUser.friend && String(friendSearch.keyword || "").trim()) {
          await handleFindUsersForAddFriend();
        }
      }
    )
    .catch((error) => {
      console.error("Failed to subscribe friend realtime in address book:", error);
    });

  return () => {
    chatRealtimeService.unsubscribe(subscriptionKey);
  };
}, [
  activeMenuTitle,
  addUser.friend,
  addUser.group,
  currentUserId,
  fetchIncomingFriendRequestCount,
  friendSearch.keyword,
  handleFetchDataUser,
  handleFindUsersForAddFriend,
]);

useEffect(() => {
  if (typeof window === "undefined" || !currentUserId) {
    return undefined;
  }

  const handleCloseFriendSync = async () => {
    if (activeMenuTitle === DanhSachBanBe) {
      await handleFetchDataUser(DanhSachBanBe);
    }
  };

  window.addEventListener(CLOSE_FRIEND_STATUS_CHANGED_EVENT, handleCloseFriendSync);
  return () => {
    window.removeEventListener(CLOSE_FRIEND_STATUS_CHANGED_EVENT, handleCloseFriendSync);
  };
}, [activeMenuTitle, currentUserId, handleFetchDataUser]);


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
                        <button onClick={() => handleShowAvatarGr(false)}>Hủy</button>
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
                      <p>Create Group</p>
                      <IoMdClose
                        className="btn-close"
                        onClick={() => handleShowAddGroup(false)}
                      />
                    </div>
                    <div className="modal-body-content">
                      <input
                        ref={groupAvatarInputRef}
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={handleGroupAvatarFilePick}
                      />

                      <div className="group-info-inputs-container flex">
                        <div className="group-avatar-dashed-picker-wrapper">
                          <div
                            className="group-avatar-dashed-picker flex items-center justify-center"
                            onClick={() => handleShowAvatarGr(true)}
                          >
                            {dataCreateGr.avatarPreview || dataCreateGr.avatar ? (
                              <img
                                src={dataCreateGr.avatarPreview || dataCreateGr.avatar}
                                alt="Group Preview"
                                className="group-avatar-preview-img"
                              />
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 camera-svg">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
                              </svg>
                            )}
                            <div
                              className="avatar-add-badge flex items-center justify-center"
                              onClick={(event) => {
                                event.stopPropagation();
                                groupAvatarInputRef.current?.click();
                              }}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                              </svg>
                            </div>
                          </div>
                        </div>

                        <div className="group-name-input-wrapper flex flex-col">
                          <div className="modal-section-label">GROUP NAME</div>
                          <div className="input-number group">
                            <input
                              type="text"
                              placeholder="Enter group name..."
                              onChange={handleChangeNameGr}
                              value={dataCreateGr.username}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="modal-section-label" style={{ marginTop: 24 }}>
                        SELECT MEMBERS
                      </div>
                      <div className="search-input-container">
                        <svg className="search-input-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.608 10.608Z" />
                        </svg>
                        <input type="text" placeholder="Enter name or phone..." />
                      </div>

                      <div className="list-contact">
                        {friendOptions.map((item, index) => {
                          const isChecked = dataCreateGr.listMember.includes(item.userId);
                          const statuses = ["Online", "Last seen 2h ago", "Busy", "Offline"];
                          const statusIdx = Math.abs(
                            String(item.userId || index)
                              .split("")
                              .reduce((acc, char) => acc + char.charCodeAt(0), 0)
                          ) % statuses.length;
                          const statusText = statuses[statusIdx];

                          return (
                            <li
                              key={item.userId || index}
                              onClick={() => handleAddMember(item.userId)}
                              className="contact-member-item"
                            >
                              <div className="contact-detial-conversation flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="contact-avatar-friend">
                                    {item.avatarUrl ? (
                                      <img src={item.avatarUrl} alt="" />
                                    ) : (
                                      <div className="avatar-initials">
                                        {(item.displayName || "?").charAt(0).toUpperCase()}
                                      </div>
                                    )}
                                  </div>
                                  <div className="contact-overview-mess">
                                    <h3>{item.displayName}</h3>
                                    <span className={`status-text ${statusText.toLowerCase().replace(/ /g, "-")}`}>
                                      {statusText}
                                    </span>
                                  </div>
                                </div>
                                <div className="checkbox-add">
                                  <div className={`custom-checkbox ${isChecked ? "checked" : ""}`}>
                                    {isChecked ? (
                                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                                      </svg>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </div>
                      {createGroupError ? (
                        <p className="contact-feedback-error">
                          {createGroupError}
                        </p>
                      ) : null}
                      {isCreatingGroup ? (
                        <p className="contact-feedback-error">Đang tạo nhóm...</p>
                      ) : null}
                    </div>

                    <div className="modal-footer flex">
                      <button
                        className="btn-cancel"
                        type="button"
                        onClick={() => handleShowAddGroup(false)}
                        disabled={isCreatingGroup}
                      >
                        Cancel
                      </button>
                      <button
                        className="btn-submit"
                        type="button"
                        onClick={handleCreateGroup}
                        disabled={
                          isCreatingGroup ||
                          !String(dataCreateGr.username || "").trim() ||
                          dataCreateGr.listMember.length < 2
                        }
                        style={{
                          backgroundColor:
                            isCreatingGroup ||
                            !String(dataCreateGr.username || "").trim() ||
                            dataCreateGr.listMember.length < 2
                              ? "#93c5fd"
                              : "#0068ff",
                          cursor:
                            isCreatingGroup ||
                            !String(dataCreateGr.username || "").trim() ||
                            dataCreateGr.listMember.length < 2
                              ? "not-allowed"
                              : "pointer",
                        }}
                      >
                        Create Group
                        {dataCreateGr.listMember.length > 0
                          ? ` (${dataCreateGr.listMember.length})`
                          : ""}
                      </button>
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
                        Chưa có lịch sử tìm kiếm
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
                className={`flex ${
                  activeMenuTitle === item.title ? "menu-contact-item-active" : ""
                }`}
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



