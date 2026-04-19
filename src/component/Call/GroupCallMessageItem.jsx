import React, { useEffect, useState } from 'react';
import { BsCameraVideoFill, BsTelephoneFill, BsTelephoneXFill } from 'react-icons/bs';
import { getGroupCallStatusApi, joinGroupCallApi } from '../../services/call/groupCallApi';
import './GroupCallMessageItem.css';

/**
 * GroupCallMessageItem (Web) – Bong bóng tin nhắn cuộc gọi nhóm trong chat.
 * Hiển thị nút "Tham gia" nếu cuộc gọi đang diễn ra.
 * 
 * Props:
 *   - groupCallId: string
 *   - callType: 'VIDEO' | 'VOICE'
 *   - initiatorName: string
 *   - conversationId: string
 *   - onJoin: function(groupCallInfo) – callback khi người dùng bấm Join
 */
function GroupCallMessageItem({ groupCallId, callType, initiatorName, conversationId, onJoin }) {
  const [status, setStatus] = useState('LOADING');
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const checkStatus = async () => {
      if (!groupCallId || groupCallId === 'undefined') {
        setStatus('ENDED');
        return;
      }
      try {
        const result = await getGroupCallStatusApi(groupCallId);
        if (!cancelled) setStatus(result.status);
      } catch {
        if (!cancelled) setStatus('ENDED');
      }
    };
    checkStatus();
    return () => { cancelled = true; };
  }, [groupCallId]);

  const handleJoin = async () => {
    if (isJoining) return;
    setIsJoining(true);
    try {
      // Kiểm tra lại trạng thái trước khi cho vào (Late-join check)
      const result = await getGroupCallStatusApi(groupCallId);
      if (result.status === 'ENDED') {
        setStatus('ENDED');
        return;
      }
      await joinGroupCallApi(groupCallId);
      // Gọi callback để Zalo.jsx mở màn hình Group Call
      onJoin?.({ ...result, groupCallId });
    } catch (err) {
      console.error('[GroupCallMessageItem Web] Join error:', err);
    } finally {
      setIsJoining(false);
    }
  };

  const isOngoing = status === 'RINGING' || status === 'ONGOING';
  const CallIcon = callType === 'VIDEO' ? BsCameraVideoFill : BsTelephoneFill;

  return (
    <div className={`group-call-msg ${isOngoing ? 'group-call-msg--ongoing' : 'group-call-msg--ended'}`}>
      <div className="group-call-msg__icon-row">
        <div className={`group-call-msg__icon-circle ${isOngoing ? 'active' : 'ended'}`}>
          {status === 'ENDED' ? <BsTelephoneXFill size={18} /> : <CallIcon size={18} />}
        </div>
        <div className="group-call-msg__text">
          <p className="group-call-msg__title">
            {callType === 'VIDEO' ? 'Cuộc gọi video nhóm' : 'Cuộc gọi thoại nhóm'}
          </p>
          <p className="group-call-msg__subtitle">
            {initiatorName} đã bắt đầu &bull;{' '}
            {status === 'LOADING' && 'Đang kiểm tra...'}
            {status === 'RINGING' && '⏳ Đang chờ...'}
            {status === 'ONGOING' && '🟢 Đang diễn ra'}
            {status === 'ENDED' && '🔴 Đã kết thúc'}
          </p>
        </div>
      </div>

      {isOngoing && (
        <button
          className={`group-call-msg__join-btn ${isJoining ? 'loading' : ''}`}
          onClick={handleJoin}
          disabled={isJoining}
        >
          <CallIcon size={13} />
          <span>{isJoining ? 'Đang vào...' : 'Tham gia'}</span>
        </button>
      )}
    </div>
  );
}

export default GroupCallMessageItem;
