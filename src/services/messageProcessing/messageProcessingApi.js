import chatHttpClient from "../chat/chatHttpClient";

const unwrapResponseData = (response) => response.data?.data ?? response.data;

export const requestSpeechToText = async (
  messageId,
  { attachmentId = null, language = "vi", forceRefresh = false } = {}
) => {
  const payload = {
    language,
    forceRefresh,
    ...(attachmentId ? { attachmentId } : {}),
  };
  const response = await chatHttpClient.post(
    `/messages/${messageId}/processing/stt`,
    payload
  );
  return unwrapResponseData(response);
};

export const requestTextToSpeech = async (
  messageId,
  { language = "vi", voice = "default", forceRefresh = false } = {}
) => {
  const payload = {
    language,
    voice,
    forceRefresh,
  };
  const response = await chatHttpClient.post(
    `/messages/${messageId}/processing/tts`,
    payload
  );
  return unwrapResponseData(response);
};

export const requestDictationSpeechToText = async ({
  conversationId,
  audioBlob,
  language = "vi",
  audioFormat = "",
  durationMs = null,
} = {}) => {
  if (!conversationId) {
    throw new Error("conversationId is required");
  }
  if (!audioBlob) {
    throw new Error("audioBlob is required");
  }

  const formData = new FormData();
  const extension = audioFormat ? String(audioFormat).toLowerCase() : "webm";
  formData.append(
    "audio",
    audioBlob,
    `dictation-${Date.now()}.${extension}`
  );
  formData.append("conversationId", String(conversationId));
  if (language) {
    formData.append("language", language);
  }
  if (audioFormat) {
    formData.append("audioFormat", audioFormat);
  }
  if (Number.isFinite(Number(durationMs)) && Number(durationMs) > 0) {
    formData.append("durationMs", String(Math.round(Number(durationMs))));
  }

  const response = await chatHttpClient.post(
    "/message-processing/dictation/stt",
    formData
  );
  return unwrapResponseData(response);
};

export const getLatestProcessing = async (
  messageId,
  { jobType, attachmentId = null } = {}
) => {
  if (!jobType) {
    throw new Error("jobType is required");
  }

  const response = await chatHttpClient.get(
    `/messages/${messageId}/processing/latest`,
    {
      params: {
        jobType,
        ...(attachmentId ? { attachmentId } : {}),
      },
    }
  );
  return unwrapResponseData(response);
};

export const getProcessingJob = async (jobId) => {
  const response = await chatHttpClient.get(`/message-processing/jobs/${jobId}`);
  return unwrapResponseData(response);
};

export const retryProcessingJob = async (jobId) => {
  const response = await chatHttpClient.post(`/message-processing/jobs/${jobId}/retry`);
  return unwrapResponseData(response);
};
