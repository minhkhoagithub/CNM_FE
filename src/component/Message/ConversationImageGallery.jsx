import React, { memo, useEffect, useMemo, useState } from "react";
import { IoMdClose } from "react-icons/io";
import {
  IoChevronBack,
  IoChevronForward,
  IoDownloadOutline,
  IoEllipsisVertical,
  IoImageOutline,
  IoSearchOutline,
  IoShareSocialOutline,
  IoVideocamOutline,
} from "react-icons/io5";
import "../../resource/style/Chat/imageGallery.css";

const formatSharedDate = (value) => {
  if (!value) {
    return "";
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  return parsedDate.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

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
  const [shareMessage, setShareMessage] = useState("");

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

  const activeImageKey = String(activeImage?.id || activeImage?.url || "");

  const handleDownloadActiveImage = () => {
    if (!activeImage?.url) {
      return;
    }

    const link = document.createElement("a");
    link.href = activeImage.url;
    link.download = activeImage.fileName || "image";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.click();
  };

  const handleShareActiveImage = () => {
    if (!activeImage?.url) {
      return;
    }

    if (navigator.share) {
      navigator
        .share({
          title: activeImage.fileName || "Ảnh trong hội thoại",
          url: activeImage.url,
        })
        .then(() => {
          setShareMessage("Đã mở menu chia sẻ.");
        })
        .catch(() => {
          setShareMessage("Đã hủy chia sẻ.");
        });
      return;
    }

    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(activeImage.url)
        .then(() => {
          setShareMessage("Đã sao chép liên kết ảnh.");
        })
        .catch(() => {
          setShareMessage("Không thể sao chép liên kết.");
        });
      return;
    }

    setShareMessage("Trình duyệt không hỗ trợ chia sẻ.");
  };

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

  useEffect(() => {
    if (!shareMessage) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setShareMessage("");
    }, 2200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [shareMessage]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="conversation-gallery-overlay" onClick={onClose}>
      <div className="conversation-gallery-shell" onClick={(event) => event.stopPropagation()}>
        <header className="conversation-gallery-header">
          <div className="conversation-gallery-header-left">
            <button
              type="button"
              className="conversation-gallery-close"
              onClick={onClose}
              aria-label="Đóng gallery"
            >
              <IoMdClose />
            </button>
            <div className="conversation-gallery-heading">
              <h3>{activeImage?.fileName || "Ảnh trong hội thoại"}</h3>
              <p>
                {normalizedImages.length
                  ? `${activeImageIndex >= 0 ? activeImageIndex + 1 : 1} / ${normalizedImages.length} • ${conversationName || "Shared Media"}`
                  : "Đang tải thư viện ảnh..."}
              </p>
            </div>
          </div>

          <div className="conversation-gallery-toolbar">
            <button
              type="button"
              className="conversation-gallery-action-btn"
              onClick={handleDownloadActiveImage}
              disabled={!activeImage?.url}
            >
              <IoDownloadOutline />
              <span>Download</span>
            </button>
            <button
              type="button"
              className="conversation-gallery-action-btn primary"
              onClick={handleShareActiveImage}
              disabled={!activeImage?.url}
            >
              <IoShareSocialOutline />
              <span>Share</span>
            </button>
            <span className="conversation-gallery-toolbar-divider" aria-hidden="true" />
            <button type="button" className="conversation-gallery-icon-btn" aria-label="Zoom ảnh">
              <IoSearchOutline />
            </button>
            <button type="button" className="conversation-gallery-icon-btn" aria-label="Tùy chọn">
              <IoEllipsisVertical />
            </button>
          </div>
        </header>

        <div className="conversation-gallery-workspace">
          <div className="conversation-gallery-stage-card">
            <div className="conversation-gallery-stage-head">
              <strong>{conversationName || "Shared Media"}</strong>
              <span>{normalizedImages.length} ảnh</span>
            </div>

            <div className="conversation-gallery-stage">
              <button
                type="button"
                className="conversation-gallery-nav"
                onClick={() => onNavigate(-1)}
                disabled={normalizedImages.length <= 1}
                aria-label="Ảnh trước"
              >
                <IoChevronBack />
              </button>

              <div className="conversation-gallery-main">
                {activeImage ? (
                  <>
                    <img src={activeImage.url} alt={activeImage.fileName || ""} />
                    <div className="conversation-gallery-image-meta">
                      <strong>{activeImage.fileName || "Ảnh trong hội thoại"}</strong>
                      {formatSharedDate(activeImage?.createdAt) ? (
                        <span>{formatSharedDate(activeImage.createdAt)}</span>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <div className="conversation-gallery-status">
                    {loading
                      ? "Đang tải thư viện ảnh..."
                      : error || "Không có ảnh trong hội thoại."}
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
                aria-label="Ảnh tiếp theo"
              >
                <IoChevronForward />
              </button>
            </div>

            <div className="conversation-gallery-strip">
              {normalizedImages.map((image) => {
                const imageKey = image?.id || image?.url;
                const isActive = String(imageKey) === activeImageKey;

                return (
                  <button
                    key={imageKey}
                    type="button"
                    className={`conversation-gallery-thumb ${isActive ? "active" : ""}`}
                    onClick={() => onSelectImage(imageKey)}
                    aria-label={image?.fileName || "Chọn ảnh"}
                  >
                    <img src={image.url} alt={image.fileName || ""} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {shareMessage ? <p className="conversation-gallery-inline-message">{shareMessage}</p> : null}
        {error && normalizedImages.length ? (
          <p className="conversation-gallery-inline-message error">{error}</p>
        ) : null}
        {isPartial ? (
          <p className="conversation-gallery-inline-message">
            Đang hiển thị ảnh gần đây trong hội thoại.
          </p>
        ) : null}

        <footer className="conversation-gallery-dock" aria-label="Bộ lọc thư viện">
          <button type="button" className="conversation-gallery-dock-item active">
            <IoImageOutline />
            <span>Ảnh</span>
          </button>
          <button type="button" className="conversation-gallery-dock-item">
            <IoVideocamOutline />
            <span>Video</span>
          </button>
        </footer>
      </div>
    </div>
  );
}

export default memo(ConversationImageGallery);
