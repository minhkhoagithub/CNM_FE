import { isImageAttachment, mapMessagePage } from "../../mappers/messageMapper";
import { getConversationMessages } from "../../services/chat/messageApi";

const SHARED_ATTACHMENT_PAGE_SIZE = 100;
const SHARED_ATTACHMENT_MAX_PAGES = 20;

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
          (isImageAttachment(attachment) ? "Anh da chia se" : "Tep dinh kem"),
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

export const fetchConversationSharedAttachments = async ({
  conversationId,
  currentUserId,
}) => {
  if (!conversationId) {
    return {
      attachments: [],
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
    attachments: buildConversationSharedAttachments(collectedMessages),
    isPartial: hasMore,
  };
};
