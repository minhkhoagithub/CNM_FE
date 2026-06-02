import React from 'react';
import { BsTelephoneFill, BsCameraVideoFill, BsPersonFill } from 'react-icons/bs';
import { MdCallEnd, MdCall } from 'react-icons/md';
import './CallRoom.css';

/**
 * IncomingCallModal – hiển thị khi nhận được thông báo cuộc gọi đến (qua STOMP)
 */
function IncomingCallModal({ callerName, callerAvatar, callType, onAccept, onReject, isAccepting = false }) {
  return (
    <div className="call-modal-overlay">
      <div className="call-modal-card ringing-card">
        <p className="call-modal-label">
          {callType === 'VIDEO' ? <BsCameraVideoFill /> : <BsTelephoneFill />}
          <span className="label-text">
            {callType === 'VIDEO' ? ' Cuộc gọi video đến' : ' Cuộc gọi thoại đến'}
          </span>
        </p>

        <div className="call-modal-avatar-wrap">
          <div className="call-modal-avatar call-modal-avatar--placeholder">
            {callerAvatar ? <img src={callerAvatar} alt={callerName} /> : <BsPersonFill />}
          </div>
          <div className="pulse-ring"></div>
          <div className="pulse-ring pulse-ring--delay"></div>
        </div>

        <h2 className="call-modal-name">{callerName || 'Ai đó'}</h2>
        <p className="call-modal-status">đang gọi cho bạn...</p>

        <div className="call-modal-actions">
          <button className="call-btn btn-danger btn-circle" onClick={onReject} disabled={isAccepting} title="Từ chối">
            <MdCallEnd size={32} />
          </button>
          <button className="call-btn btn-success btn-circle" onClick={onAccept} disabled={isAccepting} title="Chấp nhận">
            <MdCall size={32} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default IncomingCallModal;
