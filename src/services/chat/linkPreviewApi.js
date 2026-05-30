import chatHttpClient from "./chatHttpClient";

export const getLinkPreview = async (url) => {
  const response = await chatHttpClient.get("/link-preview", {
    params: { url },
  });
  return response?.data?.data ?? response?.data ?? null;
};
