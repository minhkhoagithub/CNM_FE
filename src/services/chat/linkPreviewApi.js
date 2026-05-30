import apiClient from "../../util/api/axiosConfig";

export const getLinkPreview = async (url) => {
  const response = await apiClient.get("/link-preview", {
    params: { url },
  });
  return response?.data?.data ?? response?.data ?? null;
};
