import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { UserContext } from "../../Context/UserContext";
import {
  ackReminder,
  cancelReminder,
  completeReminder,
  dismissReminder,
  getMyReminders,
} from "../../services/reminder/reminderApi";
import "../../resource/style/Chat/reminder.css";
import {
  HiOutlineBell,
  HiOutlineCalendarDays,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineEllipsisHorizontal,
  HiOutlineMagnifyingGlass,
  HiOutlineMapPin,
  HiOutlinePlus,
  HiOutlineQuestionMarkCircle,
  HiOutlineUser,
  HiOutlineVideoCamera,
  HiOutlineXCircle,
} from "react-icons/hi2";

const STATUS_LABELS = {
  SCHEDULED: "Đã lên lịch",
  DUE: "Đến hạn",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã hủy",
};

const STATUS_VARIANTS = {
  SCHEDULED: "upcoming",
  DUE: "active",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

const PARTICIPANT_STATUS_LABELS = {
  PENDING: "Chờ phản hồi",
  ACKNOWLEDGED: "Đã xác nhận",
  DISMISSED: "Đã bỏ qua",
  DONE: "Đã xong",
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

const resolveApiParamsFromFilter = (filterValue) => {
  if (filterValue === "COMPLETED" || filterValue === "CANCELLED") {
    return { status: filterValue };
  }
  return { scope: filterValue };
};

export default function ToDo() {
  const { userData } = useContext(UserContext);
  const currentUserId = String(userData?.userId || userData?._id || "");
  const [activeFilter, setActiveFilter] = useState("UPCOMING");
  const [searchQuery, setSearchQuery] = useState("");
  const [reminderState, setReminderState] = useState({
    loading: false,
    error: "",
    items: [],
  });
  const [selectedReminderId, setSelectedReminderId] = useState("");
  const [actionLoadingById, setActionLoadingById] = useState({});
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    date: "",
    startTime: "",
    endTime: "",
    location: "",
    meetingLink: "",
    priority: "MEDIUM",
    type: "TASK",
    notificationTime: "AT_TIME",
    repeat: "NONE",
  });
  const [createFormError, setCreateFormError] = useState("");

  const loadReminders = useCallback(async () => {
    setReminderState((prevState) => ({ ...prevState, loading: true, error: "" }));
    try {
      const params = resolveApiParamsFromFilter(activeFilter);
      const response = await getMyReminders({
        ...params,
        page: 0,
        size: 100,
      });
      const items = Array.isArray(response?.items) ? response.items : [];
      setReminderState({
        loading: false,
        error: "",
        items: items.sort((left, right) => {
          const leftTime = new Date(left?.remindAt || 0).getTime();
          const rightTime = new Date(right?.remindAt || 0).getTime();
          return leftTime - rightTime;
        }),
      });
    } catch (error) {
      setReminderState({
        loading: false,
        error:
          error?.response?.data?.message ||
          error?.message ||
          "Không thể tải danh sách nhắc hẹn.",
        items: [],
      });
    }
  }, [activeFilter]);

  useEffect(() => {
    void loadReminders();
  }, [loadReminders]);

  useEffect(() => {
    const handleReminderNavigate = (event) => {
      const notification = event?.detail?.notification || {};
      const reminderId =
        notification?.reminderId ||
        notification?.targetId ||
        notification?.metadata?.reminderId ||
        "";
      if (reminderId) {
        setSelectedReminderId(String(reminderId));
      }
      if (String(notification?.type || "").toUpperCase() === "REMINDER_DUE") {
        setActiveFilter("UPCOMING");
      }
    };

    window.addEventListener("reminder:navigate", handleReminderNavigate);
    return () => {
      window.removeEventListener("reminder:navigate", handleReminderNavigate);
    };
  }, []);

  useEffect(() => {
    const handleGlobalReminderRefresh = () => {
      void loadReminders();
    };
    window.addEventListener("web:reminders-global-refresh", handleGlobalReminderRefresh);
    return () => {
      window.removeEventListener("web:reminders-global-refresh", handleGlobalReminderRefresh);
    };
  }, [loadReminders]);

  const handleReminderAction = useCallback(
    async (reminderId, action) => {
      if (!reminderId) {
        return;
      }
      setActionLoadingById((prevState) => ({
        ...prevState,
        [String(reminderId)]: true,
      }));
      try {
        if (action === "ACK") {
          await ackReminder(reminderId);
        } else if (action === "DISMISS") {
          await dismissReminder(reminderId);
        } else if (action === "COMPLETE") {
          await completeReminder(reminderId);
        } else if (action === "CANCEL") {
          await cancelReminder(reminderId);
        }
        window.dispatchEvent(new CustomEvent("web:conversation-reminder-changed"));
        await loadReminders();
      } catch (error) {
        const message =
          error?.response?.data?.message || error?.message || "Không thể cập nhật nhắc hẹn.";
        setReminderState((prevState) => ({ ...prevState, error: message }));
      } finally {
        setActionLoadingById((prevState) => ({
          ...prevState,
          [String(reminderId)]: false,
        }));
      }
    },
    [loadReminders]
  );

  const listItems = useMemo(() => reminderState.items || [], [reminderState.items]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return listItems;
    }

    return listItems.filter((reminder) => {
      const haystack = [
        reminder?.title,
        reminder?.description,
        reminder?.location,
        reminder?.meetingLink,
        reminder?.conversationName,
        reminder?.assignee?.name,
        reminder?.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [listItems, searchQuery]);

  const nextReminder = useMemo(() => {
    const upcoming = listItems
      .filter((item) => !["COMPLETED", "CANCELLED"].includes(item?.status))
      .sort((left, right) => {
        const leftTime = new Date(left?.remindAt || 0).getTime();
        const rightTime = new Date(right?.remindAt || 0).getTime();
        return leftTime - rightTime;
      });
    return upcoming[0] || null;
  }, [listItems]);

  const completionSummary = useMemo(() => {
    const total = listItems.length;
    const completed = listItems.filter((item) => item?.status === "COMPLETED").length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, percentage };
  }, [listItems]);

  const emptyStateMessage = useMemo(() => {
    if (searchQuery.trim()) {
      return {
        title: "Không tìm thấy nhắc hẹn phù hợp.",
        description: "Hãy thử từ khóa khác hoặc xóa tìm kiếm.",
      };
    }

    if (activeFilter === "TODAY") {
      return {
        title: "Hôm nay chưa có lịch hẹn.",
        description: "Bạn đã hoàn tất công việc trong ngày.",
      };
    }

    if (activeFilter === "WEEK") {
      return {
        title: "Tuần này chưa có lịch hẹn.",
        description: "Các lịch hẹn trong tuần sẽ hiển thị tại đây.",
      };
    }

    if (activeFilter === "UPCOMING") {
      return {
        title: "Chưa có lịch hẹn sắp tới.",
        description: "Hãy tạo nhắc hẹn mới để lên kế hoạch.",
      };
    }

    if (activeFilter === "COMPLETED") {
      return {
        title: "Chưa có lịch hẹn đã hoàn thành.",
        description: "Các nhiệm vụ hoàn thành sẽ hiển thị tại đây.",
      };
    }

    return {
      title: "Chưa có lịch hẹn đã hủy.",
      description: "Các lịch hẹn bị hủy sẽ hiển thị tại đây.",
    };
  }, [activeFilter, searchQuery]);

  const handleCreateSubmit = (event) => {
    event.preventDefault();
    if (!createForm.title.trim()) {
      setCreateFormError("Vui lòng nhập tiêu đề nhắc hẹn.");
      return;
    }
    if (!createForm.date) {
      setCreateFormError("Vui lòng chọn ngày.");
      return;
    }
    if (!createForm.startTime) {
      setCreateFormError("Vui lòng chọn thời gian bắt đầu.");
      return;
    }

    setCreateFormError("Tính năng tạo nhắc hẹn sẽ được cập nhật sớm.");
  };

  return (
    <div className="todo-container reminder-dashboard">
      <aside className="reminder-filter-sidebar">
        <p className="filter-title">Bộ lọc</p>
        <div className="filter-group">
          {[
            { value: "TODAY", label: "Hôm nay", icon: HiOutlineCalendarDays },
            { value: "WEEK", label: "Tuần này", icon: HiOutlineCalendarDays },
            { value: "UPCOMING", label: "Sắp tới", icon: HiOutlineClock },
          ].map((item) => (
            <button
              key={item.value}
              type="button"
              className={`filter-item ${activeFilter === item.value ? "active" : ""}`}
              onClick={() => setActiveFilter(item.value)}
            >
              <item.icon />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
        <div className="filter-divider" />
        <div className="filter-group">
          {[
            { value: "COMPLETED", label: "Đã hoàn thành", icon: HiOutlineCheckCircle },
            { value: "CANCELLED", label: "Đã hủy", icon: HiOutlineXCircle },
          ].map((item) => (
            <button
              key={item.value}
              type="button"
              className={`filter-item ${activeFilter === item.value ? "active" : ""}`}
              onClick={() => setActiveFilter(item.value)}
            >
              <item.icon />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </aside>

      <main className="reminder-main">
        <div className="reminder-header">
          <div>
            <h2>Lịch hẹn</h2>
            <p>Quản lý nhắc hẹn và công việc quan trọng</p>
          </div>
          <div className="reminder-header-actions">
            <div className="reminder-search">
              <HiOutlineMagnifyingGlass />
              <input
                type="text"
                placeholder="Tìm kiếm công việc..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                aria-label="Tìm kiếm lịch hẹn"
              />
            </div>
            <button type="button" className="icon-button" aria-label="Thông báo">
              <HiOutlineBell />
            </button>
            <button type="button" className="icon-button" aria-label="Trợ giúp">
              <HiOutlineQuestionMarkCircle />
            </button>
            <div className="header-avatar">
              {userData?.avatar ? (
                <img src={userData.avatar} alt="" />
              ) : (
                <HiOutlineUser />
              )}
            </div>
          </div>
        </div>

        <div className="reminder-summary">
          <div className="summary-card next-appointment">
            <div className="summary-label">Tiếp theo</div>
            {nextReminder ? (
              <>
                <div className="summary-title-row">
                  <h3>{nextReminder?.title || "Nhắc hẹn"}</h3>
                  <span
                    className={`summary-status status-${
                      STATUS_VARIANTS[nextReminder?.status] || "upcoming"
                    }`}
                  >
                    {STATUS_LABELS[nextReminder?.status] || "Sắp tới"}
                  </span>
                </div>
                <div className="summary-meta">
                  <span>
                    <HiOutlineClock /> {formatDateTime(nextReminder?.remindAt)}
                  </span>
                  {nextReminder?.location ? (
                    <span>
                      <HiOutlineMapPin /> {nextReminder.location}
                    </span>
                  ) : null}
                  {nextReminder?.meetingLink ? (
                    <span>
                      <HiOutlineVideoCamera /> {nextReminder.meetingLink}
                    </span>
                  ) : null}
                </div>
                <p className="summary-description">
                  {nextReminder?.description ||
                    "Lịch hẹn tiếp theo của bạn sẽ hiển thị tại đây."}
                </p>
              </>
            ) : (
              <div className="summary-empty">
                <p>Chưa có lịch hẹn sắp tới.</p>
                <span>Lịch hẹn tiếp theo sẽ hiển thị tại đây.</span>
              </div>
            )}
          </div>

          <div className="summary-card progress-card">
            <p className="progress-label">Hoàn thành trong ngày</p>
            <h3>{completionSummary.percentage}%</h3>
            <span>
              {completionSummary.completed}/{completionSummary.total} nhiệm vụ đã xong
            </span>
            <div className="progress-decor">✓</div>
          </div>
        </div>

        <div className="reminder-section">
          <div className="reminder-section-header">
            <h3>Danh sách công việc</h3>
            <button type="button" className="btn-outline" onClick={() => void loadReminders()}>
              Làm mới
            </button>
          </div>

          {reminderState.loading ? (
            <div className="reminder-skeleton-list">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="reminder-skeleton-card" />
              ))}
            </div>
          ) : null}

          {reminderState.error ? (
            <div className="reminder-error-box">
              <p>{reminderState.error}</p>
              <button type="button" onClick={() => void loadReminders()}>
                Thử lại
              </button>
            </div>
          ) : null}

          {!reminderState.loading && !reminderState.error && filteredItems.length === 0 ? (
            <div className="reminder-empty">
              <h4>{emptyStateMessage.title}</h4>
              <p>{emptyStateMessage.description}</p>
              {searchQuery.trim() ? (
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => setSearchQuery("")}
                >
                  Xóa tìm kiếm
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="reminder-list">
            {filteredItems.map((reminder) => {
              const reminderId = String(reminder?.id || "");
              const isCreator = String(reminder?.createdBy || "") === currentUserId;
              const myParticipant = Array.isArray(reminder?.participants)
                ? reminder.participants.find(
                    (participant) => String(participant?.userId || "") === currentUserId
                  ) || null
                : null;
              const isActionLoading = Boolean(actionLoadingById[reminderId]);
              const statusVariant = STATUS_VARIANTS[reminder?.status] || "upcoming";
              const isExpanded = selectedReminderId === reminderId;

              return (
                <article
                  key={reminderId}
                  className={`reminder-card reminder-card-${statusVariant} ${
                    isExpanded ? "expanded" : ""
                  }`}
                  onClick={() =>
                    setSelectedReminderId((prev) => (prev === reminderId ? "" : reminderId))
                  }
                >
                  <div className="reminder-card-strip" />
                  <div className="reminder-card-body">
                    <div className="reminder-card-top">
                      <div className="reminder-icon">
                        <HiOutlineCalendarDays />
                      </div>
                      <div className="reminder-card-info">
                        <h4>{reminder?.title || "Nhắc hẹn"}</h4>
                        <div className="reminder-meta">
                          <span>
                            <HiOutlineClock /> {formatDateTime(reminder?.remindAt)}
                          </span>
                          {reminder?.meetingLink ? (
                            <span>
                              <HiOutlineVideoCamera /> {reminder.meetingLink}
                            </span>
                          ) : reminder?.location ? (
                            <span>
                              <HiOutlineMapPin /> {reminder.location}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="reminder-card-actions">
                        <span className={`reminder-status-badge ${statusVariant}`}>
                          {STATUS_LABELS[reminder?.status] || "Sắp tới"}
                        </span>
                        <button type="button" className="icon-button" aria-label="Thao tác khác">
                          <HiOutlineEllipsisHorizontal />
                        </button>
                      </div>
                    </div>

                    {isExpanded ? (
                      <div className="reminder-card-details">
                        <div className="detail-panel">
                          <h5>Mô tả chi tiết</h5>
                          <p>{reminder?.description || "Chưa có mô tả chi tiết."}</p>
                        </div>
                        <div className="detail-panel">
                          <h5>Deadline</h5>
                          <p>{reminder?.deadlineNote || "Chưa có ghi chú."}</p>
                        </div>
                        {myParticipant ? (
                          <div className="detail-panel">
                            <h5>Trạng thái của bạn</h5>
                            <p>
                              {PARTICIPANT_STATUS_LABELS[myParticipant.status] ||
                                myParticipant.status ||
                                "N/A"}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="reminder-action-row">
                      {isCreator && reminder?.status !== "CANCELLED" ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleReminderAction(reminderId, "CANCEL");
                          }}
                          disabled={isActionLoading}
                          className="btn-outline"
                        >
                          {isActionLoading ? "Đang xử lý..." : "Hủy"}
                        </button>
                      ) : null}
                      {reminder?.status !== "COMPLETED" && reminder?.status !== "CANCELLED" ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleReminderAction(reminderId, "COMPLETE");
                          }}
                          disabled={isActionLoading}
                          className="btn-primary"
                        >
                          {isActionLoading ? "Đang xử lý..." : "Hoàn thành"}
                        </button>
                      ) : null}
                      {myParticipant?.status === "PENDING" ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleReminderAction(reminderId, "ACK");
                          }}
                          disabled={isActionLoading}
                          className="btn-outline"
                        >
                          {isActionLoading ? "Đang xử lý..." : "Xác nhận"}
                        </button>
                      ) : null}
                      {myParticipant?.status === "PENDING" ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleReminderAction(reminderId, "DISMISS");
                          }}
                          disabled={isActionLoading}
                          className="btn-outline"
                        >
                          {isActionLoading ? "Đang xử lý..." : "Bỏ qua"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </main>

      <button
        type="button"
        className="reminder-fab"
        aria-label="Tạo nhắc hẹn"
        onClick={() => {
          setCreateFormError("");
          setIsCreateModalOpen(true);
        }}
      >
        <HiOutlinePlus />
      </button>

      {isCreateModalOpen ? (
        <div className="reminder-modal-overlay" onClick={() => setIsCreateModalOpen(false)}>
          <div className="reminder-modal" onClick={(event) => event.stopPropagation()}>
            <div className="reminder-modal-header">
              <h3>Tạo nhắc hẹn</h3>
              <button type="button" onClick={() => setIsCreateModalOpen(false)}>
                ✕
              </button>
            </div>
            <form className="reminder-modal-body" onSubmit={handleCreateSubmit}>
              <div className="form-grid">
                <label>
                  Tiêu đề
                  <input
                    type="text"
                    value={createForm.title}
                    onChange={(event) =>
                      setCreateForm((prev) => ({ ...prev, title: event.target.value }))
                    }
                    required
                  />
                </label>
                <label>
                  Mô tả
                  <textarea
                    rows={3}
                    value={createForm.description}
                    onChange={(event) =>
                      setCreateForm((prev) => ({ ...prev, description: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Ngày
                  <input
                    type="date"
                    value={createForm.date}
                    onChange={(event) =>
                      setCreateForm((prev) => ({ ...prev, date: event.target.value }))
                    }
                    required
                  />
                </label>
                <div className="form-row">
                  <label>
                    Bắt đầu
                    <input
                      type="time"
                      value={createForm.startTime}
                      onChange={(event) =>
                        setCreateForm((prev) => ({ ...prev, startTime: event.target.value }))
                      }
                      required
                    />
                  </label>
                  <label>
                    Kết thúc
                    <input
                      type="time"
                      value={createForm.endTime}
                      onChange={(event) =>
                        setCreateForm((prev) => ({ ...prev, endTime: event.target.value }))
                      }
                    />
                  </label>
                </div>
                <label>
                  Địa điểm
                  <input
                    type="text"
                    value={createForm.location}
                    onChange={(event) =>
                      setCreateForm((prev) => ({ ...prev, location: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Link họp
                  <input
                    type="url"
                    value={createForm.meetingLink}
                    onChange={(event) =>
                      setCreateForm((prev) => ({ ...prev, meetingLink: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Mức độ ưu tiên
                  <select
                    value={createForm.priority}
                    onChange={(event) =>
                      setCreateForm((prev) => ({ ...prev, priority: event.target.value }))
                    }
                  >
                    <option value="LOW">Thấp</option>
                    <option value="MEDIUM">Trung bình</option>
                    <option value="HIGH">Cao</option>
                  </select>
                </label>
                <label>
                  Loại nhắc hẹn
                  <select
                    value={createForm.type}
                    onChange={(event) =>
                      setCreateForm((prev) => ({ ...prev, type: event.target.value }))
                    }
                  >
                    <option value="TASK">Công việc</option>
                    <option value="MEETING">Cuộc họp</option>
                    <option value="DEADLINE">Deadline</option>
                    <option value="PERSONAL">Cá nhân</option>
                  </select>
                </label>
                <label>
                  Nhắc trước
                  <select
                    value={createForm.notificationTime}
                    onChange={(event) =>
                      setCreateForm((prev) => ({ ...prev, notificationTime: event.target.value }))
                    }
                  >
                    <option value="AT_TIME">Đúng giờ</option>
                    <option value="5_MIN">Trước 5 phút</option>
                    <option value="15_MIN">Trước 15 phút</option>
                    <option value="30_MIN">Trước 30 phút</option>
                    <option value="1_HOUR">Trước 1 giờ</option>
                  </select>
                </label>
                <label>
                  Lặp lại
                  <select
                    value={createForm.repeat}
                    onChange={(event) =>
                      setCreateForm((prev) => ({ ...prev, repeat: event.target.value }))
                    }
                  >
                    <option value="NONE">Không lặp</option>
                    <option value="DAILY">Hàng ngày</option>
                    <option value="WEEKLY">Hàng tuần</option>
                    <option value="MONTHLY">Hàng tháng</option>
                  </select>
                </label>
              </div>
              {createFormError ? <p className="form-error">{createFormError}</p> : null}
              <div className="reminder-modal-actions">
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  Hủy
                </button>
                <button type="submit" className="btn-primary">
                  Lưu nhắc hẹn
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
