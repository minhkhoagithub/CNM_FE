/* eslint-disable react-refresh/only-export-components */
import { createContext, useState } from "react";
import { setChatUserId } from "../services/chat/chatSession";

export const UserContext = createContext(null);

export const UserProvider = ({ children }) => {
  const [userData, setUserDataState] = useState(null);

  // Wrapper để transform user data từ BE sang format FE
  const setUserData = (beUserData) => {
    if (!beUserData) {
      setChatUserId(null);
      setUserDataState(null);
      return;
    }

    const transformedData = {
      _id: beUserData.userId || beUserData._id,
      userId: beUserData.userId || beUserData._id,
      avatar: beUserData.avatarUrl || beUserData.avatar,
      avatarUrl: beUserData.avatarUrl || beUserData.avatar,
      coverUrl: beUserData.coverUrl || beUserData.cover_url || '',
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

    setChatUserId(transformedData.userId);
    setUserDataState(transformedData);
  };

  return (
    <UserContext.Provider
      value={{
        userData,
        setUserData,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};
