import React, { useContext } from "react";
import { ContactContext } from "../../Context/ContactConext";
import MessageInfor from "./MessageInfor";
import Contact from "./Contact";
import ContainerMess from "./ContainerMess";

export default function Message({ showPageAddressBook }) {
  const {
    currentConversationNormalized,
    openConversation,
    openPrivateConversationForUser,
    clearSelectedConversation,
  } =
    useContext(ContactContext);
  const [openChatError, setOpenChatError] = React.useState("");

  const activeConversation = currentConversationNormalized;

  const handleChangeContact = async (value) => {
    setOpenChatError("");

    try {
      if (value?.id) {
        openConversation(value);
        return;
      }

      await openPrivateConversationForUser(value);
    } catch (err) {
      console.error(err);
      setOpenChatError("Khong the mo cuoc tro chuyen nay.");
    }
  };

  const handleDisableContainer = () => {
    clearSelectedConversation();
  };

  return (
    <>
      <div className="container-mess flex">
        <div>
          <Contact
            handleChangeContact={handleChangeContact}
            showPageAddressBook={showPageAddressBook}
            disableContainer={handleDisableContainer}
          />
        </div>
        <div>
          {openChatError ? (
            <div style={{ color: "#b42318", padding: "12px 16px", fontSize: "14px" }}>
              {openChatError}
            </div>
          ) : null}
          {activeConversation !== null ? <ContainerMess /> : ""}
        </div>
        <div>
          {activeConversation !== null ? <MessageInfor /> : ""}
        </div>
      </div>
    </>
  );
}
