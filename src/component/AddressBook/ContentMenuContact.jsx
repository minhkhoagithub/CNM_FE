import React, { useContext, useEffect, useState } from "react";
import "../../resource/style/AddressBook/contentMenuContact.css";
import {
  LoiMoiKetBan,
  LoiMoiVaoNhom,
  DanhSachBanBe,
  DanhSachNhom,
} from "./MenuContact";
import { UserContext } from "../../Context/UserContext";
import { TbMessageDots } from "react-icons/tb";
// import { crudFriend, getFriendReq } from "../../util/api";
import {
  getOutgoingFriendRequestsV2,
  acceptFriendRequestV2,
  rejectFriendRequestV2,
  unfriendUserV2,
} from "../../util/api";


export const HUY_LOI_MOI_KET_BAN = "Thu hoi loi moi";
export const KET_BAN = "Ket ban";
export const DONG_Y = "Dong y";
export const BAN_BE = "Ban be";
export const XOA_BAN_BE = "Xoa ban be";
export const BO_QUA = "Bo qua";

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

useEffect(() => {
  setListData(buildListData(dataContentContac, title));
  setSearchKeyword("");
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
  useEffect(() => {
  const fetch = async () => {
    if (title === LoiMoiKetBan) {
      const response = await getOutgoingFriendRequestsV2();
      if (response.status === 200 && Array.isArray(response.data)) {
        setFriendReq(response.data.map(mapOutgoingRequestToUi));
      } else {
        setFriendReq([]);
      }
    }
  };

  fetch();
}, [title, userData?._id]);


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

      return nextState;
    });
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


  return (
    <>
      {listData ? (
        <div className="waper-content-menu-contact">
          <div className="header-content-menu-contact flex">
            <h3>{title}</h3>
          </div>
          <div className="list-fetch-contact">
            <div className="total-fetch">{count}</div>
            <div className="content-fetch-contact">
              {/* {listData?.size > 0 ? (
                <div>
                  <input type="text" placeholder="Tim kiem" onChange={handleSeachContact} />
                </div>
              ) : null} */}
              {(title === DanhSachBanBe ||title === LoiMoiKetBan) && listData?.size > 0 ? (
                <div>
                  <input
                    type="text"
                    placeholder="Tim ban be"
                    value={searchKeyword}
                    onChange={handleSeachContact}
                  />
                </div>
              ) : null}

              <ul
                style={{
                  display: listData.size === 0 ? "flex" : undefined,
                  justifyContent: listData.size === 0 ? "center" : undefined,
                  alignItems: listData.size === 0 ? "center" : undefined,
                }}
              >
                {listData.size > 0 ? (
                  Array.from(resultSearch.state ? resultSearch.data : listData).map(
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
                          <p>{item.username || item.displayName}</p>
                        </div>
                        <div className="btn-state-contact" style={{ display: "none" }}>
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
                    <p style={{ padding: "10px", color: "#7589a3" }}>Khong co du lieu</p>
                  </div>
                )}
              </ul>
            </div>
          </div>
          {friendReq?.length > 0 && title === LoiMoiKetBan ? (
            <div>
              <div className="list-fetch-contact">
                <div className="total-fetch">Loi moi da gui ({friendReq?.length})</div>
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
                        {/* <button onClick={(e) => handleCrudFriend(item, e)}>
                          Thu hoi loi moi
                        </button> */}
                        <div>
                          <button disabled>Da gui loi moi</button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
