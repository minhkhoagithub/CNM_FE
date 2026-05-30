import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FiArchive,
  FiClock,
  FiEdit2,
  FiFileText,
  FiFolder,
  FiImage,
  FiMusic,
  FiPlus,
  FiRotateCcw,
  FiSearch,
  FiSend,
  FiTrash2,
  FiUpload,
  FiVideo,
  FiX,
} from "react-icons/fi";
import {
  createCloudFolder,
  deleteCloudFile,
  getCloudStorageSummary,
  listCloudFiles,
  listCloudTrash,
  permanentlyDeleteCloudFile,
  renameCloudFile,
  restoreCloudFile,
  sendCloudFileToConversation,
  uploadCloudFile,
} from "../../services/cloud/cloudApi";
import { getConversations } from "../../services/chat/conversationApi";
import "../../resource/style/Cloud/cloud.css";

const TYPE_FILTERS = [
  { id: "all", label: "Tất cả", apiType: null },
  { id: "IMAGE", label: "Hình ảnh", apiType: "IMAGE" },
  { id: "VIDEO", label: "Video", apiType: "VIDEO" },
  { id: "AUDIO", label: "Âm thanh", apiType: "AUDIO" },
  { id: "DOCUMENT", label: "Tài liệu", apiType: "DOCUMENT" },
  { id: "ARCHIVE", label: "Nén", apiType: "ARCHIVE" },
  { id: "OTHER", label: "Khác", apiType: "OTHER" },
];

const SORT_OPTIONS = [
  { id: "NEWEST", label: "Mới nhất" },
  { id: "NAME", label: "Tên" },
  { id: "SIZE", label: "Dung lượng" },
];

const EMPTY_SUMMARY = {
  totalBytes: 0,
  activeBytes: 0,
  trashBytes: 0,
  usedBytes: 0,
  quotaBytes: 0,
  remainingBytes: 0,
  usagePercent: 0,
  totalFiles: 0,
  totalFolders: 0,
  byType: {
    IMAGE: 0,
    VIDEO: 0,
    AUDIO: 0,
    DOCUMENT: 0,
    ARCHIVE: 0,
    OTHER: 0,
  },
};

const TYPE_LABELS = {
  FOLDER: "Thư mục",
  IMAGE: "Hình ảnh",
  VIDEO: "Video",
  AUDIO: "Âm thanh",
  DOCUMENT: "Tài liệu",
  ARCHIVE: "Nén",
  OTHER: "Khác",
};

const VIEW_MODE_FILES = "files";
const VIEW_MODE_TRASH = "trash";

const formatBytes = (value) => {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const formatDateTime = (value) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getFileIcon = (item) => {
  if (item?.isFolder || item?.fileType === "FOLDER") {
    return <FiFolder />;
  }
  switch (item?.fileType) {
    case "IMAGE":
      return <FiImage />;
    case "VIDEO":
      return <FiVideo />;
    case "AUDIO":
      return <FiMusic />;
    case "ARCHIVE":
      return <FiArchive />;
    default:
      return <FiFileText />;
  }
};

const resolveConversationName = (conversation) =>
  conversation?.displayName ||
  conversation?.customName ||
  conversation?.name ||
  conversation?.title ||
  "Cuộc trò chuyện";

const resolveConversationTypeLabel = (conversation) => {
  const normalizedType = String(conversation?.type || "").toUpperCase();
  return normalizedType === "GROUP" ? "Nhóm" : "Riêng tư";
};

export default function Cloud() {
  const filePickerRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [pageInfo, setPageInfo] = useState({
    page: 0,
    size: 50,
    totalItems: 0,
    totalPages: 0,
    hasMore: false,
  });

  const [viewMode, setViewMode] = useState(VIEW_MODE_FILES);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [activeTypeFilter, setActiveTypeFilter] = useState("all");
  const [sortMode, setSortMode] = useState("NEWEST");
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [breadcrumbs, setBreadcrumbs] = useState([{ id: null, label: "Cloud" }]);

  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [uiNotice, setUiNotice] = useState("");

  const [folderModalState, setFolderModalState] = useState({ isOpen: false, name: "" });
  const [renameModalState, setRenameModalState] = useState({
    isOpen: false,
    item: null,
    name: "",
  });
  const [deleteModalState, setDeleteModalState] = useState({
    isOpen: false,
    item: null,
    permanent: false,
  });
  const [sendModalState, setSendModalState] = useState({
    isOpen: false,
    item: null,
    selectedConversationId: "",
    message: "",
    search: "",
    loading: false,
    sending: false,
    conversations: [],
  });

  const activeFilter = useMemo(
    () => TYPE_FILTERS.find((item) => item.id === activeTypeFilter) || TYPE_FILTERS[0],
    [activeTypeFilter]
  );

  const sortedFiles = useMemo(() => {
    const items = [...files];
    items.sort((a, b) => {
      const aIsFolder = Boolean(a?.isFolder);
      const bIsFolder = Boolean(b?.isFolder);
      if (aIsFolder !== bIsFolder) {
        return aIsFolder ? -1 : 1;
      }

      if (sortMode === "NAME") {
        return String(a?.name || "").localeCompare(String(b?.name || ""), "vi", {
          sensitivity: "base",
        });
      }

      if (sortMode === "SIZE") {
        return Number(b?.fileSize || 0) - Number(a?.fileSize || 0);
      }

      const aTime = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
      const bTime = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
      return bTime - aTime;
    });
    return items;
  }, [files, sortMode]);

  const normalizedSummary = useMemo(() => {
    const usedBytes = Number(summary?.usedBytes ?? summary?.totalBytes ?? 0);
    const quotaBytes = Number(summary?.quotaBytes ?? 0);
    const remainingBytes = Number(
      summary?.remainingBytes ??
        (quotaBytes > 0 ? Math.max(quotaBytes - usedBytes, 0) : 0)
    );
    const usagePercentRaw =
      summary?.usagePercent != null
        ? Number(summary.usagePercent)
        : quotaBytes > 0
          ? (usedBytes * 100) / quotaBytes
          : 0;

    return {
      ...EMPTY_SUMMARY,
      ...(summary || {}),
      usedBytes,
      quotaBytes,
      remainingBytes,
      usagePercent: Number.isFinite(usagePercentRaw) ? Math.max(0, usagePercentRaw) : 0,
      byType: {
        ...EMPTY_SUMMARY.byType,
        ...(summary?.byType || {}),
      },
    };
  }, [summary]);

  const isQuotaWarning = normalizedSummary.quotaBytes > 0 && normalizedSummary.usagePercent >= 90;

  const filteredConversationsForSend = useMemo(() => {
    const search = String(sendModalState.search || "").trim().toLowerCase();
    if (!search) {
      return sendModalState.conversations;
    }
    return sendModalState.conversations.filter((conversation) =>
      resolveConversationName(conversation).toLowerCase().includes(search)
    );
  }, [sendModalState.conversations, sendModalState.search]);

  const loadStorageSummary = useCallback(async () => {
    try {
      const response = await getCloudStorageSummary();
      setSummary({
        ...EMPTY_SUMMARY,
        ...(response || {}),
        byType: {
          ...EMPTY_SUMMARY.byType,
          ...(response?.byType || {}),
        },
      });
    } catch (error) {
      console.error("Failed to load cloud storage summary:", error);
    }
  }, []);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      const response =
        viewMode === VIEW_MODE_TRASH
          ? await listCloudTrash({
              q: searchKeyword,
              type: activeFilter.apiType,
              page: 0,
              size: 100,
            })
          : await listCloudFiles({
              parentFolderId: currentFolderId,
              q: searchKeyword,
              type: activeFilter.apiType,
              page: 0,
              size: 100,
            });

      setFiles(Array.isArray(response?.items) ? response.items : []);
      setPageInfo({
        page: Number(response?.page || 0),
        size: Number(response?.size || 100),
        totalItems: Number(response?.totalItems || 0),
        totalPages: Number(response?.totalPages || 0),
        hasMore: Boolean(response?.hasMore),
      });
    } catch (error) {
      console.error("Failed to load cloud files:", error);
      setErrorMessage(
        error?.response?.data?.message ||
          error?.message ||
          "Không thể tải dữ liệu Cloud. Vui lòng thử lại."
      );
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [activeFilter.apiType, currentFolderId, searchKeyword, viewMode]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    void loadStorageSummary();
  }, [loadStorageSummary]);

  const handleOpenUploadDialog = () => {
    if (viewMode === VIEW_MODE_TRASH) {
      return;
    }
    filePickerRef.current?.click();
  };

  const handleUploadedFiles = async (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (!selectedFiles.length) {
      return;
    }

    setUploading(true);
    setErrorMessage("");
    setUiNotice("");

    let successCount = 0;
    let failureCount = 0;
    let provisionalRemaining = Number(normalizedSummary.remainingBytes || 0);

    for (const file of selectedFiles) {
      const fileSize = Number(file?.size || 0);
      if (
        normalizedSummary.quotaBytes > 0 &&
        fileSize > 0 &&
        fileSize > provisionalRemaining
      ) {
        failureCount += 1;
        continue;
      }

      try {
        await uploadCloudFile(file, { parentFolderId: currentFolderId });
        successCount += 1;
        provisionalRemaining = Math.max(provisionalRemaining - fileSize, 0);
      } catch (error) {
        failureCount += 1;
        console.error("Cloud upload failed:", error);
      }
    }

    event.target.value = "";
    await Promise.all([loadFiles(), loadStorageSummary()]);
    setUploading(false);

    if (failureCount > 0) {
      setErrorMessage("Một số tệp không thể tải lên. Kiểm tra quota, định dạng hoặc dung lượng.");
    }
    if (successCount > 0) {
      setUiNotice(`Đã tải lên ${successCount} tệp vào Cloud.`);
    }
  };

  const handleOpenFolder = (item) => {
    if (viewMode !== VIEW_MODE_FILES || !item?.isFolder) {
      return;
    }
    setCurrentFolderId(item.id);
    setBreadcrumbs((previousState) => [...previousState, { id: item.id, label: item.name }]);
  };

  const handleNavigateBreadcrumb = (index) => {
    const nextBreadcrumbs = breadcrumbs.slice(0, index + 1);
    const nextCurrentFolder = nextBreadcrumbs[nextBreadcrumbs.length - 1] || { id: null };
    setBreadcrumbs(nextBreadcrumbs);
    setCurrentFolderId(nextCurrentFolder.id || null);
  };

  const handleChangeViewMode = (nextMode) => {
    setViewMode(nextMode);
    setUiNotice("");
    setErrorMessage("");
    if (nextMode === VIEW_MODE_FILES) {
      return;
    }
    setCurrentFolderId(null);
    setBreadcrumbs([{ id: null, label: "Cloud" }]);
  };

  const handleCreateFolder = async () => {
    const folderName = String(folderModalState.name || "").trim();
    if (!folderName) {
      return;
    }

    try {
      await createCloudFolder({ name: folderName, parentFolderId: currentFolderId });
      setFolderModalState({ isOpen: false, name: "" });
      setUiNotice("Đã tạo thư mục mới.");
      await Promise.all([loadFiles(), loadStorageSummary()]);
    } catch (error) {
      setErrorMessage(
        error?.response?.data?.message || "Không thể tạo thư mục. Vui lòng thử lại."
      );
    }
  };

  const handleRenameItem = async () => {
    const targetItem = renameModalState.item;
    const nextName = String(renameModalState.name || "").trim();
    if (!targetItem?.id || !nextName) {
      return;
    }

    try {
      await renameCloudFile(targetItem.id, { name: nextName });
      setRenameModalState({ isOpen: false, item: null, name: "" });
      setUiNotice("Đã cập nhật tên.");
      await loadFiles();
    } catch (error) {
      setErrorMessage(
        error?.response?.data?.message || "Không thể đổi tên mục này. Vui lòng thử lại."
      );
    }
  };

  const handleDeleteItem = async () => {
    const targetItem = deleteModalState.item;
    if (!targetItem?.id) {
      return;
    }

    try {
      if (deleteModalState.permanent) {
        await permanentlyDeleteCloudFile(targetItem.id);
        setUiNotice("Đã xóa vĩnh viễn mục khỏi Cloud.");
      } else {
        await deleteCloudFile(targetItem.id);
        setUiNotice("Đã chuyển mục vào Thùng rác.");
      }
      setDeleteModalState({ isOpen: false, item: null, permanent: false });
      await Promise.all([loadFiles(), loadStorageSummary()]);
    } catch (error) {
      setErrorMessage(
        error?.response?.data?.message ||
          (targetItem?.isFolder
            ? "Không thể xóa thư mục. Chỉ có thể xóa thư mục trống."
            : "Không thể xóa mục này.")
      );
    }
  };

  const handleRestoreItem = async (item) => {
    if (!item?.id) {
      return;
    }

    try {
      await restoreCloudFile(item.id);
      setUiNotice("Đã khôi phục mục khỏi Thùng rác.");
      await Promise.all([loadFiles(), loadStorageSummary()]);
    } catch (error) {
      setErrorMessage(
        error?.response?.data?.message || "Không thể khôi phục mục này."
      );
    }
  };

  const openSendModal = async (item) => {
    if (!item?.id || item?.isFolder) {
      return;
    }

    setSendModalState({
      isOpen: true,
      item,
      selectedConversationId: "",
      message: "",
      search: "",
      loading: true,
      sending: false,
      conversations: [],
    });

    try {
      const response = await getConversations({ archived: false });
      setSendModalState((previousState) => ({
        ...previousState,
        loading: false,
        conversations: Array.isArray(response) ? response : [],
      }));
    } catch (error) {
      console.error("Failed to load conversations for send-to-chat:", error);
      setSendModalState((previousState) => ({
        ...previousState,
        loading: false,
        conversations: [],
      }));
      setErrorMessage(
        error?.response?.data?.message ||
          "Không thể tải danh sách cuộc trò chuyện."
      );
    }
  };

  const handleSendToConversation = async () => {
    const item = sendModalState.item;
    const conversationId = sendModalState.selectedConversationId;
    if (!item?.id || !conversationId) {
      return;
    }

    setSendModalState((previousState) => ({ ...previousState, sending: true }));
    try {
      await sendCloudFileToConversation(item.id, {
        conversationId,
        message: sendModalState.message,
      });
      setUiNotice("Đã gửi tệp vào cuộc trò chuyện.");
      setSendModalState({
        isOpen: false,
        item: null,
        selectedConversationId: "",
        message: "",
        search: "",
        loading: false,
        sending: false,
        conversations: [],
      });
    } catch (error) {
      setErrorMessage(
        error?.response?.data?.message || "Không thể gửi tệp vào cuộc trò chuyện."
      );
      setSendModalState((previousState) => ({ ...previousState, sending: false }));
    }
  };

  const renderFilePreview = (item) => {
    if (item?.isFolder) {
      return <div className="cloud-library-generic-icon">{getFileIcon(item)}</div>;
    }

    if (item?.fileType === "IMAGE" && item?.fileUrl) {
      return <img src={item.fileUrl} alt={item.name} />;
    }

    return <div className="cloud-library-generic-icon">{getFileIcon(item)}</div>;
  };

  const emptyStateTitle =
    viewMode === VIEW_MODE_TRASH
      ? "Thùng rác trống."
      : searchKeyword.trim()
        ? "Không tìm thấy file phù hợp."
        : "Cloud của bạn đang trống.";
  const emptyStateDescription =
    viewMode === VIEW_MODE_TRASH
      ? "Các mục đã xóa sẽ xuất hiện tại đây."
      : searchKeyword.trim()
        ? "Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm."
        : "Hãy tải tệp đầu tiên lên Cloud của bạn.";

  return (
    <div className="cloud-container cloud-library-shell">
      <header className="cloud-library-header">
        <div className="cloud-library-header-title">
          <h2>Cloud của tôi</h2>
          <p>Lưu trữ tệp cá nhân của bạn và quản lý trực tiếp trên web.</p>
        </div>

        <div className="cloud-library-header-center-tabs cloud-library-breadcrumbs">
          <button
            type="button"
            className={`cloud-library-tab-btn ${viewMode === VIEW_MODE_FILES ? "active" : ""}`}
            onClick={() => handleChangeViewMode(VIEW_MODE_FILES)}
          >
            Tệp của tôi
          </button>
          <button
            type="button"
            className={`cloud-library-tab-btn ${viewMode === VIEW_MODE_TRASH ? "active" : ""}`}
            onClick={() => handleChangeViewMode(VIEW_MODE_TRASH)}
          >
            Thùng rác
          </button>
          {viewMode === VIEW_MODE_FILES
            ? breadcrumbs.map((breadcrumb, index) => (
                <button
                  key={`${breadcrumb.id || "root"}-${index}`}
                  type="button"
                  className={`cloud-library-tab-btn ${index === breadcrumbs.length - 1 ? "active" : ""}`}
                  onClick={() => handleNavigateBreadcrumb(index)}
                >
                  {breadcrumb.label}
                </button>
              ))
            : null}
        </div>

        <div className="cloud-library-header-actions">
          <label className="cloud-library-search-box" aria-label="Tìm trong Cloud">
            <FiSearch />
            <input
              type="text"
              placeholder={viewMode === VIEW_MODE_TRASH ? "Tìm trong thùng rác..." : "Tìm theo tên file..."}
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
            />
          </label>
          {viewMode === VIEW_MODE_FILES ? (
            <>
              <button
                type="button"
                className="cloud-library-upload-btn"
                onClick={() => setFolderModalState({ isOpen: true, name: "" })}
              >
                <FiPlus />
                <span>Tạo thư mục</span>
              </button>
              <button type="button" className="cloud-library-upload-btn" onClick={handleOpenUploadDialog}>
                <FiUpload />
                <span>{uploading ? "Đang tải..." : "Tải tệp lên"}</span>
              </button>
              <input
                ref={filePickerRef}
                className="cloud-library-hidden-input"
                type="file"
                multiple
                onChange={handleUploadedFiles}
              />
            </>
          ) : null}
        </div>
      </header>

      <div className="cloud-library-body">
        <aside className="cloud-library-sidebar">
          <section className="cloud-library-side-section">
            <h3>Tổng quan</h3>
            <div className="cloud-library-storage-row">
              <span>Đã dùng</span>
              <strong>{formatBytes(normalizedSummary.usedBytes)}</strong>
            </div>
            <div className="cloud-library-storage-row">
              <span>Quota</span>
              <strong>{normalizedSummary.quotaBytes > 0 ? formatBytes(normalizedSummary.quotaBytes) : "Không giới hạn"}</strong>
            </div>
            <div className="cloud-library-storage-row">
              <span>Còn lại</span>
              <strong>{formatBytes(normalizedSummary.remainingBytes)}</strong>
            </div>
            <div className={`cloud-library-storage-row ${isQuotaWarning ? "warning" : ""}`}>
              <span>Sử dụng</span>
              <strong>{normalizedSummary.usagePercent.toFixed(1)}%</strong>
            </div>
            <div className="cloud-library-storage-bar">
              <span style={{ width: `${Math.min(normalizedSummary.usagePercent, 100)}%` }} />
            </div>
            {isQuotaWarning ? (
              <div className="cloud-library-quota-warning">
                Dung lượng Cloud gần đầy. Tệp trong thùng rác vẫn chiếm dung lượng.
              </div>
            ) : null}
          </section>

          <section className="cloud-library-side-section">
            <h3>Thống kê</h3>
            <div className="cloud-library-storage-row">
              <span>Tệp đang hoạt động</span>
              <strong>{normalizedSummary.totalFiles}</strong>
            </div>
            <div className="cloud-library-storage-row">
              <span>Thư mục</span>
              <strong>{normalizedSummary.totalFolders}</strong>
            </div>
            <div className="cloud-library-storage-row">
              <span>Dung lượng tệp hoạt động</span>
              <strong>{formatBytes(normalizedSummary.activeBytes || normalizedSummary.totalBytes)}</strong>
            </div>
            <div className="cloud-library-storage-row">
              <span>Dung lượng thùng rác</span>
              <strong>{formatBytes(normalizedSummary.trashBytes)}</strong>
            </div>
          </section>

          <section className="cloud-library-storage">
            <h4>Theo loại tệp</h4>
            {Object.entries(normalizedSummary.byType || {}).map(([type, bytes]) => (
              <div key={type} className="cloud-library-storage-row">
                <span>{TYPE_LABELS[type] || type}</span>
                <strong>{formatBytes(bytes)}</strong>
              </div>
            ))}
          </section>
        </aside>

        <main className="cloud-library-content">
          <div className="cloud-library-filter-row">
            <div className="cloud-library-type-pills" role="tablist" aria-label="Lọc loại nội dung">
              {TYPE_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  className={`cloud-library-pill ${activeTypeFilter === filter.id ? "active" : ""}`}
                  onClick={() => setActiveTypeFilter(filter.id)}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <div className="cloud-library-filter-meta">
              <label className="cloud-library-sort-box">
                <span>Sắp xếp</span>
                <select value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <span>
                <FiClock />
                {pageInfo.totalItems} mục
              </span>
            </div>
          </div>

          {uiNotice ? <div className="cloud-library-notice">{uiNotice}</div> : null}
          {errorMessage ? (
            <div className="cloud-library-notice cloud-library-notice--error">
              {errorMessage}
              <button type="button" className="cloud-library-inline-retry" onClick={() => void loadFiles()}>
                Thử lại
              </button>
            </div>
          ) : null}

          {loading ? (
            <div className="cloud-library-empty">
              <FiClock />
              <h4>Đang tải dữ liệu Cloud...</h4>
              <p>Vui lòng chờ trong giây lát.</p>
            </div>
          ) : sortedFiles.length ? (
            <div className="cloud-library-grid">
              {sortedFiles.map((item) => (
                <article key={item.id} className={`cloud-library-card ${viewMode === VIEW_MODE_TRASH ? "is-trash-item" : ""}`}>
                  <div className={`cloud-library-card-preview ${item.fileType === "IMAGE" && item.fileUrl ? "has-thumb" : "is-generic"}`}>
                    {renderFilePreview(item)}
                  </div>

                  <div className="cloud-library-card-body">
                    <div className="cloud-library-card-title-row">
                      <h4 title={item.name}>{item.name}</h4>
                      <span className="cloud-library-format-tag">
                        {TYPE_LABELS[item.fileType] || item.fileType || "Khác"}
                      </span>
                    </div>
                    <p className="cloud-library-card-meta">
                      {item.isFolder ? "Thư mục" : formatBytes(item.fileSize)} •{" "}
                      {formatDateTime(item.updatedAt || item.createdAt)}
                    </p>
                    {viewMode === VIEW_MODE_TRASH && item.deletedAt ? (
                      <p className="cloud-library-card-meta">
                        Đã xóa: {formatDateTime(item.deletedAt)}
                      </p>
                    ) : null}
                  </div>

                  <div className="cloud-library-card-actions cloud-library-card-actions--grid">
                    {viewMode === VIEW_MODE_TRASH ? (
                      <>
                        <button type="button" className="ghost" onClick={() => void handleRestoreItem(item)}>
                          <FiRotateCcw />
                          Khôi phục
                        </button>
                        <button
                          type="button"
                          className="cloud-library-delete-button"
                          onClick={() =>
                            setDeleteModalState({
                              isOpen: true,
                              item,
                              permanent: true,
                            })
                          }
                        >
                          <FiTrash2 />
                          Xóa hẳn
                        </button>
                      </>
                    ) : (
                      <>
                        {item.isFolder ? (
                          <button type="button" className="ghost" onClick={() => handleOpenFolder(item)}>
                            <FiFolder />
                            Mở
                          </button>
                        ) : (
                          <a
                            className="cloud-library-link-button"
                            href={item.fileUrl || "#"}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Xem
                          </a>
                        )}

                        {!item.isFolder ? (
                          <button type="button" className="ghost" onClick={() => void openSendModal(item)}>
                            <FiSend />
                            Gửi chat
                          </button>
                        ) : null}

                        <button
                          type="button"
                          className="ghost"
                          onClick={() =>
                            setRenameModalState({
                              isOpen: true,
                              item,
                              name: item.name || "",
                            })
                          }
                        >
                          <FiEdit2 />
                          Đổi tên
                        </button>
                        <button
                          type="button"
                          className="cloud-library-delete-button"
                          onClick={() =>
                            setDeleteModalState({
                              isOpen: true,
                              item,
                              permanent: false,
                            })
                          }
                        >
                          <FiTrash2 />
                          Xóa
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="cloud-library-empty">
              <FiFileText />
              <h4>{emptyStateTitle}</h4>
              <p>{emptyStateDescription}</p>
            </div>
          )}
        </main>
      </div>

      {folderModalState.isOpen ? (
        <div className="cloud-send-modal-overlay" role="presentation">
          <div className="cloud-send-modal" role="dialog" aria-modal="true">
            <div className="cloud-send-modal-header">
              <div>
                <h3>Tạo thư mục mới</h3>
                <p>Nhập tên thư mục bạn muốn tạo trong vị trí hiện tại.</p>
              </div>
              <button
                type="button"
                className="cloud-send-close"
                onClick={() => setFolderModalState({ isOpen: false, name: "" })}
                aria-label="Đóng"
              >
                <FiX />
              </button>
            </div>
            <label className="cloud-send-note">
              <span>Tên thư mục</span>
              <input
                className="cloud-library-modal-input"
                value={folderModalState.name}
                onChange={(event) =>
                  setFolderModalState((previousState) => ({
                    ...previousState,
                    name: event.target.value,
                  }))
                }
                placeholder="Ví dụ: Tài liệu học tập"
              />
            </label>
            <div className="cloud-send-footer">
              <button
                type="button"
                className="ghost"
                onClick={() => setFolderModalState({ isOpen: false, name: "" })}
              >
                Hủy
              </button>
              <button type="button" onClick={() => void handleCreateFolder()}>
                Tạo thư mục
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {renameModalState.isOpen ? (
        <div className="cloud-send-modal-overlay" role="presentation">
          <div className="cloud-send-modal" role="dialog" aria-modal="true">
            <div className="cloud-send-modal-header">
              <div>
                <h3>Đổi tên</h3>
                <p>{renameModalState.item?.name || "Mục Cloud"}</p>
              </div>
              <button
                type="button"
                className="cloud-send-close"
                onClick={() => setRenameModalState({ isOpen: false, item: null, name: "" })}
                aria-label="Đóng"
              >
                <FiX />
              </button>
            </div>
            <label className="cloud-send-note">
              <span>Tên mới</span>
              <input
                className="cloud-library-modal-input"
                value={renameModalState.name}
                onChange={(event) =>
                  setRenameModalState((previousState) => ({
                    ...previousState,
                    name: event.target.value,
                  }))
                }
                placeholder="Nhập tên mới"
              />
            </label>
            <div className="cloud-send-footer">
              <button
                type="button"
                className="ghost"
                onClick={() => setRenameModalState({ isOpen: false, item: null, name: "" })}
              >
                Hủy
              </button>
              <button type="button" onClick={() => void handleRenameItem()}>
                Lưu thay đổi
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteModalState.isOpen ? (
        <div className="cloud-send-modal-overlay" role="presentation">
          <div className="cloud-send-modal" role="dialog" aria-modal="true">
            <div className="cloud-send-modal-header">
              <div>
                <h3>{deleteModalState.permanent ? "Xóa vĩnh viễn" : "Xóa mục"}</h3>
                <p>{deleteModalState.item?.name || "Mục Cloud"}</p>
              </div>
              <button
                type="button"
                className="cloud-send-close"
                onClick={() => setDeleteModalState({ isOpen: false, item: null, permanent: false })}
                aria-label="Đóng"
              >
                <FiX />
              </button>
            </div>
            <div className="cloud-send-note">
              <span>
                {deleteModalState.permanent
                  ? "Xóa vĩnh viễn? Hành động này không thể hoàn tác."
                  : deleteModalState.item?.isFolder
                    ? "Chỉ có thể xóa thư mục trống."
                    : "Bạn có chắc muốn chuyển tệp này vào Thùng rác?"}
              </span>
            </div>
            <div className="cloud-send-footer">
              <button
                type="button"
                className="ghost"
                onClick={() => setDeleteModalState({ isOpen: false, item: null, permanent: false })}
              >
                Hủy
              </button>
              <button type="button" onClick={() => void handleDeleteItem()}>
                {deleteModalState.permanent ? "Xóa vĩnh viễn" : "Xóa"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {sendModalState.isOpen ? (
        <div className="cloud-send-modal-overlay" role="presentation">
          <div className="cloud-send-modal" role="dialog" aria-modal="true">
            <div className="cloud-send-modal-header">
              <div>
                <h3>Gửi vào chat</h3>
                <p>{sendModalState.item?.name || "Tệp Cloud"}</p>
              </div>
              <button
                type="button"
                className="cloud-send-close"
                onClick={() =>
                  setSendModalState({
                    isOpen: false,
                    item: null,
                    selectedConversationId: "",
                    message: "",
                    search: "",
                    loading: false,
                    sending: false,
                    conversations: [],
                  })
                }
                aria-label="Đóng"
              >
                <FiX />
              </button>
            </div>

            <label className="cloud-send-note">
              <span>Tìm cuộc trò chuyện</span>
              <input
                className="cloud-library-modal-input"
                value={sendModalState.search}
                onChange={(event) =>
                  setSendModalState((previousState) => ({
                    ...previousState,
                    search: event.target.value,
                  }))
                }
                placeholder="Tìm theo tên..."
              />
            </label>

            <div className="cloud-send-conversations">
              {sendModalState.loading ? (
                <div className="cloud-send-no-conversation">
                  <FiClock />
                  <p>Đang tải danh sách cuộc trò chuyện...</p>
                </div>
              ) : filteredConversationsForSend.length ? (
                filteredConversationsForSend.map((conversation) => (
                  <label key={conversation.id} className="cloud-send-conversation-item">
                    <input
                      type="radio"
                      name="cloud-send-conversation"
                      value={conversation.id}
                      checked={sendModalState.selectedConversationId === String(conversation.id)}
                      onChange={(event) =>
                        setSendModalState((previousState) => ({
                          ...previousState,
                          selectedConversationId: event.target.value,
                        }))
                      }
                    />
                    <div className="text">
                      <strong>{resolveConversationName(conversation)}</strong>
                      <small>{resolveConversationTypeLabel(conversation)}</small>
                    </div>
                  </label>
                ))
              ) : (
                <div className="cloud-send-no-conversation">
                  <FiFileText />
                  <p>Không có cuộc trò chuyện phù hợp.</p>
                </div>
              )}
            </div>

            <label className="cloud-send-note">
              <span>Lời nhắn (tùy chọn)</span>
              <textarea
                value={sendModalState.message}
                onChange={(event) =>
                  setSendModalState((previousState) => ({
                    ...previousState,
                    message: event.target.value,
                  }))
                }
                placeholder="Nhập lời nhắn kèm tệp..."
              />
            </label>

            <div className="cloud-send-footer">
              <button
                type="button"
                className="ghost"
                onClick={() =>
                  setSendModalState({
                    isOpen: false,
                    item: null,
                    selectedConversationId: "",
                    message: "",
                    search: "",
                    loading: false,
                    sending: false,
                    conversations: [],
                  })
                }
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => void handleSendToConversation()}
                disabled={!sendModalState.selectedConversationId || sendModalState.sending}
              >
                {sendModalState.sending ? "Đang gửi..." : "Gửi"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
