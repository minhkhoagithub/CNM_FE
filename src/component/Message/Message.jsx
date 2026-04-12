import React, { useContext } from "react";
import { ContactContext } from "../../Context/ContactConext";
import MessageInfor from "./MessageInfor";
import Contact from "./Contact";
import ContainerMess from "./ContainerMess";
import { openOrCreatePrivateConversationV1 } from "../../services/chat/conversationApi";

export default function Message({ showPageAddressBook }) {
  const { currentConversationNormalized, openConversation, clearSelectedConversation } =
    useContext(ContactContext);
  const [openChatError, setOpenChatError] = React.useState("");

  const activeConversation = currentConversationNormalized;

  const resolveConversation = async (value) => {
    const participantId = value?.userId || value?._id || null;

    if (!participantId) {
      throw new Error("Missing participant user id");
    }

    return openConversation(await openOrCreatePrivateConversationV1(participantId));
  };

  const handleChangeContact = async (value) => {
    setOpenChatError("");

    try {
      if (value?.id) {
        openConversation(value);
        return;
      }

      await resolveConversation({ ...value, userId: value?.userId || value?._id });
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
          {activeConversation !== null ? <ContainerMess contactData={activeConversation} /> : ""}
        </div>
        <div>
          {activeConversation !== null ? <MessageInfor contactData={activeConversation} /> : ""}
        </div>
      </div>
    </>
  );
}
