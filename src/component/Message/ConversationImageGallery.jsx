import React, { memo, useEffect, useMemo } from "react";
import { IoMdClose } from "react-icons/io";
import {
  IoChevronDown,
  IoChevronUp,
  IoDownloadOutline,
  IoShareSocialOutline,
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

const formatGalleryDay = (value) => {
  if (!value) {
    return "Không rõ ngày";
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return "Không rõ ngày";
  }

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfImageDay = new Date(
    parsedDate.getFullYear(),
    parsedDate.getMonth(),
    parsedDate.getDate()
  );
  const dayOffset = Math.round(
    (startOfToday.getTime() - startOfImageDay.getTime()) / 86400000
  );

  if (dayOffset === 0) {
    return "Hôm nay";
  }
  if (dayOffset === 1) {
    return "Hôm qua";
  }

  return parsedDate.toLocaleDateString("vi-VN", {
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
  const normalizedImages = useMemo(
    () => (Array.isArray(images) ? images : []),
    [images]
  );
  const groupedImages = useMemo(() => {
    const groups = [];

    normalizedImages.forEach((image) => {
      const label = formatGalleryDay(image?.createdAt);
      const currentGroup = groups[groups.length - 1];

      if (currentGroup?.label === label) {
        currentGroup.images.push(image);
        return;
      }

      groups.push({ label, images: [image] });
    });

    return groups;
  }, [normalizedImages]);

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

  const handleDownloadActiveImage = async () => {
    if (!activeImage?.url) {
      return;
    }

    const fileName = activeImage.fileName || "image";

    try {
      const response = await fetch(activeImage.url, {
        mode: "cors",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Download failed");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      const link = document.createElement("a");
      link.href = activeImage.url;
      link.download = fileName;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.click();
    }
  };

  const handleShareActiveImage = () => {
    if (!activeImage?.url) {
      return;
    }

    window.dispatchEvent(
      new CustomEvent("web:gallery-forward-image", {
        detail: { image: activeImage },
      })
    );
    onClose?.();
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
        return;
      }

      if (event.key === "ArrowUp") {
        onNavigate(-1);
        return;
      }

      if (event.key === "ArrowDown") {
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

  const hasNewerImage = activeImageIndex > 0;
  const hasOlderImage =
    activeImageIndex >= 0 && activeImageIndex < normalizedImages.length - 1;

  return (
    <div className="conversation-gallery-overlay" onClick={onClose}>
      <div className="conversation-gallery-shell" onClick={(event) => event.stopPropagation()}>
        <main className="conversation-gallery-stage">
          <button
            type="button"
            className="conversation-gallery-close"
            onClick={onClose}
            aria-label="Đóng trình xem ảnh"
            title="Đóng"
          >
            <IoMdClose />
          </button>

          <div className="conversation-gallery-stage-heading">
            <strong>{conversationName || "Ảnh trong hội thoại"}</strong>
            <span>
              {normalizedImages.length
                ? `${activeImageIndex >= 0 ? activeImageIndex + 1 : 1} / ${normalizedImages.length}`
                : "0 ảnh"}
            </span>
          </div>

          <div className="conversation-gallery-main">
            {activeImage ? (
              <img src={activeImage.url} alt={activeImage.fileName || "Ảnh trong hội thoại"} />
            ) : (
              <div className="conversation-gallery-status">
                {loading
                  ? "Đang tải thư viện ảnh..."
                  : error || "Không có ảnh trong hội thoại."}
              </div>
            )}
          </div>

          {activeImage ? (
            <div className="conversation-gallery-image-meta">
              <strong>{activeImage.fileName || "Ảnh trong hội thoại"}</strong>
              {formatSharedDate(activeImage.createdAt) ? (
                <span>{formatSharedDate(activeImage.createdAt)}</span>
              ) : null}
            </div>
          ) : null}

          {loading && activeImage ? (
            <div className="conversation-gallery-loading-chip">Đang đồng bộ ảnh...</div>
          ) : null}

          <nav className="conversation-gallery-nav-rail" aria-label="Điều hướng ảnh">
            <button
              type="button"
              className="conversation-gallery-nav"
              onClick={() => onNavigate(-1)}
              disabled={!hasNewerImage}
              aria-label="Ảnh mới hơn"
              title="Ảnh mới hơn"
            >
              <IoChevronUp />
            </button>
            <button
              type="button"
              className="conversation-gallery-nav"
              onClick={() => onNavigate(1)}
              disabled={!hasOlderImage}
              aria-label="Ảnh cũ hơn"
              title="Ảnh cũ hơn"
            >
              <IoChevronDown />
            </button>
          </nav>

          {error && normalizedImages.length ? (
            <p className="conversation-gallery-inline-message error">{error}</p>
          ) : null}
          {isPartial ? (
            <p className="conversation-gallery-inline-message">
              Đang hiển thị ảnh gần đây trong hội thoại.
            </p>
          ) : null}
        </main>

        <aside className="conversation-gallery-sidebar" aria-label="Danh sách ảnh">
          {groupedImages.map((group) => (
            <section className="conversation-gallery-sidebar-group" key={group.label}>
              <h3>{group.label}</h3>
              <div className="conversation-gallery-sidebar-list">
                {group.images.map((image) => {
                  const imageKey = image?.id || image?.url;
                  const isActive = String(imageKey) === activeImageKey;

                  return (
                    <button
                      key={imageKey}
                      type="button"
                      className={`conversation-gallery-thumb ${isActive ? "active" : ""}`}
                      onClick={() => onSelectImage(imageKey)}
                      aria-label={image?.fileName || "Chọn ảnh"}
                      title={image?.fileName || "Ảnh trong hội thoại"}
                    >
                      <img src={image.url} alt={image.fileName || ""} />
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </aside>

        <footer className="conversation-gallery-bottom-bar" aria-label="Thao tác ảnh">
          <button
            type="button"
            className="conversation-gallery-bottom-action"
            onClick={handleShareActiveImage}
            disabled={!activeImage?.url}
            title="Chuyển tiếp ảnh"
          >
            <IoShareSocialOutline />
            <span>Chuyển tiếp</span>
          </button>
          <button
            type="button"
            className="conversation-gallery-bottom-action"
            onClick={handleDownloadActiveImage}
            disabled={!activeImage?.url}
            title="Tải xuống"
          >
            <IoDownloadOutline />
            <span>Tải xuống</span>
          </button>
        </footer>
      </div>
    </div>
  );
}

export default memo(ConversationImageGallery);
