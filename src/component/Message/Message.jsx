import React, { useContext } from "react";
import { ContactContext } from "../../Context/ContactConext";
import MessageInfor from "./MessageInfor";
import Contact from "./Contact";
import ContainerMess from "./ContainerMess";
import { UserContext } from "../../Context/UserContext";
import { createConversationV1 } from "../../services/chat/conversationApi";
import { mapConversation } from "../../mappers/conversationMapper";

export default function Message({ showPageAddressBook }) {
  const { currentConversationNormalized, openConversation, clearSelectedConversation } =
    useContext(ContactContext);
  const { userData } = useContext(UserContext);

  const activeConversation = currentConversationNormalized;

  const resolveConversation = async (value) => {
    const participantId = value?.userId || value?._id || null;

    if (!participantId) {
      return null;
    }

    const response = await createConversationV1({
      type: "PRIVATE",
      participantIds: [participantId],
    });

    return openConversation(mapConversation(response));
  };

  const handleChangeContact = async (value) => {
    try {
      if (value?.id) {
        openConversation(value);
        return;
      }

      await resolveConversation({ ...value, userId: value?.userId || userData?._id });
    } catch (err) {
      console.error(err);
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
          {activeConversation !== null ? <ContainerMess contactData={activeConversation} /> : ""}
        </div>
        <div>
          {activeConversation !== null ? <MessageInfor contactData={activeConversation} /> : ""}
        </div>
      </div>
    </>
  );
}
