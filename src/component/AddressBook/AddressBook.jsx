import React, { useContext, useState } from "react";
import { ContactContext } from "../../Context/ContactConext";
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
  const { openConversation, openPrivateConversationForUser } =
    useContext(ContactContext);

  const handleChangeContact = async (value) => {
    setOpenChatError("");

    try {
      if (value?.id) {
        openConversation(value);
      } else {
        await openPrivateConversationForUser(value);
      }
    } catch (err) {
      console.error(err);
      setOpenChatError("Không thể mở cuộc trò chuyện này.");
    }
  };

  const handleSetContentMenuContact = (value) => {
    setShowContentMenuContact(value);
  };

  const handleShowSoftConversation = (conversation) => {
    handleChangeContact(conversation);
  };

  return (
    <div className="container-mess address-book-layout flex">
      <div className="address-book-menu">
        <MenuContact
          handleChangeContact={handleChangeContact}
          handleSetContentMenuContact={handleSetContentMenuContact}
        />
      </div>

      <div className="fetch-menu-contact address-book-content">
        {openChatError ? (
          <div style={{ color: "#b42318", padding: "12px 16px", fontSize: "14px" }}>
            {openChatError}
          </div>
        ) : null}
        {showContentMenuContact.state ? (
          <ContentMenuContact
            key={`${showContentMenuContact?.title || "none"}-${
              showContentMenuContact?.count || "0"
            }`}
            dataContentContac={showContentMenuContact?.data}
            title={showContentMenuContact?.title}
            count={showContentMenuContact?.count}
            handleShowSoftConversation={handleShowSoftConversation}
          />
        ) : null}
      </div>
    </div>
  );
}
