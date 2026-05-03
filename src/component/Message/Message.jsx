import React, { useCallback, useContext, useEffect, useState } from "react";
import { ContactContext } from "../../Context/ContactConext";
import { UserContext } from "../../Context/UserContext";
import MessageInfor from "./MessageInfor";
import Contact from "./Contact";
import ContainerMess from "./ContainerMess";
import ConversationImageGallery from "./ConversationImageGallery";
import { fetchConversationSharedAttachments } from "./conversationMedia";

const INFO_PANEL_BREAKPOINT = 1180;
const getInitialInfoPanelVisibility = () => {
  if (typeof window === "undefined") {
    return true;
  }

  return window.innerWidth > INFO_PANEL_BREAKPOINT;
};

export default function Message({ showPageAddressBook, onConversationSelect }) {
  const {
    currentConversationNormalized,
    openConversation,
    openPrivateConversationForUser,
    clearSelectedConversation,
  } =
    useContext(ContactContext);
  const { userData } = useContext(UserContext);
  const [openChatError, setOpenChatError] = React.useState("");
  const [imageGalleryState, setImageGalleryState] = useState({
    isOpen: false,
    loading: false,
    error: "",
    images: [],
    activeImageId: null,
    isPartial: false,
  });
  const [isInfoPanelVisible, setIsInfoPanelVisible] = useState(
    getInitialInfoPanelVisibility
  );

  const activeConversation = currentConversationNormalized;
  const currentUserId = userData?.userId || userData?._id || null;
  const conversationId = activeConversation?.id || null;
  const conversationName =
    activeConversation?.displayName ||
    activeConversation?.trustedDisplayName ||
    "Ảnh trong hội thoại";

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
      setOpenChatError("Không thể mở cuộc trò chuyện này.");
    }
  };

  const handleDisableContainer = () => {
    clearSelectedConversation();
  };

  const handleCloseImageGallery = useCallback(() => {
    setImageGalleryState({
      isOpen: false,
      loading: false,
      error: "",
      images: [],
      activeImageId: null,
      isPartial: false,
    });
  }, []);

  useEffect(() => {
    handleCloseImageGallery();
    if (onConversationSelect) {
      onConversationSelect(conversationId);
    }
  }, [conversationId, handleCloseImageGallery, onConversationSelect]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleResponsiveInfoPanel = () => {
      setIsInfoPanelVisible(window.innerWidth > INFO_PANEL_BREAKPOINT);
    };

    window.addEventListener("resize", handleResponsiveInfoPanel);
    return () => {
      window.removeEventListener("resize", handleResponsiveInfoPanel);
    };
  }, []);

  const handleSelectGalleryImage = useCallback((imageId) => {
    setImageGalleryState((prevState) => ({
      ...prevState,
      activeImageId: imageId,
    }));
  }, []);

  const handleNavigateGallery = useCallback((direction) => {
    setImageGalleryState((prevState) => {
      const images = Array.isArray(prevState.images) ? prevState.images : [];
      if (images.length <= 1) {
        return prevState;
      }

      const currentIndex = images.findIndex(
        (image) =>
          String(image?.id || image?.url) === String(prevState.activeImageId)
      );
      const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex = (safeCurrentIndex + direction + images.length) % images.length;

      return {
        ...prevState,
        activeImageId: images[nextIndex]?.id || images[nextIndex]?.url || null,
      };
    });
  }, []);

  const handleOpenConversationImageGallery = useCallback(
    async (clickedImage) => {
      if (!conversationId || !clickedImage?.url) {
        return;
      }

      const fallbackImage = {
        id: clickedImage.id || clickedImage.url,
        url: clickedImage.url,
        fileName: clickedImage.fileName || "Ảnh trong hội thoại",
      };

      setImageGalleryState({
        isOpen: true,
        loading: true,
        error: "",
        images: [fallbackImage],
        activeImageId: fallbackImage.id,
        isPartial: false,
      });

      try {
        const { attachments, isPartial } = await fetchConversationSharedAttachments({
          conversationId,
          currentUserId,
        });
        const imageItems = attachments
          .filter((attachment) => attachment.isImage)
          .map((attachment) => ({
            id: attachment.id || attachment.url,
            url: attachment.url,
            fileName: attachment.fileName || "Ảnh trong hội thoại",
            createdAt: attachment.createdAt || null,
          }));

        if (!imageItems.length) {
          setImageGalleryState({
            isOpen: true,
            loading: false,
            error: "Không tìm thấy ảnh trong hội thoại này.",
            images: [fallbackImage],
            activeImageId: fallbackImage.id,
            isPartial: false,
          });
          return;
        }

        const matchedImage = imageItems.find(
          (image) =>
            String(image.id) === String(fallbackImage.id) || image.url === fallbackImage.url
        );

        setImageGalleryState({
          isOpen: true,
          loading: false,
          error: "",
          images: imageItems,
          activeImageId: matchedImage?.id || imageItems[0]?.id || null,
          isPartial,
        });
      } catch (error) {
        console.error("Failed to load conversation image gallery:", error);

        setImageGalleryState({
          isOpen: true,
          loading: false,
          error: "Không thể tải thư viện ảnh lúc này.",
          images: [fallbackImage],
          activeImageId: fallbackImage.id,
          isPartial: false,
        });
      }
    },
    [conversationId, currentUserId]
  );

  return (
    <>
      <div className="container-mess message-layout flex">
        <div className="message-layout-sidebar">
          <Contact
            handleChangeContact={handleChangeContact}
            showPageAddressBook={showPageAddressBook}
            disableContainer={handleDisableContainer}
          />
        </div>
        <div className="message-layout-chat">
          {openChatError ? (
            <div style={{ color: "#b42318", padding: "12px 16px", fontSize: "14px" }}>
              {openChatError}
            </div>
          ) : null}
          {activeConversation !== null ? (
            <ContainerMess
              onOpenConversationImageGallery={handleOpenConversationImageGallery}
              isInfoPanelVisible={isInfoPanelVisible}
              onToggleInfoPanel={() =>
                setIsInfoPanelVisible((previousState) => !previousState)
              }
            />
          ) : (
            ""
          )}
        </div>
        {activeConversation !== null && isInfoPanelVisible ? (
          <div className="message-layout-info">
            <MessageInfor
              onOpenConversationImageGallery={handleOpenConversationImageGallery}
              onRequestClose={() => setIsInfoPanelVisible(false)}
            />
          </div>
        ) : null}
      </div>
      <ConversationImageGallery
        isOpen={imageGalleryState.isOpen}
        images={imageGalleryState.images}
        activeImageId={imageGalleryState.activeImageId}
        conversationName={conversationName}
        loading={imageGalleryState.loading}
        error={imageGalleryState.error}
        isPartial={imageGalleryState.isPartial}
        onClose={handleCloseImageGallery}
        onSelectImage={handleSelectGalleryImage}
        onNavigate={handleNavigateGallery}
      />
    </>
  );
}



