import React, { useContext, useEffect, useMemo, useState } from "react";
import "../../resource/style/AddressBook/contentMenuContact.css";
import {
  LoiMoiKetBan,
  LoiMoiVaoNhom,
  DanhSachBanBe,
  DanhSachNhom,
  DanhSachChan,
} from "./MenuContact";
import { UserContext } from "../../Context/UserContext";
import { TbMessageDots } from "react-icons/tb";
import {
  HiOutlineArchiveBox,
  HiOutlineChevronDown,
  HiOutlineEllipsisHorizontal,
  HiOutlineMagnifyingGlass,
  HiOutlineShieldCheck,
  HiOutlineSpeakerXMark,
  HiOutlineStar,
  HiOutlineUser,
  HiOutlineUserGroup,
  HiOutlineUserPlus,
} from "react-icons/hi2";
import { IoInformationCircleOutline } from "react-icons/io5";
// import { crudFriend, getFriendReq } from "../../util/api";
import {
  getOutgoingFriendRequestsV2,
  acceptFriendRequestV2,
  rejectFriendRequestV2,
  unfriendUserV2,
} from "../../util/api";
import {
  blockUserForCurrentUser,
  unblockUserForCurrentUser,
} from "../../services/userBlockApi";
import chatRealtimeService from "../../services/chat/chatRealtimeService";
import {
  getFriendRealtimeDestination,
  isFriendRealtimeEvent,
} from "../../services/friendRealtimeService";
import { updateCloseFriendStatusForCurrentUser } from "../../services/closeFriendApi";


export const HUY_LOI_MOI_KET_BAN = "Thu hồi lời mời kết bạn";
export const KET_BAN = "Kết bạn";
export const DONG_Y = "Đồng ý";
export const BAN_BE = "Bạn bè";
export const XOA_BAN_BE = "Xóa bạn bè";
export const BO_QUA = "Bỏ qua";
export const CHAN = "Chặn";
export const BO_CHAN = "Bỏ chặn";
export const GAN_BAN_THAN = "Gắn bạn thân";
export const BO_BAN_THAN = "Bỏ bạn thân";

const FRIEND_FILTER_ALL = "all";
const FRIEND_FILTER_CLOSE = "close";

const GROUP_SECTION_ALL = "all";
const GROUP_SECTION_MY = "my";
const GROUP_SECTION_RECENT = "recent";
const GROUP_SECTION_PUBLIC = "public";

const GROUP_SORT_RECENT = "recent";
const GROUP_SORT_NEWEST = "newest";
const GROUP_SORT_MEMBERS = "members";
const GROUP_SORT_NAME = "name";
const GROUP_SORT_PUBLIC = "public";
const GROUP_SORT_PRIVATE = "private";

const GROUP_CATEGORIES = [
  { id: "engineering", label: "Kỹ thuật", colorClass: "engineering" },
  { id: "design", label: "Hệ thống thiết kế", colorClass: "design" },
  { id: "marketing", label: "Chiến lược marketing", colorClass: "marketing" },
];


// const defaultFlags = {
//   XoaKetBan: false,
//   ThuHoiLoiMoi: false,
//   DongY: false,
//   KetBan: false,
//   BoQua: false,
//   BanBe: false,
//   XoaBanBe: false,
// };
const defaultFlags = {
  XoaKetBan: false,
  ThuHoiLoiMoi: false,
  DongY: false,
  KetBan: false,
  BoQua: false,
  BanBe: false,
  XoaBanBe: false,
  Chan: false,
  BoChan: false,
};

const mapOutgoingRequestToUi = (item) => ({
  _id: item.receiver?.userId,
  userId: item.receiver?.userId,
  username: item.receiver?.displayName || item.receiver?.username,
  displayName: item.receiver?.displayName || item.receiver?.username,
  avatar: item.receiver?.avatarUrl || "",
  avatarUrl: item.receiver?.avatarUrl || "",
  requestId: item.id,
});

const normalizeCategoryToken = (value) => String(value || "").toLowerCase();

const resolveCategoryId = (group) => {
  const rawValue =
    group?.category ||
    group?.categoryCode ||
    group?.groupLabelDisplayName ||
    group?.groupLabel ||
    group?.raw?.category ||
    group?.raw?.categoryCode ||
    "";
  const token = normalizeCategoryToken(rawValue);

  if (token.includes("engineer") || token.includes("ky thuat")) {
    return "engineering";
  }
  if (token.includes("design")) {
    return "design";
  }
  if (token.includes("marketing") || token.includes("market")) {
    return "marketing";
  }

  return "other";
};

const resolveCategoryLabel = (categoryId) => {
  const match = GROUP_CATEGORIES.find((category) => category.id === categoryId);
  return match ? match.label : "Khác";
};

const resolveCategoryClass = (categoryId) => {
  const match = GROUP_CATEGORIES.find((category) => category.id === categoryId);
  return match ? match.colorClass : "other";
};

const resolveMemberCount = (group) => {
  if (!group || typeof group !== "object") {
    return 0;
  }

  if (Number.isFinite(group.memberCount)) {
    return Number(group.memberCount);
  }

  if (Array.isArray(group.members)) {
    return group.members.length;
  }

  if (Array.isArray(group.raw?.members)) {
    return group.raw.members.length;
  }

  return 0;
};

const resolveCurrentUserRole = (group, currentUserId) => {
  if (!currentUserId || !Array.isArray(group?.members)) {
    return "MEMBER";
  }

  const currentMember = group.members.find(
    (member) => String(member.userId) === String(currentUserId)
  );

  return String(currentMember?.role || "MEMBER").toUpperCase();
};

const resolveGroupStatus = (group) => {
  if (group?.archived) {
    return "ARCHIVED";
  }

  if (group?.muted) {
    return "MUTED";
  }

  return "ACTIVE";
};

const resolveRelativeTime = (value) => {
  if (!value) {
    return "Hoạt động gần đây";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Hoạt động gần đây";
  }

  const diffMs = Date.now() - parsed.getTime();
  const diffMinutes = Math.floor(diffMs / (60 * 1000));
  if (diffMinutes < 1) {
    return "Vừa hoạt động";
  }
  if (diffMinutes < 60) {
    return `Hoạt động ${diffMinutes} phút trước`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `Hoạt động ${diffHours} giờ trước`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `Hoạt động ${diffDays} ngày trước`;
  }

  return `Hoạt động ${parsed.toLocaleDateString("vi-VN")}`;
};

const resolveGroupRoleMeta = (role) => {
  switch (String(role || "").toUpperCase()) {
    case "OWNER":
      return { label: "Trưởng nhóm", className: "owner", icon: HiOutlineStar };
    case "ADMIN":
      return { label: "Quản trị", className: "admin", icon: HiOutlineShieldCheck };
    case "MODERATOR":
      return { label: "Điều phối", className: "moderator", icon: HiOutlineShieldCheck };
    default:
      return { label: "Thành viên", className: "member", icon: HiOutlineUser };
  }
};

const resolveGroupStatusMeta = (status) => {
  switch (status) {
    case "ARCHIVED":
      return { label: "Lưu trữ", className: "archived", icon: HiOutlineArchiveBox };
    case "MUTED":
      return { label: "Đã tắt thông báo", className: "muted", icon: HiOutlineSpeakerXMark };
    default:
      return { label: "Đang hoạt động", className: "active", icon: HiOutlineUserGroup };
  }
};


const buildListData = (dataContentContac, title) => {
  const nextMap = new Map();

  if (Array.isArray(dataContentContac) && dataContentContac.length > 0) {
    if (title === DanhSachBanBe) {
      dataContentContac.forEach((item) => {
        nextMap.set(item._id, {
          ...item,
          ...defaultFlags,
          XoaBanBe: true,
          BanBe: true,
          Chan: true,
        });
      });
    } else if (title === LoiMoiKetBan) {
      dataContentContac.forEach((item) => {
        nextMap.set(item._id, {
          ...item,
          ...defaultFlags,
          DongY: true,
          BoQua: true,
        });
      });
    } else if (title === DanhSachNhom) {
      dataContentContac.forEach((item) => {
        const itemId = item.id || item._id || item.userId;
        if (!itemId) {
          return;
        }
        nextMap.set(itemId, {
          ...item,
          _id: itemId,
          userId: itemId,
          username: item.username || item.displayName,
          displayName: item.displayName || item.username,
          avatar: item.avatar || item.avatarUrl || "",
          avatarUrl: item.avatarUrl || item.avatar || "",
          ...defaultFlags,
        });
      });
    } else if (title === DanhSachChan) {
        dataContentContac.forEach((item) => {
          nextMap.set(item._id, {
            ...item,
            ...defaultFlags,
            BoChan: true,
          });
        }
      );
    }
  }
  return nextMap;
};

export default function ContentMenuContact({
  dataContentContac,
  title,
  count,
  handleShowSoftConversation,
}) {
  const { userData } = useContext(UserContext);
  const currentUserId = userData?._id || userData?.userId || null;
  const [friendReq, setFriendReq] = useState([]);
  // const [listData, setListData] = useState(() => buildListData(dataContentContac, title));
  // const [resultSearch, setResultSearch] = useState({
  //   state: false,
  //   data: new Map([]),
  // });
  const [listData, setListData] = useState(() => buildListData(dataContentContac, title));
const [searchKeyword, setSearchKeyword] = useState("");
const [resultSearch, setResultSearch] = useState({
  state: false,
  data: new Map([]),
});
const [friendFilter, setFriendFilter] = useState(FRIEND_FILTER_ALL);
const [pendingCloseFriendId, setPendingCloseFriendId] = useState(null);
const [closeFriendActionError, setCloseFriendActionError] = useState("");
const [selectedGroupId, setSelectedGroupId] = useState(null);
const [groupSearch, setGroupSearch] = useState("");
const [groupSection, setGroupSection] = useState(GROUP_SECTION_ALL);
const [groupSort, setGroupSort] = useState(GROUP_SORT_RECENT);
const [selectedCategory, setSelectedCategory] = useState("all");
const [isGroupDetailOpen, setIsGroupDetailOpen] = useState(false);

useEffect(() => {
  setListData(buildListData(dataContentContac, title));
  setSearchKeyword("");
  setFriendFilter(FRIEND_FILTER_ALL);
  setPendingCloseFriendId(null);
  setCloseFriendActionError("");
  setSelectedGroupId(null);
  setGroupSearch("");
  setGroupSection(GROUP_SECTION_ALL);
  setGroupSort(GROUP_SORT_RECENT);
  setSelectedCategory("all");
  setIsGroupDetailOpen(false);
  setResultSearch({
    state: false,
    data: new Map([]),
  });
}, [dataContentContac, title]);



  // useEffect(() => {
  //   const fetch = async () => {
  //     if (title === LoiMoiKetBan) {
  //       const response = await getFriendReq({ id: userData._id });
  //       if (response.status === 200 && Array.isArray(response.data)) {
  //         setFriendReq(response.data);
  //       } else {
  //         setFriendReq([]);
  //       }
  //     }
  //   };

  //   fetch();
  // }, [title, userData?._id]);
const loadOutgoingRequests = React.useCallback(async () => {
  if (title !== LoiMoiKetBan) {
    setFriendReq([]);
    return;
  }

  const response = await getOutgoingFriendRequestsV2();
  if (response.status === 200 && Array.isArray(response.data)) {
    setFriendReq(response.data.map(mapOutgoingRequestToUi));
  } else {
    setFriendReq([]);
  }
}, [title]);

useEffect(() => {
  void loadOutgoingRequests();
}, [loadOutgoingRequests]);

useEffect(() => {
  if (!currentUserId || title !== LoiMoiKetBan) {
    return undefined;
  }

  const subscriptionKey = `address-book:friend-requests:${currentUserId}:${title}`;
  chatRealtimeService
    .subscribe(
      subscriptionKey,
      getFriendRealtimeDestination(currentUserId),
      async (event) => {
        if (!isFriendRealtimeEvent(event)) {
          return;
        }

        await loadOutgoingRequests();
      }
    )
    .catch((error) => {
      console.error("Failed to subscribe friend request realtime in content panel:", error);
    });

  return () => {
    chatRealtimeService.unsubscribe(subscriptionKey);
  };
}, [currentUserId, loadOutgoingRequests, title]);


  const updateListStateByAction = (friendId, action) => {
    setListData((prevState) => {
      const nextState = new Map(prevState);
      const current = nextState.get(friendId);

      if (!current) {
        return nextState;
      }

      if (action === HUY_LOI_MOI_KET_BAN) {
        nextState.delete(friendId);
        return nextState;
      }

      if (action === XOA_BAN_BE) {
        nextState.delete(friendId);
        return nextState;
      }

      if (action === DONG_Y || action === BAN_BE) {
        nextState.set(friendId, {
          ...current,
          ...defaultFlags,
          BanBe: true,
          XoaBanBe: true,
        });
        return nextState;
      }

      if (action === BO_QUA) {
        nextState.delete(friendId);
        return nextState;
      }

      if (action === KET_BAN) {
        nextState.set(friendId, {
          ...current,
          ...defaultFlags,
          ThuHoiLoiMoi: true,
        });
      }
      if (action === CHAN) {
        nextState.delete(friendId);
        return nextState;
      }

      if (action === BO_CHAN) {
        nextState.delete(friendId);
        return nextState;
      }
      return nextState;
    });
  };

  const applyCloseFriendState = (friendId, { isCloseFriend, note }) => {
    const applyNextMap = (sourceMap) => {
      const nextMap = new Map(sourceMap);
      const current = nextMap.get(friendId);
      if (!current) {
        return nextMap;
      }

      nextMap.set(friendId, {
        ...current,
        isCloseFriend: Boolean(isCloseFriend),
        closeFriendNote: note ?? null,
      });
      return nextMap;
    };

    setListData((prevState) => applyNextMap(prevState));
    setResultSearch((prevState) => ({
      ...prevState,
      data: applyNextMap(prevState.data),
    }));
  };

  const handleToggleCloseFriend = async (friend) => {
    const friendId = friend.userId || friend._id;
    if (!friendId) {
      return;
    }

    const nextIsCloseFriend = !Boolean(friend.isCloseFriend);
    const previousState = {
      isCloseFriend: Boolean(friend.isCloseFriend),
      note: friend.closeFriendNote ?? null,
    };

    setCloseFriendActionError("");
    setPendingCloseFriendId(String(friendId));
    applyCloseFriendState(friendId, {
      isCloseFriend: nextIsCloseFriend,
      note: friend.closeFriendNote ?? null,
    });

    try {
      const response = await updateCloseFriendStatusForCurrentUser({
        friendId,
        isCloseFriend: nextIsCloseFriend,
      });
      const nextSetting = response?.data || {};
      applyCloseFriendState(friendId, {
        isCloseFriend:
          typeof nextSetting.isCloseFriend === "boolean"
            ? nextSetting.isCloseFriend
            : nextIsCloseFriend,
        note: nextSetting.note ?? friend.closeFriendNote ?? null,
      });
    } catch (error) {
      applyCloseFriendState(friendId, previousState);
      setCloseFriendActionError("Không thể cập nhật trạng thái bạn thân.");
      console.error("Failed to update close friend setting:", error);
    } finally {
      setPendingCloseFriendId(null);
    }
  };

  // const handleCrudFriend = async (friend, e) => {
  //   const action = e.target.textContent;
  //   const data = {
  //     userId: userData._id,
  //     friendId: friend._id,
  //     state: action,
  //   };
  //   const response = await crudFriend(data);

  //   if (response.status === 200) {
  //     if (action === HUY_LOI_MOI_KET_BAN && title === LoiMoiKetBan) {
  //       setFriendReq((prevFriendReq) =>
  //         prevFriendReq.filter((item) => item._id !== friend._id)
  //       );
  //     }

  //     updateListStateByAction(friend._id, action);
  //   }
  // };

  const handleCrudFriend = async (friend, e) => {
  const action = e.target.textContent;

  if (action === DONG_Y) {
    const response = await acceptFriendRequestV2({ requestId: friend.requestId });
    if (response.status === 200) {
      updateListStateByAction(friend._id, action);
    }
    return;
  }

  if (action === BO_QUA) {
    const response = await rejectFriendRequestV2({ requestId: friend.requestId });
    if (response.status === 200) {
      updateListStateByAction(friend._id, action);
    }
    return;
  }

  if (action === XOA_BAN_BE) {
    const response = await unfriendUserV2({
      friendUserId: friend.userId || friend._id,
    });
    if (response.status === 200) {
      updateListStateByAction(friend._id, action);
    }
  }
  if (action === CHAN) {
    const response = await blockUserForCurrentUser({
      blockedUserId: friend.userId || friend._id,
      reason: "",
    });
    if (response.status === 200) {
      updateListStateByAction(friend._id, action);
    }
    return;
  }

  if (action === BO_CHAN) {
    const response = await unblockUserForCurrentUser({
      blockedUserId: friend.userId || friend._id,
    });
    if (response.status === 200) {
      updateListStateByAction(friend._id, action);
    }
    return;
  }

};


  // const handleSeachContact = (e) => {
  //   const stringName = e.target.value;
  //   if (stringName && stringName.trim() !== "") {
  //     const stringPure = stringName.trim().toLowerCase();
  //     const nextMap = new Map();

  //     Array.from(listData).forEach(([key, item]) => {
  //       const itemName = item.username || item.displayName || "";
  //       if (itemName.trim().toLowerCase().startsWith(stringPure)) {
  //         nextMap.set(key, item);
  //       }
  //     });

  //     setResultSearch({
  //       state: true,
  //       data: nextMap,
  //     });
  //     return;
  //   }

  //   setResultSearch({
  //     state: false,
  //     data: new Map([]),
  //   });
  // };
const handleSeachContact = (e) => {
  const keyword = e.target.value;
  setSearchKeyword(keyword);

  if (keyword && keyword.trim() !== "") {
    const normalizedKeyword = keyword.trim().toLowerCase();
    const nextMap = new Map();

    Array.from(listData).forEach(([key, item]) => {
      const itemName = (item.username || item.displayName || "").trim().toLowerCase();

      if (itemName.includes(normalizedKeyword)) {
        nextMap.set(key, item);
      }
    });

    setResultSearch({
      state: true,
      data: nextMap,
    });
    return;
  }

  setResultSearch({
    state: false,
    data: new Map([]),
  });
};

  const isFriendListView = title === DanhSachBanBe;
  const isGroupListView = title === DanhSachNhom;
  const baseEntries = Array.from(resultSearch.state ? resultSearch.data : listData);
  const entriesToRender =
    isFriendListView && friendFilter === FRIEND_FILTER_CLOSE
      ? baseEntries.filter(([, item]) => Boolean(item.isCloseFriend))
      : baseEntries;
  const showCloseFriendEmptyState =
    isFriendListView &&
    friendFilter === FRIEND_FILTER_CLOSE &&
    listData.size > 0 &&
    entriesToRender.length === 0;

  const handleOpenGroupDetail = (groupId) => {
    setSelectedGroupId(groupId);
    setIsGroupDetailOpen(true);
  };

  const handleCloseGroupDetail = () => {
    setIsGroupDetailOpen(false);
  };

  const resolveGroupActionMeta = (group) => {
    const accessState = group.accessState || "JOINED";
    if (accessState === "JOINED") {
      return { label: "Vào chat", disabled: false };
    }
    if (accessState === "NOT_JOINED_PUBLIC") {
      return { label: "Tham gia nhóm", disabled: false };
    }
    if (accessState === "PRIVATE_REQUIRES_ACCESS") {
      return { label: "Yêu cầu truy cập", disabled: false };
    }
    if (accessState === "ACCESS_REQUESTED") {
      return { label: "Đã yêu cầu", disabled: true };
    }
    return { label: "Không khả dụng", disabled: true };
  };

  const groupEntries = useMemo(
    () => (listData ? Array.from(listData.values()) : []),
    [listData]
  );

  const normalizedGroups = useMemo(() => {
    if (!isGroupListView) {
      return [];
    }

    return groupEntries
      .map((group) => {
        const groupId = group._id || group.id;
        if (!groupId) {
          return null;
        }

        const categoryId = resolveCategoryId(group);
        const privacy = String(group.privacy || group.raw?.privacy || "PRIVATE").toUpperCase();
        const accessState = String(
          group.accessState || group.raw?.accessState || "JOINED"
        ).toUpperCase();

        return {
          id: groupId,
          name: group.displayName || group.username || "Nhóm",
          description: group.description || group.raw?.description || "",
          avatarUrl: group.avatarUrl || group.avatar || "",
          categoryId,
          categoryLabel: resolveCategoryLabel(categoryId),
          categoryClass: resolveCategoryClass(categoryId),
          privacy,
          accessState,
          status: resolveGroupStatus(group),
          memberCount: resolveMemberCount(group),
          memberPreview: Array.isArray(group.members)
            ? group.members.slice(0, 3)
            : [],
          currentUserRole: resolveCurrentUserRole(group, currentUserId),
          lastActiveAt:
            group.lastMessageTime || group.lastActive || group.raw?.lastMessageTime || null,
          joinedAt: group.joinedAt || group.raw?.joinedAt || group.raw?.createdAt || null,
          isFeatured: Boolean(group.isFeatured || group.raw?.isFeatured || group.pinned),
          raw: group,
        };
      })
      .filter(Boolean);
  }, [currentUserId, groupEntries, isGroupListView]);

  const categoryCounts = useMemo(() => {
    const counts = new Map();
    normalizedGroups.forEach((group) => {
      const key = group.categoryId;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
  }, [normalizedGroups]);

  const sectionGroups = useMemo(() => {
    if (!isGroupListView) {
      return [];
    }

    if (groupSection === GROUP_SECTION_MY) {
      return normalizedGroups.filter((group) =>
        ["OWNER", "ADMIN", "MODERATOR"].includes(group.currentUserRole)
      );
    }

    if (groupSection === GROUP_SECTION_RECENT) {
      return normalizedGroups
        .filter((group) => Boolean(group.joinedAt))
        .sort((a, b) =>
          new Date(b.joinedAt || 0).getTime() - new Date(a.joinedAt || 0).getTime()
        );
    }

    if (groupSection === GROUP_SECTION_PUBLIC) {
      return normalizedGroups.filter(
        (group) =>
          group.privacy === "PUBLIC" || group.accessState === "NOT_JOINED_PUBLIC"
      );
    }

    return normalizedGroups;
  }, [groupSection, isGroupListView, normalizedGroups]);

  const visibleGroups = useMemo(() => {
    if (!isGroupListView) {
      return [];
    }

    const normalizedSearch = groupSearch.trim().toLowerCase();
    const bySearch = sectionGroups.filter((group) => {
      if (!normalizedSearch) {
        return true;
      }

      const name = String(group.name || "").toLowerCase();
      const description = String(group.description || "").toLowerCase();
      const categoryLabel = String(group.categoryLabel || "").toLowerCase();
      return (
        name.includes(normalizedSearch) ||
        description.includes(normalizedSearch) ||
        categoryLabel.includes(normalizedSearch)
      );
    });

    const byCategory =
      selectedCategory === "all"
        ? bySearch
        : bySearch.filter((group) => group.categoryId === selectedCategory);

    const sortedGroups = [...byCategory];
    sortedGroups.sort((a, b) => {
      if (groupSort === GROUP_SORT_NAME) {
        return String(a.name).localeCompare(String(b.name));
      }
      if (groupSort === GROUP_SORT_MEMBERS) {
        return b.memberCount - a.memberCount;
      }
      if (groupSort === GROUP_SORT_NEWEST) {
        return new Date(b.joinedAt || 0).getTime() - new Date(a.joinedAt || 0).getTime();
      }
      if (groupSort === GROUP_SORT_PUBLIC) {
        return a.privacy === "PUBLIC" ? -1 : 1;
      }
      if (groupSort === GROUP_SORT_PRIVATE) {
        return a.privacy === "PUBLIC" ? 1 : -1;
      }

      return new Date(b.lastActiveAt || 0).getTime() - new Date(a.lastActiveAt || 0).getTime();
    });

    return sortedGroups;
  }, [groupSearch, groupSort, isGroupListView, sectionGroups, selectedCategory]);

  const groupEmptyState = useMemo(() => {
    if (!isGroupListView) {
      return null;
    }

    if (normalizedGroups.length === 0) {
      return {
        title: "Bạn chưa có nhóm nào.",
        description: "Hãy tạo nhóm mới hoặc tham gia nhóm để bắt đầu cộng tác.",
        actionLabel: "Tạo nhóm",
      };
    }

    if (visibleGroups.length > 0) {
      return null;
    }

    if (groupSection === GROUP_SECTION_PUBLIC) {
      return {
        title: "Chưa có nhóm công khai.",
        description: "Nhóm công khai sẽ hiển thị tại đây khi được tạo.",
      };
    }

    if (groupSection === GROUP_SECTION_RECENT) {
      return {
        title: "Chưa có nhóm tham gia gần đây.",
        description: "Những nhóm bạn tham gia gần đây sẽ xuất hiện tại đây.",
      };
    }

    if (groupSection === GROUP_SECTION_MY) {
      return {
        title: "Bạn chưa quản lý nhóm nào.",
        description: "Những nhóm bạn sở hữu hoặc quản trị sẽ hiển thị tại đây.",
      };
    }

    if (groupSearch || selectedCategory !== "all") {
      return {
        title: "Không tìm thấy nhóm phù hợp.",
        description: "Hãy thử từ khóa khác hoặc xóa bộ lọc hiện tại.",
        actionLabel: "Xóa bộ lọc",
      };
    }

    return {
      title: "Không có nhóm hiển thị.",
      description: "Hãy thử thay đổi bộ lọc để xem thêm nhóm.",
    };
  }, [
    groupSearch,
    groupSection,
    isGroupListView,
    normalizedGroups.length,
    selectedCategory,
    visibleGroups.length,
  ]);

  const featuredGroup = useMemo(
    () => visibleGroups.find((group) => group.isFeatured),
    [visibleGroups]
  );

  const regularGroups = useMemo(
    () => visibleGroups.filter((group) => group.id !== featuredGroup?.id),
    [featuredGroup, visibleGroups]
  );

  const selectedGroup = useMemo(() => {
    if (!selectedGroupId) {
      return null;
    }

    return normalizedGroups.find((group) => String(group.id) === String(selectedGroupId));
  }, [normalizedGroups, selectedGroupId]);

  useEffect(() => {
    if (!isGroupListView) {
      return;
    }

    if (selectedGroupId && !selectedGroup) {
      setSelectedGroupId(null);
      setIsGroupDetailOpen(false);
    }
  }, [isGroupListView, selectedGroup, selectedGroupId]);


  return (
    <>
      {listData ? (
        <div className="waper-content-menu-contact">
          {isGroupListView ? (
            <div className="groups-management-shell">
              <aside className="groups-sidebar">
                <div className="groups-sidebar-header">
                  <div className="groups-sidebar-title">
                    <div className="groups-sidebar-icon">
                      <HiOutlineUserGroup />
                    </div>
                    <div>
                      <h3>Nhóm</h3>
                      <p>Quản lý cộng đồng</p>
                    </div>
                  </div>
                </div>
                <nav className="groups-sidebar-nav">
                  {[
                    { id: GROUP_SECTION_ALL, label: "Tất cả nhóm", icon: HiOutlineUserGroup },
                    { id: GROUP_SECTION_MY, label: "Nhóm của tôi", icon: HiOutlineStar },
                    { id: GROUP_SECTION_RECENT, label: "Tham gia gần đây", icon: HiOutlineUserPlus },
                    { id: GROUP_SECTION_PUBLIC, label: "Danh bạ công khai", icon: HiOutlineUser },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`groups-sidebar-item ${
                        groupSection === item.id ? "active" : ""
                      }`}
                      onClick={() => setGroupSection(item.id)}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </button>
                  ))}
                </nav>
                <div className="groups-sidebar-categories">
                  <p className="groups-sidebar-section-title">Danh mục</p>
                  {GROUP_CATEGORIES.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      className={`groups-category-item ${
                        selectedCategory === category.id ? "active" : ""
                      }`}
                      onClick={() => setSelectedCategory(category.id)}
                    >
                      <span className={`category-dot ${category.colorClass}`} />
                      <span>{category.label}</span>
                      <span className="category-count">
                        {categoryCounts.get(category.id) || 0}
                      </span>
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`groups-category-item ${
                      selectedCategory === "all" ? "active" : ""
                    }`}
                    onClick={() => setSelectedCategory("all")}
                  >
                    <span className="category-dot other" />
                    <span>Khác</span>
                    <span className="category-count">
                      {categoryCounts.get("other") || 0}
                    </span>
                  </button>
                </div>
                <div className="groups-sidebar-upgrade">
                  <div className="upgrade-icon">
                    <HiOutlineStar />
                  </div>
                  <div>
                    <h4>Nâng cấp gói</h4>
                    <p>Mở khóa nhóm riêng tư</p>
                  </div>
                </div>
              </aside>

              <div className="groups-content">
                <div className="groups-toolbar">
                  <div className="groups-search">
                    <HiOutlineMagnifyingGlass />
                    <input
                      type="text"
                      placeholder="Tìm kiếm trong toàn bộ nhóm..."
                      value={groupSearch}
                      onChange={(event) => setGroupSearch(event.target.value)}
                      aria-label="Tìm kiếm nhóm"
                    />
                  </div>
                  <div className="groups-toolbar-actions">
                    <div className="groups-sort">
                      <span>Sắp xếp</span>
                      <select
                        value={groupSort}
                        onChange={(event) => setGroupSort(event.target.value)}
                        aria-label="Sắp xếp nhóm"
                      >
                        <option value={GROUP_SORT_RECENT}>Hoạt động gần đây</option>
                        <option value={GROUP_SORT_NEWEST}>Nhóm mới nhất</option>
                        <option value={GROUP_SORT_MEMBERS}>Nhiều thành viên</option>
                        <option value={GROUP_SORT_NAME}>Tên A-Z</option>
                        <option value={GROUP_SORT_PUBLIC}>Công khai trước</option>
                        <option value={GROUP_SORT_PRIVATE}>Riêng tư trước</option>
                      </select>
                      <HiOutlineChevronDown />
                    </div>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent("OPEN_CREATE_GROUP"));
                      }}
                    >
                      <HiOutlineUserPlus />
                      Tạo nhóm
                    </button>
                  </div>
                </div>

                <div className="groups-grid">
                  {groupEmptyState ? (
                    <div className="groups-empty">
                      <div className="empty-state-icon">
                        <IoInformationCircleOutline />
                      </div>
                      <h4>{groupEmptyState.title}</h4>
                      <p>{groupEmptyState.description}</p>
                      {groupEmptyState.actionLabel ? (
                        <button
                          type="button"
                          className="btn-outline"
                          onClick={() => {
                            if (groupEmptyState.actionLabel === "Xóa bộ lọc") {
                              setGroupSearch("");
                              setSelectedCategory("all");
                              setGroupSection(GROUP_SECTION_ALL);
                            } else {
                              window.dispatchEvent(new CustomEvent("OPEN_CREATE_GROUP"));
                            }
                          }}
                        >
                          {groupEmptyState.actionLabel}
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <>
                      {featuredGroup ? (
                        <div
                          className="group-card featured"
                          role="button"
                          tabIndex={0}
                          onClick={() => handleOpenGroupDetail(featuredGroup.id)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              handleOpenGroupDetail(featuredGroup.id);
                            }
                          }}
                        >
                          <div className="group-card-main">
                            <div className="group-avatar">
                              {featuredGroup.avatarUrl ? (
                                <img src={featuredGroup.avatarUrl} alt="" />
                              ) : (
                                <div className="avatar-fallback">
                                  {featuredGroup.name.charAt(0).toUpperCase()}
                                </div>
                              )}
                            </div>
                            <div className="group-card-content">
                              <div className="group-card-header">
                                <h4>{featuredGroup.name}</h4>
                                <span className={`category-badge ${featuredGroup.categoryClass}`}>
                                  {featuredGroup.categoryLabel.toUpperCase()}
                                </span>
                              </div>
                              <p className="group-card-description">
                                {featuredGroup.description || "Không có mô tả."}
                              </p>
                              <div className="group-card-footer">
                                <span className="member-pill">
                                  {featuredGroup.memberCount} thành viên
                                </span>
                                <button
                                  type="button"
                                  className="btn-primary"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleShowSoftConversation({
                                      ...featuredGroup.raw,
                                      userId: featuredGroup.id,
                                    });
                                  }}
                                >
                                  Vào chat
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {regularGroups.map((group) => {
                        const roleMeta = resolveGroupRoleMeta(group.currentUserRole);
                        const statusMeta = resolveGroupStatusMeta(group.status);
                        const actionMeta = resolveGroupActionMeta(group);
                        const isDisabled =
                          actionMeta.disabled ||
                          group.status === "ARCHIVED" ||
                          group.accessState === "DISABLED";
                        const privacyLabel =
                          group.privacy === "PUBLIC"
                            ? "Công khai"
                            : group.privacy === "INVITE_ONLY"
                            ? "Chỉ mời"
                            : "Riêng tư";

                        return (
                          <div
                            key={group.id}
                            className={`group-card ${isDisabled ? "disabled" : ""}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => handleOpenGroupDetail(group.id)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                handleOpenGroupDetail(group.id);
                              }
                            }}
                          >
                            <div className="group-card-main">
                              <div className="group-avatar">
                                {group.avatarUrl ? (
                                  <img src={group.avatarUrl} alt="" />
                                ) : (
                                  <div className="avatar-fallback">
                                    {group.name.charAt(0).toUpperCase()}
                                  </div>
                                )}
                              </div>
                              <div className="group-card-content">
                                <div className="group-card-header">
                                  <h4>{group.name}</h4>
                                  <span className={`category-badge ${group.categoryClass}`}>
                                    {group.categoryLabel.toUpperCase()}
                                  </span>
                                </div>
                                <p className="group-card-description">
                                  {group.description || "Chưa có mô tả."}
                                </p>
                                <div className="group-card-meta">
                                  <span>{group.memberCount} thành viên</span>
                                  <span>•</span>
                                  <span>{resolveRelativeTime(group.lastActiveAt)}</span>
                                </div>
                                <div className="group-card-badges">
                                  <span className={`role-badge ${roleMeta.className}`}>
                                    <roleMeta.icon />
                                    {roleMeta.label}
                                  </span>
                                  <span className={`status-badge ${statusMeta.className}`}>
                                    <statusMeta.icon />
                                    {statusMeta.label}
                                  </span>
                                  <span className="privacy-badge">{privacyLabel}</span>
                                </div>
                                <div className="group-card-footer">
                                  <div className="member-preview">
                                    {group.memberPreview.length > 0 ? (
                                      <>
                                        {group.memberPreview.map((member, idx) => (
                                          <div key={`${member.userId}-${idx}`} className="member-avatar">
                                            {member.avatarUrl ? (
                                              <img src={member.avatarUrl} alt="" />
                                            ) : (
                                              <div className="avatar-fallback">
                                                {(member.displayName || "M").charAt(0).toUpperCase()}
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                        {group.memberCount > group.memberPreview.length ? (
                                          <span className="member-more">
                                            +{group.memberCount - group.memberPreview.length}
                                          </span>
                                        ) : null}
                                      </>
                                    ) : (
                                      <span className="member-pill">{group.memberCount}</span>
                                    )}
                                  </div>
                                  <div className="group-card-actions">
                                    <button
                                      type="button"
                                      className="btn-primary"
                                      disabled={isDisabled}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        if (actionMeta.label === "Vào chat") {
                                          handleShowSoftConversation({
                                            ...group.raw,
                                            userId: group.id,
                                          });
                                        }
                                      }}
                                    >
                                      {actionMeta.label}
                                    </button>
                                    <details
                                      className="group-card-menu"
                                      onClick={(event) => event.stopPropagation()}
                                    >
                                      <summary aria-label="Thao tác khác">
                                        <HiOutlineEllipsisHorizontal />
                                      </summary>
                                      <div className="group-card-menu-panel">
                                        <button type="button">Tắt thông báo</button>
                                        <button type="button">Ghim nhóm</button>
                                        <button type="button" className="danger">Rời nhóm</button>
                                        <button type="button">Báo cáo</button>
                                      </div>
                                    </details>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              </div>

              {isGroupDetailOpen && selectedGroup ? (
                <div className="group-detail-drawer-overlay" onClick={handleCloseGroupDetail}>
                  <aside className="group-detail-drawer" onClick={(event) => event.stopPropagation()}>
                    <div className="group-detail-drawer-header">
                      <h4>Chi tiết nhóm</h4>
                      <button type="button" onClick={handleCloseGroupDetail} aria-label="Đóng">
                        ✕
                      </button>
                    </div>
                    <div className="group-detail-drawer-body">
                      <div className="group-detail-hero">
                        <div className="group-detail-avatar">
                          {selectedGroup.avatarUrl ? (
                            <img src={selectedGroup.avatarUrl} alt="" />
                          ) : (
                            <div className="avatar-fallback">
                              {selectedGroup.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div>
                          <h5>{selectedGroup.name}</h5>
                          <p>{selectedGroup.memberCount} thành viên</p>
                          <div className="group-detail-badges">
                            <span className={`role-badge ${resolveGroupRoleMeta(selectedGroup.currentUserRole).className}`}>
                              {resolveGroupRoleMeta(selectedGroup.currentUserRole).label}
                            </span>
                            <span className={`status-badge ${resolveGroupStatusMeta(selectedGroup.status).className}`}>
                              {resolveGroupStatusMeta(selectedGroup.status).label}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="group-detail-actions">
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() =>
                            handleShowSoftConversation({
                              ...selectedGroup.raw,
                              userId: selectedGroup.id,
                            })
                          }
                        >
                          Vào chat
                        </button>
                        {['OWNER', 'ADMIN'].includes(selectedGroup.currentUserRole) ? (
                          <button type="button" className="btn-outline">
                            Quản lý nhóm
                          </button>
                        ) : null}
                        <button type="button" className="btn-danger">
                          Rời nhóm
                        </button>
                      </div>

                      <div className="group-detail-section">
                        <h5>Thông tin nhóm</h5>
                        <div className="group-info-grid">
                          <div>
                            <span>Mô tả</span>
                            <p>{selectedGroup.description || "Chưa có mô tả."}</p>
                          </div>
                          <div>
                            <span>Danh mục</span>
                            <p>{selectedGroup.categoryLabel}</p>
                          </div>
                          <div>
                            <span>Quyền riêng tư</span>
                            <p>
                              {selectedGroup.privacy === "PUBLIC"
                                ? "Công khai"
                                : selectedGroup.privacy === "INVITE_ONLY"
                                ? "Chỉ mời"
                                : "Riêng tư"}
                            </p>
                          </div>
                          <div>
                            <span>Hoạt động gần nhất</span>
                            <p>{resolveRelativeTime(selectedGroup.lastActiveAt)}</p>
                          </div>
                        </div>
                      </div>

                      <div className="group-detail-section">
                        <h5>Thành viên nổi bật</h5>
                        {selectedGroup.memberPreview.length === 0 ? (
                          <p className="muted">Chưa có dữ liệu thành viên.</p>
                        ) : (
                          <div className="member-preview-list">
                            {selectedGroup.memberPreview.map((member) => (
                              <div key={member.userId} className="member-preview-item">
                                <div className="member-avatar">
                                  {member.avatarUrl ? (
                                    <img src={member.avatarUrl} alt="" />
                                  ) : (
                                    <div className="avatar-fallback">
                                      {(member.displayName || "M").charAt(0).toUpperCase()}
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <p>{member.displayName || member.username}</p>
                                  <span>{resolveGroupRoleMeta(member.role).label}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        <button type="button" className="btn-outline small">
                          Xem tất cả thành viên
                        </button>
                      </div>

                      {['OWNER', 'ADMIN'].includes(selectedGroup.currentUserRole) ? (
                        <div className="group-detail-section admin">
                          <h5>Quản trị nhóm</h5>
                          <div className="admin-actions-grid">
                            <button type="button">Sửa tên nhóm</button>
                            <button type="button">Đổi ảnh nhóm</button>
                            <button type="button">Quản lý thành viên</button>
                            <button type="button">Phân quyền quản trị</button>
                            <button type="button">Duyệt yêu cầu tham gia</button>
                            <button type="button">Thiết lập quyền nhóm</button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </aside>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <div className="header-content-menu-contact flex">
                <h3>{title}</h3>
              </div>
              <div className="list-fetch-contact">
                <div className="total-fetch">{count}</div>
                <div className="content-fetch-contact">
                  {(title === DanhSachBanBe || title === LoiMoiKetBan) && listData?.size > 0 ? (
                    <div>
                      <input
                        type="text"
                        placeholder="Tìm bạn bè"
                        value={searchKeyword}
                        onChange={handleSeachContact}
                      />
                    </div>
                  ) : null}
                  {title === DanhSachBanBe ? (
                    <div className="close-friend-filter-row">
                      <button
                        type="button"
                        className={`close-friend-filter-btn ${
                          friendFilter === FRIEND_FILTER_ALL ? "active" : ""
                        }`}
                        onClick={() => setFriendFilter(FRIEND_FILTER_ALL)}
                      >
                        Tất cả
                      </button>
                      <button
                        type="button"
                        className={`close-friend-filter-btn ${
                          friendFilter === FRIEND_FILTER_CLOSE ? "active" : ""
                        }`}
                        onClick={() => setFriendFilter(FRIEND_FILTER_CLOSE)}
                      >
                        Bạn thân
                      </button>
                    </div>
                  ) : null}
                  {closeFriendActionError ? (
                    <p className="close-friend-action-error">{closeFriendActionError}</p>
                  ) : null}

                  <ul
                    style={{
                      display: listData.size === 0 ? "flex" : undefined,
                      justifyContent: listData.size === 0 ? "center" : undefined,
                      alignItems: listData.size === 0 ? "center" : undefined,
                    }}
                  >
                    {listData.size > 0 ? (
                      entriesToRender.map(
                        ([key, item], index) => (
                          <li
                            key={index}
                            style={{ justifyContent: "space-between" }}
                            className="flex"
                          >
                            <div
                              className="item-fetch flex"
                              onClick={() =>
                                handleShowSoftConversation({
                                  ...item,
                                  userId: item.userId || item._id,
                                })
                              }
                            >
                              <img
                                src={item.avatar || item.avatarUrl}
                                alt={`avatar by ${item.username || item.displayName}`}
                              />
                              <div className="friend-item-name-wrap">
                                <p>{item.username || item.displayName}</p>
                                {item.isCloseFriend ? (
                                  <span className="friend-close-badge">Bạn thân</span>
                                ) : null}
                              </div>
                            </div>
                            <div className="btn-state-contact" >
                              {item.BanBe ? (
                                <button
                                  style={{ backgroundColor: "rgb(220 224 227)", color: "black" }}
                                  onClick={(e) => handleCrudFriend(item, e, key)}
                                >
                                  {XOA_BAN_BE}
                                </button>
                              ) : null}
                              {item.BanBe ? (
                                <button onClick={(e) => handleCrudFriend(item, e, key)}>
                                  {BAN_BE}
                                </button>
                              ) : null}
                              {item.BanBe ? (
                                <button
                                  style={{
                                    backgroundColor: item.isCloseFriend ? "#ffe8ef" : "#eaf2ff",
                                    color: item.isCloseFriend ? "#a61b43" : "#1d4ed8",
                                  }}
                                  onClick={() => handleToggleCloseFriend(item)}
                                  disabled={pendingCloseFriendId === String(item.userId || item._id)}
                                >
                                  {pendingCloseFriendId === String(item.userId || item._id)
                                    ? "Đang cập nhật..."
                                    : item.isCloseFriend
                                    ? BO_BAN_THAN
                                    : GAN_BAN_THAN}
                                </button>
                              ) : null}
                              {item.KetBan ? (
                                <button onClick={(e) => handleCrudFriend(item, e, key)}>
                                  {KET_BAN}
                                </button>
                              ) : null}
                              {item.DongY ? (
                                <button onClick={(e) => handleCrudFriend(item, e, key)}>
                                  {BO_QUA}
                                </button>
                              ) : null}
                              {item.DongY ? (
                                <button onClick={(e) => handleCrudFriend(item, e, key)}>
                                  {DONG_Y}
                                </button>
                              ) : null}
                              {item.ThuHoiLoiMoi ? (
                                <button onClick={(e) => handleCrudFriend(item, e, key)}>
                                  {HUY_LOI_MOI_KET_BAN}
                                </button>
                              ) : null}
                              {item.Chan ? (
                                <button
                                  style={{ backgroundColor: "#fff1d6", color: "#92400e" }}
                                  onClick={(e) => handleCrudFriend(item, e, key)}
                                >
                                  {CHAN}
                                </button>
                              ) : null}

                              {item.BoChan ? (
                                <button
                                  style={{ backgroundColor: "#eaedf0", color: "black" }}
                                  onClick={(e) => handleCrudFriend(item, e, key)}
                                >
                                  {BO_CHAN}
                                </button>
                              ) : null}
                            </div>
                          </li>
                        )
                      )
                    ) : (
                      <div>
                        <img
                          src="https://chat.zalo.me/assets/invitation-emptystate.248ad1da229565685f19d3d527985812.png"
                          alt=""
                        />
                        <p style={{ padding: "10px", color: "#7589a3" }}>Không có dữ liệu</p>
                      </div>
                    )}
                    {showCloseFriendEmptyState ? (
                      <div className="close-friend-empty">
                        <p>Bạn chưa gắn bạn thân nào.</p>
                        <p>Hãy mở hồ sơ bạn bè và chọn Gắn bạn thân.</p>
                      </div>
                    ) : null}
                  </ul>
                </div>
              </div>
              {friendReq?.length > 0 && title === LoiMoiKetBan ? (
                <div>
                  <div className="list-fetch-contact">
                    <div className="total-fetch">Lời mời đã gửi ({friendReq?.length})</div>
                  </div>
                  <div className="friend-req">
                    <ul className="flex">
                      {friendReq.map((item, index) => (
                        <li key={index}>
                          <div className="flex" style={{ justifyContent: "space-between" }}>
                            <div className="item-fetch flex">
                              <img src={item.avatar || item.avatarUrl} alt="" />
                              <p>{item.username || item.displayName}</p>
                            </div>
                            <div
                              className="btn-soft-mess"
                              onClick={() =>
                                handleShowSoftConversation({
                                  ...item,
                                  userId: item.userId || item._id,
                                })
                              }
                            >
                              <TbMessageDots />
                            </div>
                          </div>
                          <div>
                            <div>
                              <button disabled>Đã gửi lời mời</button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </>
  );
}


