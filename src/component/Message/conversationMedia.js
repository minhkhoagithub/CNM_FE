import { isImageAttachment, mapMessagePage } from "../../mappers/messageMapper";
import { getConversationMessages } from "../../services/chat/messageApi";

const SHARED_ATTACHMENT_PAGE_SIZE = 100;
const SHARED_ATTACHMENT_MAX_PAGES = 20;
const URL_PATTERN = /\bhttps?:\/\/[^\s<>"')]+/gi;

export const buildConversationSharedAttachments = (messages) => {
  const normalizedMessages = Array.isArray(messages) ? messages : [];
  const attachmentEntries = [];
  const seenAttachmentKeys = new Set();

  normalizedMessages.forEach((message) => {
    const messageAttachments = Array.isArray(message?.attachments) ? message.attachments : [];

    messageAttachments.forEach((attachment, attachmentIndex) => {
      if (!attachment?.url) {
        return;
      }

      const attachmentKey =
        attachment?.id ||
        attachment?.storageKey ||
        `${message?.id || "message"}-${attachment?.url}-${attachmentIndex}`;

      if (seenAttachmentKeys.has(String(attachmentKey))) {
        return;
      }

      seenAttachmentKeys.add(String(attachmentKey));
      attachmentEntries.push({
        id: attachmentKey,
        messageId: message?.id || null,
        url: attachment.url,
        fileName:
          attachment?.fileName ||
          (isImageAttachment(attachment) ? "Ảnh đã chia sẻ" : "Tệp đính kèm"),
        fileSize: Number(attachment?.fileSize || 0),
        contentType: attachment?.contentType || "",
        createdAt: message?.createdAt || null,
        isImage: isImageAttachment(attachment),
      });
    });
  });

  return attachmentEntries.sort((leftAttachment, rightAttachment) => {
    const leftTime = new Date(leftAttachment.createdAt || 0).getTime();
    const rightTime = new Date(rightAttachment.createdAt || 0).getTime();
    return rightTime - leftTime;
  });
};

const normalizeSharedLinkUrl = (value) => {
  const rawUrl = String(value || "").trim();
  if (!rawUrl) {
    return "";
  }

  try {
    const parsed = new URL(rawUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "";
    }

    return parsed.href;
  } catch {
    return "";
  }
};

const getSharedLinkTitle = (url) => {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
};

export const buildConversationSharedLinks = (messages) => {
  const normalizedMessages = Array.isArray(messages) ? messages : [];
  const links = [];
  const seenUrls = new Set();

  normalizedMessages.forEach((message) => {
    const candidateUrls = [
      message?.originalLinkUrl,
      ...(String(message?.content || "").match(URL_PATTERN) || []),
    ];

    candidateUrls.forEach((candidateUrl) => {
      const url = normalizeSharedLinkUrl(candidateUrl);
      if (!url || seenUrls.has(url)) {
        return;
      }

      seenUrls.add(url);
      links.push({
        id: `${message?.id || "message"}-${url}`,
        messageId: message?.id || null,
        url,
        title: message?.linkPreviewTitle || message?.originalLinkTitle || getSharedLinkTitle(url),
        description:
          message?.linkPreviewDescription ||
          message?.originalLinkDescription ||
          "",
        imageUrl: message?.linkPreviewImageUrl || message?.originalLinkImageUrl || "",
        createdAt: message?.createdAt || null,
      });
    });
  });

  return links.sort((leftLink, rightLink) => {
    const leftTime = new Date(leftLink.createdAt || 0).getTime();
    const rightTime = new Date(rightLink.createdAt || 0).getTime();
    return rightTime - leftTime;
  });
};

const collectConversationMessages = async ({ conversationId, currentUserId }) => {
  if (!conversationId) {
    return {
      messages: [],
      isPartial: false,
    };
  }

  let cursor = null;
  let hasMore = true;
  let pageCount = 0;
  const collectedMessages = [];

  while (hasMore && pageCount < SHARED_ATTACHMENT_MAX_PAGES) {
    const response = await getConversationMessages(conversationId, {
      cursor,
      size: SHARED_ATTACHMENT_PAGE_SIZE,
    });
    const messagePage = mapMessagePage(response, {
      conversationId,
      currentUserId,
    });

    collectedMessages.push(...messagePage.items);
    cursor = messagePage.nextCursor || null;
    hasMore = Boolean(messagePage.hasMore && cursor);
    pageCount += 1;
  }

  return {
    messages: collectedMessages,
    isPartial: hasMore,
  };
};

export const fetchConversationSharedAttachments = async ({
  conversationId,
  currentUserId,
}) => {
  const { messages, isPartial } = await collectConversationMessages({
    conversationId,
    currentUserId,
  });

  return {
    attachments: buildConversationSharedAttachments(messages),
    isPartial,
  };
};

export const fetchConversationSharedLinks = async ({
  conversationId,
  currentUserId,
}) => {
  const { messages, isPartial } = await collectConversationMessages({
    conversationId,
    currentUserId,
  });

  return {
    links: buildConversationSharedLinks(messages),
    isPartial,
  };
};
