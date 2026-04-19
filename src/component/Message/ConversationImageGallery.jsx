import React, { memo, useEffect, useMemo } from "react";
import { IoMdClose } from "react-icons/io";
import { IoChevronBack, IoChevronForward } from "react-icons/io5";
import "../../resource/style/Chat/imageGallery.css";

function ConversationImageGallery({
  isOpen,
  images,
  activeImageId,
  conversationName,
  loading,
  error,
  isPartial,
  onClose,
  onSelectImage,
  onNavigate,
}) {
  const normalizedImages = useMemo(
    () => (Array.isArray(images) ? images : []),
    [images]
  );

  const activeImageIndex = useMemo(
    () =>
      normalizedImages.findIndex(
        (image) => String(image?.id || image?.url) === String(activeImageId)
      ),
    [activeImageId, normalizedImages]
  );

  const activeImage =
    activeImageIndex >= 0 ? normalizedImages[activeImageIndex] : normalizedImages[0] || null;

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key === "ArrowLeft") {
        onNavigate(-1);
        return;
      }

      if (event.key === "ArrowRight") {
        onNavigate(1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose, onNavigate]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="conversation-gallery-overlay" onClick={onClose}>
      <div className="conversation-gallery-shell" onClick={(event) => event.stopPropagation()}>
        <div className="conversation-gallery-header">
          <div className="conversation-gallery-heading">
            <h3>{conversationName || "Ảnh trong hội thoại"}</h3>
            <p>
              {normalizedImages.length
                ? `${activeImageIndex >= 0 ? activeImageIndex + 1 : 1} / ${normalizedImages.length} anh`
                : "Đang tải thư viện ảnh..."}
            </p>
          </div>
          <button
            type="button"
            className="conversation-gallery-close"
            onClick={onClose}
            aria-label="Dong gallery"
          >
            <IoMdClose />
          </button>
        </div>

        <div className="conversation-gallery-stage">
          <button
            type="button"
            className="conversation-gallery-nav"
            onClick={() => onNavigate(-1)}
            disabled={normalizedImages.length <= 1}
            aria-label="Anh truoc"
          >
            <IoChevronBack />
          </button>

          <div className="conversation-gallery-main">
            {activeImage ? (
              <>
                <img src={activeImage.url} alt={activeImage.fileName || ""} />
                <div className="conversation-gallery-image-meta">
                  <strong>{activeImage.fileName || "Ảnh trong hội thoại"}</strong>
                </div>
              </>
            ) : (
              <div className="conversation-gallery-status">
            {loading ? "Đang tải thư viện ảnh..." : error || "Không có ảnh trong hội thoại."}
              </div>
            )}

            {loading && activeImage ? (
              <div className="conversation-gallery-loading-chip">Đang đồng bộ ảnh...</div>
            ) : null}
          </div>

          <button
            type="button"
            className="conversation-gallery-nav"
            onClick={() => onNavigate(1)}
            disabled={normalizedImages.length <= 1}
            aria-label="Anh tiep theo"
          >
            <IoChevronForward />
          </button>
        </div>

        {error && normalizedImages.length ? (
          <p className="conversation-gallery-inline-message error">{error}</p>
        ) : null}
        {isPartial ? (
          <p className="conversation-gallery-inline-message">
            Đang hiển thị ảnh gần đây trong hội thoại.
          </p>
        ) : null}

        <div className="conversation-gallery-strip">
          {normalizedImages.map((image) => {
            const imageKey = image?.id || image?.url;
            const isActive = String(imageKey) === String(activeImage?.id || activeImage?.url);

            return (
              <button
                key={imageKey}
                type="button"
                className={`conversation-gallery-thumb ${isActive ? "active" : ""}`}
                onClick={() => onSelectImage(imageKey)}
                aria-label={image?.fileName || "Chon anh"}
              >
                <img src={image.url} alt={image.fileName || ""} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default memo(ConversationImageGallery);



