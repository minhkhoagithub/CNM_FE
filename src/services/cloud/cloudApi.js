import chatHttpClient from "../chat/chatHttpClient";

const unwrapResponseData = (response) => response.data?.data ?? response.data;

export const listCloudFiles = async ({
  parentFolderId = null,
  q = "",
  type = null,
  page = 0,
  size = 50,
} = {}) => {
  const params = {
    page,
    size,
  };

  if (parentFolderId) {
    params.parentFolderId = parentFolderId;
  }
  if (q && String(q).trim()) {
    params.q = String(q).trim();
  }
  if (type) {
    params.type = type;
  }

  const response = await chatHttpClient.get("/cloud/files", { params });
  return unwrapResponseData(response);
};

export const uploadCloudFile = async (file, { parentFolderId = null } = {}) => {
  const formData = new FormData();
  formData.append("file", file);
  if (parentFolderId) {
    formData.append("parentFolderId", parentFolderId);
  }

  const response = await chatHttpClient.post("/cloud/files/upload", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return unwrapResponseData(response);
};

export const createCloudFolder = async ({ name, parentFolderId = null }) => {
  const response = await chatHttpClient.post("/cloud/folders", {
    name,
    parentFolderId,
  });
  return unwrapResponseData(response);
};

export const renameCloudFile = async (fileId, { name }) => {
  const response = await chatHttpClient.patch(`/cloud/files/${fileId}`, { name });
  return unwrapResponseData(response);
};

export const deleteCloudFile = async (fileId) => {
  const response = await chatHttpClient.delete(`/cloud/files/${fileId}`);
  return unwrapResponseData(response);
};

export const getCloudStorageSummary = async () => {
  const response = await chatHttpClient.get("/cloud/storage/summary");
  return unwrapResponseData(response);
};

export const listCloudTrash = async ({
  q = "",
  type = null,
  page = 0,
  size = 50,
} = {}) => {
  const params = {
    page,
    size,
  };

  if (q && String(q).trim()) {
    params.q = String(q).trim();
  }
  if (type) {
    params.type = type;
  }

  const response = await chatHttpClient.get("/cloud/trash", { params });
  return unwrapResponseData(response);
};

export const restoreCloudFile = async (fileId) => {
  const response = await chatHttpClient.post(`/cloud/files/${fileId}/restore`);
  return unwrapResponseData(response);
};

export const permanentlyDeleteCloudFile = async (fileId) => {
  const response = await chatHttpClient.delete(`/cloud/files/${fileId}/permanent`);
  return unwrapResponseData(response);
};

export const sendCloudFileToConversation = async (
  fileId,
  { conversationId, message = "" }
) => {
  const response = await chatHttpClient.post(
    `/cloud/files/${fileId}/send-to-conversation`,
    {
      conversationId,
      message,
    }
  );
  return unwrapResponseData(response);
};
