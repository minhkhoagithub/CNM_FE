import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  IoChevronDownOutline,
  IoChevronUpOutline,
  IoDocumentTextOutline,
  IoPause,
  IoPlay,
  IoRefreshOutline,
  IoWarningOutline,
} from "react-icons/io5";
import {
  getLatestProcessing,
  getProcessingJob,
  requestSpeechToText,
  retryProcessingJob,
} from "../../services/messageProcessing/messageProcessingApi";
import MessageProcessingContext from "../../Context/MessageProcessingContext";

const formatDuration = (milliseconds) => {
  const totalSeconds = Number.isFinite(Number(milliseconds))
    ? Math.max(0, Math.round(Number(milliseconds) / 1000))
    : 0;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const normalizeWaveform = (inputWaveform) => {
  if (!Array.isArray(inputWaveform) || inputWaveform.length === 0) {
    return null;
  }

  const values = inputWaveform
    .map((sample) => Number(sample))
    .filter((sample) => Number.isFinite(sample))
    .map((sample) => Math.min(1, Math.max(0, sample)));

  return values.length ? values : null;
};

const buildFallbackWaveform = (samples = 48) =>
  Array.from({ length: samples }, (_, index) => {
    const base = Math.sin((index / samples) * Math.PI * 3.5);
    const normalized = Math.abs(base * 0.65) + 0.2;
    return Math.min(1, Math.max(0.15, normalized));
  });

export default function VoiceMessageBubble({
  attachment,
  messageId,
  isMine = false,
}) {
  const audioRef = useRef(null);
  const waveformRef = useRef(null);
  const { getJobRealtime } = useContext(MessageProcessingContext);
  const playbackKey = useMemo(
    () => `${String(messageId || "")}:${String(attachment?.id || attachment?.url || "")}`,
    [attachment?.id, attachment?.url, messageId]
  );

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [durationMs, setDurationMs] = useState(
    Number.isFinite(Number(attachment?.durationMs)) ? Number(attachment.durationMs) : 0
  );
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [transcriptJob, setTranscriptJob] = useState(null);
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  const [transcriptActionLoading, setTranscriptActionLoading] = useState(false);
  const [transcriptActionError, setTranscriptActionError] = useState("");

  const waveformValues = useMemo(
    () => normalizeWaveform(attachment?.waveform) || buildFallbackWaveform(48),
    [attachment?.waveform]
  );

  const progressRatio = durationMs > 0 ? Math.min(1, Math.max(0, currentTimeMs / durationMs)) : 0;
  const transcriptStatus = String(transcriptJob?.status || "").toUpperCase();
  const transcriptText = String(transcriptJob?.resultText || "").trim();
  const transcriptErrorText = String(
    transcriptJob?.errorMessage || transcriptActionError || ""
  ).trim();
  const transcriptJobId = transcriptJob?.id || null;
  const transcriptPending =
    transcriptStatus === "PENDING" || transcriptStatus === "PROCESSING";
  const realtimeJobEvent = getJobRealtime(transcriptJobId);

  const pauseAudio = useCallback(() => {
    if (!audioRef.current) {
      return;
    }

    audioRef.current.pause();
    setIsPlaying(false);
  }, []);

  const handleTogglePlay = useCallback(async () => {
    if (!audioRef.current || errorMessage) {
      return;
    }

    if (isPlaying) {
      pauseAudio();
      return;
    }

    try {
      setErrorMessage("");
      window.dispatchEvent(
        new CustomEvent("web:voice-playback-started", {
          detail: { playbackKey },
        })
      );
      await audioRef.current.play();
      setIsPlaying(true);
    } catch (error) {
      console.error("Failed to play audio message:", error);
      setErrorMessage("Không thể phát tin nhắn thoại.");
      setIsPlaying(false);
    }
  }, [errorMessage, isPlaying, pauseAudio, playbackKey]);

  const handleSeek = useCallback(
    (event) => {
      if (!audioRef.current || !waveformRef.current || durationMs <= 0) {
        return;
      }

      const bounds = waveformRef.current.getBoundingClientRect();
      const clientX =
        Number.isFinite(event?.clientX) && event.clientX > 0
          ? event.clientX
          : bounds.left + bounds.width / 2;
      const ratio = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width));
      const targetTimeMs = Math.round(ratio * durationMs);
      audioRef.current.currentTime = targetTimeMs / 1000;
      setCurrentTimeMs(targetTimeMs);
    },
    [durationMs]
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return undefined;
    }

    const handleLoadedMetadata = () => {
      const resolvedDurationMs =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? Math.round(audio.duration * 1000)
          : Number.isFinite(Number(attachment?.durationMs))
          ? Number(attachment.durationMs)
          : 0;
      setDurationMs(resolvedDurationMs);
      setIsLoading(false);
    };

    const handleTimeUpdate = () => {
      setCurrentTimeMs(Math.round(audio.currentTime * 1000));
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTimeMs(durationMs > 0 ? durationMs : 0);
      audio.currentTime = 0;
      setCurrentTimeMs(0);
    };

    const handleError = () => {
      setIsPlaying(false);
      setIsLoading(false);
      setErrorMessage("Không tải được tệp âm thanh.");
    };

    const handlePlaying = () => {
      setIsPlaying(true);
      setIsLoading(false);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    audio.addEventListener("playing", handlePlaying);
    audio.addEventListener("pause", handlePause);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("playing", handlePlaying);
      audio.removeEventListener("pause", handlePause);
    };
  }, [attachment?.durationMs, durationMs]);

  useEffect(() => {
    let active = true;

    const loadLatestTranscriptJob = async () => {
      if (!messageId) {
        return;
      }

      try {
        const latestJob = await getLatestProcessing(messageId, {
          jobType: "STT",
          attachmentId: attachment?.id || null,
        });

        if (!active || !latestJob) {
          return;
        }

        setTranscriptJob(latestJob);
        if (
          String(latestJob?.status || "").toUpperCase() === "COMPLETED" &&
          String(latestJob?.resultText || "").trim()
        ) {
          setTranscriptExpanded(true);
        }
      } catch {
        // Ignore initial load errors; user can request STT manually.
      }
    };

    loadLatestTranscriptJob();

    return () => {
      active = false;
    };
  }, [attachment?.id, messageId]);

  useEffect(() => {
    if (!transcriptJobId || !transcriptPending) {
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
        const refreshedJob = await getProcessingJob(transcriptJobId);
        if (!active || !refreshedJob) {
          return;
        }

        const refreshedStatus = String(refreshedJob?.status || "").toUpperCase();
        setTranscriptJob(refreshedJob);

        if (
          refreshedStatus === "COMPLETED" &&
          String(refreshedJob?.resultText || "").trim()
        ) {
          setTranscriptExpanded(true);
        }
      } catch {
        // Keep polling silent; error will be reflected by failed job state from backend.
      }
    }, 2500);

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [transcriptJobId, transcriptPending]);

  useEffect(() => {
    if (!realtimeJobEvent || !transcriptJobId) {
      return;
    }
    if (String(realtimeJobEvent.jobId || "") !== String(transcriptJobId || "")) {
      return;
    }
    if (realtimeJobEvent.jobType && String(realtimeJobEvent.jobType).toUpperCase() !== "STT") {
      return;
    }

    setTranscriptJob((prevState) => ({
      ...(prevState || {}),
      id: transcriptJobId,
      messageId: messageId || prevState?.messageId || null,
      attachmentId: attachment?.id || prevState?.attachmentId || null,
      jobType: "STT",
      status: realtimeJobEvent.status || prevState?.status || "",
      resultText:
        typeof realtimeJobEvent.resultText === "string"
          ? realtimeJobEvent.resultText
          : prevState?.resultText || "",
      errorMessage:
        typeof realtimeJobEvent.errorMessage === "string"
          ? realtimeJobEvent.errorMessage
          : prevState?.errorMessage || "",
      completedAt: realtimeJobEvent.occurredAt || prevState?.completedAt || null,
    }));

    if (
      String(realtimeJobEvent.status || "").toUpperCase() === "COMPLETED" &&
      String(realtimeJobEvent.resultText || "").trim()
    ) {
      setTranscriptExpanded(true);
    }
  }, [attachment?.id, messageId, realtimeJobEvent, transcriptJobId]);

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

  const resolveRequestErrorMessage = (error, fallback) => {
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

  const handleRequestTranscript = useCallback(async () => {
    if (!messageId || transcriptPending || transcriptActionLoading) {
      return;
    }

    setTranscriptActionLoading(true);
    setTranscriptActionError("");

    try {
      const nextJob =
        transcriptStatus === "FAILED" && transcriptJobId
          ? await retryProcessingJob(transcriptJobId)
          : await requestSpeechToText(messageId, {
              attachmentId: attachment?.id || null,
              language: "vi",
              forceRefresh: transcriptStatus === "COMPLETED",
            });

      setTranscriptJob(nextJob);
      if (
        String(nextJob?.status || "").toUpperCase() === "COMPLETED" &&
        String(nextJob?.resultText || "").trim()
      ) {
        setTranscriptExpanded(true);
      }
    } catch (error) {
      setTranscriptActionError(
        resolveRequestErrorMessage(error, "Không thể xử lý chuyển giọng nói thành văn bản.")
      );
    } finally {
      setTranscriptActionLoading(false);
    }
  }, [
    attachment?.id,
    messageId,
    transcriptActionLoading,
    transcriptJobId,
    transcriptPending,
    transcriptStatus,
  ]);

  useEffect(() => {
    const handleExternalTranscriptRequest = (event) => {
      const detail = event?.detail || {};
      if (String(detail.messageId || "") !== String(messageId || "")) {
        return;
      }

      const requestedAttachmentId = String(detail.attachmentId || "");
      const currentAttachmentId = String(attachment?.id || "");
      if (
        requestedAttachmentId &&
        currentAttachmentId &&
        requestedAttachmentId !== currentAttachmentId
      ) {
        return;
      }

      void handleRequestTranscript();
    };

    window.addEventListener("web:voice-transcript-request", handleExternalTranscriptRequest);
    return () => {
      window.removeEventListener("web:voice-transcript-request", handleExternalTranscriptRequest);
    };
  }, [attachment?.id, handleRequestTranscript, messageId]);

  const transcriptActionLabel = (() => {
    if (transcriptPending) {
      return "Đang chuyển...";
    }
    if (transcriptActionLoading) {
      return "Đang gửi yêu cầu...";
    }
    if (transcriptStatus === "FAILED") {
      return "Thử lại";
    }
    if (transcriptStatus === "COMPLETED" && transcriptText) {
      return "Tạo lại";
    }
    return "Chuyển thành văn bản";
  })();

  const shouldShowTranscriptPanel = Boolean(
    transcriptPending ||
      transcriptActionLoading ||
      transcriptErrorText ||
      (transcriptText && transcriptExpanded)
  );
  const transcriptPanelText =
    transcriptPending || transcriptActionLoading
      ? transcriptActionLabel
      : transcriptErrorText || transcriptText;

  return (
    <div className={`voice-message-wrapper ${isMine ? "voice-message-wrapper--mine" : ""}`}>
    <div className={`voice-message-bubble ${isMine ? "voice-message-bubble--mine" : ""}`}>
      <audio
        className="voice-message-audio"
        ref={audioRef}
        preload="metadata"
        src={attachment?.url || ""}
      />
      <button
        className="voice-message-toggle"
        type="button"
        onClick={handleTogglePlay}
        aria-label={isPlaying ? "Tạm dừng tin nhắn thoại" : "Phát tin nhắn thoại"}
      >
        {isPlaying ? <IoPause /> : <IoPlay />}
      </button>

      <div className="voice-message-main">
        <div
          className="voice-message-progress"
          ref={waveformRef}
          onClick={handleSeek}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              handleSeek(event);
            }
          }}
          aria-label="Thanh thời lượng âm thanh"
        >
          <span
            className="voice-message-progress-fill"
            style={{ width: `${Math.round(progressRatio * 100)}%` }}
          />
        </div>

        <div className="voice-message-meta">
          {errorMessage ? (
            <span className="voice-message-error">
              <IoWarningOutline />
              {errorMessage}
            </span>
          ) : (
            <span className="voice-message-duration">
              {isLoading ? "Đang tải..." : formatDuration(durationMs - currentTimeMs || 0)}
            </span>
          )}
          {attachment?.audioFormat ? (
            <span className="voice-message-format">{String(attachment.audioFormat).toUpperCase()}</span>
          ) : null}
        </div>
      </div>
    </div>
      {shouldShowTranscriptPanel ? (
        <div
          className={`voice-transcript-panel ${
            transcriptErrorText ? "voice-transcript-panel--error" : ""
          }`}
        >
          <p className="voice-transcript-title">
            <IoDocumentTextOutline />
            Văn bản
          </p>
          <p className="voice-transcript-text">{transcriptPanelText}</p>
        </div>
      ) : null}
    </div>
  );
}
