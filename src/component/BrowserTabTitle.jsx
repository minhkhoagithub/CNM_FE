import { useContext, useEffect, useMemo, useRef } from "react";
import { ContactContext } from "../Context/ContactConext";
import { useNotifications } from "../Context/NotificationContext";

const UNREAD_DOT = "\u{1F534}";
const TITLE_UNREAD_PREFIX = /^(?:\u{1F534}\s*)?\(\d+\+?\)\s*/u;
const DEFAULT_TITLE = "zalo-ui-web";
const DEFAULT_FAVICON_HREF = "/favicon.svg";

const normalizeTitle = (title) => {
  const cleanTitle = String(title || "").replace(TITLE_UNREAD_PREFIX, "").trim();
  return cleanTitle || DEFAULT_TITLE;
};

const normalizeCount = (value) => {
  const count = Number(value);
  if (!Number.isFinite(count) || count <= 0) {
    return 0;
  }
  return Math.floor(count);
};

const getConversationKey = (conversation) =>
  conversation?.id ||
  conversation?.conversationId ||
  conversation?._id ||
  conversation?.raw?.id ||
  conversation?.raw?.conversationId ||
  null;

const getConversationUnreadTotal = (conversations) => {
  if (!Array.isArray(conversations)) {
    return 0;
  }

  const seenConversationKeys = new Set();

  return conversations.reduce((total, conversation, index) => {
    const key = getConversationKey(conversation) || `conversation-${index}`;
    if (seenConversationKeys.has(key)) {
      return total;
    }
    seenConversationKeys.add(key);

    return total + normalizeCount(conversation?.unreadCount ?? conversation?.raw?.unreadCount);
  }, 0);
};

const formatUnreadCount = (count) => (count > 99 ? "99+" : String(count));

const getFaviconLink = () => {
  let link = document.querySelector("link[rel~='icon']");

  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/svg+xml";
    link.href = DEFAULT_FAVICON_HREF;
    document.head.appendChild(link);
  }

  return link;
};

const resolveFaviconUrl = (href) => {
  try {
    return new URL(href || DEFAULT_FAVICON_HREF, window.location.origin).href;
  } catch {
    return DEFAULT_FAVICON_HREF;
  }
};

const createFallbackBadgedFavicon = () => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <rect x="8" y="8" width="48" height="48" rx="14" fill="#2563eb"/>
      <path d="M35 12 20 35h12l-3 17 16-25H33l2-15Z" fill="#ffffff"/>
      <circle cx="50" cy="14" r="10" fill="#ef4444" stroke="#ffffff" stroke-width="4"/>
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const createBadgedFavicon = (baseHref) =>
  new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 64;

        const context = canvas.getContext("2d");
        if (!context) {
          resolve(createFallbackBadgedFavicon());
          return;
        }

        context.clearRect(0, 0, 64, 64);
        context.drawImage(image, 8, 8, 48, 48);
        context.beginPath();
        context.arc(50, 14, 10, 0, Math.PI * 2);
        context.fillStyle = "#ef4444";
        context.fill();
        context.lineWidth = 4;
        context.strokeStyle = "#ffffff";
        context.stroke();

        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(createFallbackBadgedFavicon());
      }
    };
    image.onerror = () => resolve(createFallbackBadgedFavicon());
    image.src = resolveFaviconUrl(baseHref);
  });

function BrowserTabTitle() {
  const { unreadCount: notificationUnreadCount = 0 } = useNotifications();
  const {
    conversations = [],
    normalizedConversations = [],
    archivedConversations = [],
  } = useContext(ContactContext) || {};

  const baseFaviconHrefRef = useRef(null);
  const baseTitle = useMemo(() => normalizeTitle(document.title), []);

  const unreadCount = useMemo(() => {
    const activeConversations = normalizedConversations.length
      ? normalizedConversations
      : conversations;
    const conversationUnreadCount = getConversationUnreadTotal([
      ...activeConversations,
      ...archivedConversations,
    ]);

    return Math.max(normalizeCount(notificationUnreadCount), conversationUnreadCount);
  }, [archivedConversations, conversations, normalizedConversations, notificationUnreadCount]);

  useEffect(() => {
    document.title =
      unreadCount > 0
        ? `${UNREAD_DOT} (${formatUnreadCount(unreadCount)}) ${baseTitle}`
        : baseTitle;

    return () => {
      document.title = baseTitle;
    };
  }, [baseTitle, unreadCount]);

  useEffect(() => {
    const link = getFaviconLink();

    if (!baseFaviconHrefRef.current) {
      baseFaviconHrefRef.current =
        link.getAttribute("href") || link.href || DEFAULT_FAVICON_HREF;
    }

    const baseFaviconHref = baseFaviconHrefRef.current;
    let cancelled = false;

    if (unreadCount <= 0) {
      link.href = baseFaviconHref;
      return () => {
        cancelled = true;
      };
    }

    createBadgedFavicon(baseFaviconHref).then((badgedFaviconHref) => {
      if (!cancelled) {
        link.href = badgedFaviconHref;
      }
    });

    return () => {
      cancelled = true;
    };
  }, [unreadCount]);

  useEffect(
    () => () => {
      const link = getFaviconLink();
      if (baseFaviconHrefRef.current) {
        link.href = baseFaviconHrefRef.current;
      }
    },
    []
  );

  return null;
}

export default BrowserTabTitle;
