import React, { useContext, useState } from "react";
import { ContactContext } from "../../Context/ContactConext";
import MessageInfor from "../Message/MessageInfor";
import ContainerMess from "../Message/ContainerMess";
import MenuContact from "./MenuContact";
import ContentMenuContact from "./ContentMenuContact";

export default function AddressBook() {
  const [openChatError, setOpenChatError] = useState("");
  const [showContentMenuContact, setShowContentMenuContact] = useState({
    state: false,
    data: null,
    title: null,
    count: null,
  });
  const {
    currentConversationNormalized,
    openConversation,
    openPrivateConversationForUser,
  } = useContext(ContactContext);

  const handleChangeContact = async (value) => {
    setOpenChatError("");

    try {
      if (value?.id) {
        openConversation(value);
      } else {
        await openPrivateConversationForUser(value);
      }
      setShowContentMenuContact({
        state: false,
        data: null,
        title: null,
        count: null,
      });
    } catch (err) {
      console.error(err);
      setOpenChatError("Khong the mo cuoc tro chuyen nay.");
    }
  };

  const handleSetContentMenuContact = (value) => {
    setShowContentMenuContact(value);
  };

  const handleShowSoftConversation = (conversation) => {
    handleChangeContact(conversation);
  };

  return (
    <div className="container-mess flex">
      <div>
        <MenuContact
          handleChangeContact={handleChangeContact}
          handleSetContentMenuContact={handleSetContentMenuContact}
        />
      </div>

      <div className="fetch-menu-contact">
        {openChatError ? (
          <div style={{ color: "#b42318", padding: "12px 16px", fontSize: "14px" }}>
            {openChatError}
          </div>
        ) : null}
        {showContentMenuContact.state ? (
          <ContentMenuContact
            key={`${showContentMenuContact?.title || "none"}-${showContentMenuContact?.count || "0"}`}
            dataContentContac={showContentMenuContact?.data}
            title={showContentMenuContact?.title}
            count={showContentMenuContact?.count}
            handleShowSoftConversation={handleShowSoftConversation}
          />
        ) : null}
      </div>

      <div>{currentConversationNormalized ? <ContainerMess /> : null}</div>
      <div>{currentConversationNormalized ? <MessageInfor /> : null}</div>
    </div>
  );
}
