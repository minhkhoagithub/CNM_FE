import React, { useContext, useState } from "react";
import { ContactContext } from "../../Context/ContactConext";
import MessageInfor from "../Message/MessageInfor";
import ContainerMess from "../Message/ContainerMess";
import MenuContact from "./MenuContact";
import ContentMenuContact from "./ContentMenuContact";
import { createConversationV1 } from "../../services/chat/conversationApi";
import { mapConversation } from "../../mappers/conversationMapper";

export default function AddressBook() {
  const [dataContact, setDataContact] = useState(null);
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
      return null;
    }

    const response = await createConversationV1({
      type: "PRIVATE",
      participantIds: [participantId],
    });
    const nextConversation = openConversation(mapConversation(response));
    setDataContact(nextConversation);
    return nextConversation;
  };

  const handleChangeContact = async (value) => {
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
