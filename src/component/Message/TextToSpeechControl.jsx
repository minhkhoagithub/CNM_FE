import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  IoPause,
  IoRefreshOutline,
  IoVolumeHighOutline,
  IoWarningOutline,
} from "react-icons/io5";
import {
  getProcessingJob,
  requestTextToSpeech,
} from "../../services/messageProcessing/messageProcessingApi";
import MessageProcessingContext from "../../Context/MessageProcessingContext";

const resolveApiErrorMessage = (error, fallback) => {
  const responseMessage = error?.response?.data?.message;
  if (typeof responseMessage === "string" && responseMessage.trim()) {
    return responseMessage.trim();
  }

  const nestedMessage = error?.response?.data?.error;
  if (typeof nestedMessage === "string" && nestedMessage.trim()) {
    return nestedMessage.trim();
  }

  return fallback;
};

export default function TextToSpeechControl({ messageId, text, isMine = false }) {
  const audioRef = useRef(null);
  const { getJobRealtime } = useContext(MessageProcessingContext);
  const playbackKey = useMemo(() => `tts:${String(messageId || "")}`, [messageId]);
  const [ttsJob, setTtsJob] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [autoPlayWhenReady, setAutoPlayWhenReady] = useState(false);

  const status = String(ttsJob?.status || "").toUpperCase();
  const jobId = ttsJob?.id || null;
  const audioUrl = String(ttsJob?.resultFileUrl || "").trim();
  const pending = status === "PENDING" || status === "PROCESSING";
  const hasText = String(text || "").trim().length > 0;
  const realtimeJobEvent = getJobRealtime(jobId);
  const effectiveErrorMessage =
    actionError ||
    (status === "FAILED" ? String(ttsJob?.errorMessage || "").trim() : "");

  const pauseAudio = useCallback(() => {
    if (!audioRef.current) {
      return;
    }
    audioRef.current.pause();
    setIsPlaying(false);
  }, []);

  const playAudio = useCallback(async () => {
    if (!audioRef.current || !audioUrl) {
      return;
    }
    try {
      window.dispatchEvent(
        new CustomEvent("web:voice-playback-started", {
          detail: { playbackKey },
        })
      );
      await audioRef.current.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
      setActionError("Không thể phát âm thanh TTS.");
    }
  }, [audioUrl, playbackKey]);

  useEffect(() => {
    if (!jobId || !pending) {
      return undefined;
    }

    let active = true;
    let attempts = 0;
    const maxAttempts = 20;
    const intervalId = setInterval(async () => {
      attempts += 1;
      if (attempts > maxAttempts) {
        clearInterval(intervalId);
        return;
      }
      try {
        const refreshed = await getProcessingJob(jobId);
        if (!active || !refreshed) {
          return;
        }
        setTtsJob(refreshed);
      } catch {
        // Keep polling silent; failed status will be reflected by backend.
      }
    }, 2500);

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [jobId, pending]);

  useEffect(() => {
    if (!realtimeJobEvent || !jobId) {
      return;
    }
    if (String(realtimeJobEvent.jobId || "") !== String(jobId || "")) {
      return;
    }
    if (realtimeJobEvent.jobType && String(realtimeJobEvent.jobType).toUpperCase() !== "TTS") {
      return;
    }

    setTtsJob((prevState) => ({
      ...(prevState || {}),
      id: jobId,
      messageId: messageId || prevState?.messageId || null,
      jobType: "TTS",
      status: realtimeJobEvent.status || prevState?.status || "",
      resultFileUrl:
        typeof realtimeJobEvent.audioUrl === "string"
          ? realtimeJobEvent.audioUrl
          : prevState?.resultFileUrl || "",
      errorMessage:
        typeof realtimeJobEvent.errorMessage === "string"
          ? realtimeJobEvent.errorMessage
          : prevState?.errorMessage || "",
      completedAt: realtimeJobEvent.occurredAt || prevState?.completedAt || null,
    }));
  }, [jobId, messageId, realtimeJobEvent]);

  useEffect(() => {
    if (!autoPlayWhenReady || !audioUrl) {
      return;
    }
    setAutoPlayWhenReady(false);
    playAudio();
  }, [audioUrl, autoPlayWhenReady, playAudio]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return undefined;
    }

    const handlePlaying = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);
    const handleError = () => setActionError("Không tải được tệp âm thanh TTS.");

    audio.addEventListener("playing", handlePlaying);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("playing", handlePlaying);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, []);

  useEffect(() => {
    const handleExternalPlayback = (event) => {
      if (!event?.detail || event.detail.playbackKey === playbackKey) {
        return;
      }
      pauseAudio();
    };

    window.addEventListener("web:voice-playback-started", handleExternalPlayback);
    return () => {
      window.removeEventListener("web:voice-playback-started", handleExternalPlayback);
    };
  }, [pauseAudio, playbackKey]);

  const handlePrimaryAction = useCallback(async () => {
    if (!messageId || !hasText || pending || actionLoading) {
      return;
    }

    setActionError("");

    if (status === "COMPLETED" && audioUrl) {
      if (isPlaying) {
        pauseAudio();
      } else {
        playAudio();
      }
      return;
    }

    setActionLoading(true);
    setAutoPlayWhenReady(true);

    try {
      const createdJob = await requestTextToSpeech(messageId, {
        language: "vi",
        voice: "default",
        forceRefresh: status === "FAILED",
      });
      setTtsJob(createdJob);

      if (String(createdJob?.status || "").toUpperCase() === "COMPLETED") {
        setAutoPlayWhenReady(false);
        playAudio();
      }
    } catch (error) {
      setAutoPlayWhenReady(false);
      setActionError(
        resolveApiErrorMessage(error, "Không thể tạo âm thanh từ văn bản.")
      );
    } finally {
      setActionLoading(false);
    }
  }, [
    actionLoading,
    audioUrl,
    hasText,
    isPlaying,
    messageId,
    pauseAudio,
    pending,
    playAudio,
    status,
  ]);

  if (!hasText) {
    return null;
  }

  const buttonLabel = (() => {
    if (pending) {
      return "Đang tạo giọng đọc...";
    }
    if (actionLoading) {
      return "Đang gửi yêu cầu...";
    }
    if (status === "FAILED") {
      return "Thử lại";
    }
    if (status === "COMPLETED") {
      return isPlaying ? "Tạm dừng" : "Nghe văn bản";
    }
    return "Nghe văn bản";
  })();

  return (
    <div className={`tts-control ${isMine ? "tts-control--mine" : ""}`}>
      <button
        type="button"
        className="tts-control-btn"
        onClick={handlePrimaryAction}
        disabled={pending || actionLoading}
      >
        {status === "FAILED" ? <IoRefreshOutline /> : isPlaying ? <IoPause /> : <IoVolumeHighOutline />}
        <span>{buttonLabel}</span>
      </button>

      {effectiveErrorMessage ? (
        <p className="tts-control-error">
          <IoWarningOutline />
          <span>{effectiveErrorMessage}</span>
        </p>
      ) : null}

      {audioUrl ? (
        <audio
          className="tts-audio-player"
          ref={audioRef}
          preload="metadata"
          controls
          src={audioUrl}
        />
      ) : null}
    </div>
  );
}
