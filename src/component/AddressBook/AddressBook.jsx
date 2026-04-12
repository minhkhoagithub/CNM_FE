import React, { useContext, useState } from "react";
import { ContactContext } from "../../Context/ContactConext";
import MessageInfor from "../Message/MessageInfor";
import ContainerMess from "../Message/ContainerMess";
import MenuContact from "./MenuContact";
import ContentMenuContact from "./ContentMenuContact";
import { openOrCreatePrivateConversationV1 } from "../../services/chat/conversationApi";

export default function AddressBook() {
  const [dataContact, setDataContact] = useState(null);
  const [openChatError, setOpenChatError] = useState("");
  const [showContentMenuContact, setShowContentMenuContact] = useState({
    state: false,
    data: null,
    title: null,
    count: null,
  });
  const { openConversation } = useContext(ContactContext);

  const resolveConversation = async (value) => {
    if (value?.id) {
      const nextConversation = openConversation(value);
      setDataContact(nextConversation);
      return nextConversation;
    }

    const participantId = value?.userId || value?._id || null;
    if (!participantId) {
      throw new Error("Missing participant user id");
    }

    const nextConversation = openConversation(
      await openOrCreatePrivateConversationV1(participantId)
    );
    setDataContact(nextConversation);
    return nextConversation;
  };

  const handleChangeContact = async (value) => {
    setOpenChatError("");

    try {
      await resolveConversation(value);
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

      <div>{dataContact ? <ContainerMess contactData={dataContact} /> : null}</div>
      <div>{dataContact ? <MessageInfor contactData={dataContact} /> : null}</div>
    </div>
  );
}
