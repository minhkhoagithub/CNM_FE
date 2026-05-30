import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { UserContext } from "./UserContext";
import chatRealtimeService from "../services/chat/chatRealtimeService";
import { setChatUserId } from "../services/chat/chatSession";

const normalizePayload = (event) => {
  if (!event || typeof event !== "object") {
    return null;
  }

  const payload = event?.payload && typeof event.payload === "object" ? event.payload : event;
  const jobId = String(payload?.jobId || "").trim();
  if (!jobId) {
    return null;
  }

  return {
    jobId,
    messageId: payload?.messageId ?? null,
    conversationId: payload?.conversationId ?? null,
    attachmentId: payload?.attachmentId ?? null,
    jobType: String(payload?.jobType || "").trim().toUpperCase(),
    jobScope: String(payload?.jobScope || "").trim().toUpperCase(),
    status: String(payload?.status || "").trim().toUpperCase(),
    resultText: payload?.resultText ?? "",
    audioUrl: payload?.audioUrl ?? "",
    errorMessage: payload?.errorMessage ?? "",
    occurredAt: payload?.occurredAt || new Date().toISOString(),
  };
};

const MessageProcessingContext = createContext({
  getJobRealtime: () => null,
});

export const MessageProcessingProvider = ({ children }) => {
  const { userData } = useContext(UserContext);
  const [eventsByJobId, setEventsByJobId] = useState({});
  const currentUserId = userData?.userId || userData?._id || null;

  useEffect(() => {
    if (!currentUserId) {
      return undefined;
    }

    setChatUserId(currentUserId);
    const subscriptionKey = `message-processing:user:${currentUserId}`;
    chatRealtimeService
      .subscribe(
        subscriptionKey,
        `/topic/users/${currentUserId}/message-processing`,
        (event) => {
          const normalizedPayload = normalizePayload(event);
          if (!normalizedPayload) {
            return;
          }
          setEventsByJobId((prevState) => ({
            ...prevState,
            [normalizedPayload.jobId]: normalizedPayload,
          }));
        }
      )
      .catch((error) => {
        console.error("Failed to subscribe message processing realtime:", error);
      });

    return () => {
      chatRealtimeService.unsubscribe(subscriptionKey);
      setEventsByJobId({});
    };
  }, [currentUserId]);

  const contextValue = useMemo(
    () => ({
      getJobRealtime: (jobId) => {
        const normalizedJobId = String(jobId || "").trim();
        if (!normalizedJobId) {
          return null;
        }
        return eventsByJobId[normalizedJobId] || null;
      },
    }),
    [eventsByJobId]
  );

  return (
    <MessageProcessingContext.Provider value={contextValue}>
      {children}
    </MessageProcessingContext.Provider>
  );
};

export default MessageProcessingContext;
