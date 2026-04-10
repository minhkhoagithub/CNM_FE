import { createContext, useEffect, useState, useRef, useContext } from "react";
import io from "socket.io-client";

export const UserContext = createContext(null);

export const UserProvider = ({ children }) => {
  const [userData, setUserDataState] = useState(null);
  const optionSocket = {
    transports: ["websocket"],
  };
  const socket = useRef();

  // Wrapper để transform user data từ BE sang format FE
  const setUserData = (beUserData) => {
    if (!beUserData) {
      setUserDataState(null);
      return;
    }

    const transformedData = {
      _id: beUserData.userId || beUserData._id,
      userId: beUserData.userId || beUserData._id,
      avatar: beUserData.avatarUrl || beUserData.avatar,
      avatarUrl: beUserData.avatarUrl || beUserData.avatar,
      username: beUserData.username,
      displayName: beUserData.displayName,
      firstName: beUserData.firstName,
      lastName: beUserData.lastName,
      phone: beUserData.phone,
      gender: beUserData.gender,
      dob: beUserData.dob,
      bio: beUserData.bio,
      createdAt: beUserData.createdAt,
      updatedAt: beUserData.updatedAt,
    };

    setUserDataState(transformedData);
  };

  useEffect(() => {
    if (userData !== null) {
      socket.current = io("https://192.168.41.26");
      socket.current.emit("add-user", { id: userData._id });
    }
  }, [userData]);

  return (
    <UserContext.Provider
      value={{
        userData,
        socket,
        setUserData,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};
