import React, { useCallback, useContext, useEffect, useState } from "react";
import { ContactContext } from "../../Context/ContactConext";
import { UserContext } from "../../Context/UserContext";
import MessageInfor from "./MessageInfor";
import Contact from "./Contact";
import ContainerMess from "./ContainerMess";
import ConversationImageGallery from "./ConversationImageGallery";
import { fetchConversationSharedAttachments } from "./conversationMedia";

export default function Message({ showPageAddressBook }) {
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

  const activeConversation = currentConversationNormalized;
  const currentUserId = userData?.userId || userData?._id || null;
  const conversationId = activeConversation?.id || null;
  const conversationName =
    activeConversation?.displayName ||
    activeConversation?.trustedDisplayName ||
    "Anh trong hoi thoai";

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
  }, [conversationId, handleCloseImageGallery]);

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
        fileName: clickedImage.fileName || "Anh trong hoi thoai",
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
            fileName: attachment.fileName || "Anh trong hoi thoai",
            createdAt: attachment.createdAt || null,
          }));

        if (!imageItems.length) {
          setImageGalleryState({
            isOpen: true,
            loading: false,
            error: "Khong tim thay anh trong hoi thoai nay.",
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
          error: "Khong the tai gallery anh luc nay.",
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
            />
          ) : (
            ""
          )}
        </div>
        {activeConversation !== null ? (
          <div className="message-layout-info">
            <MessageInfor
              onOpenConversationImageGallery={handleOpenConversationImageGallery}
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
