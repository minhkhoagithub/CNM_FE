import React, { useEffect, useRef } from 'react';
import { BsTelephoneFill, BsCameraVideoFill, BsPersonFill } from 'react-icons/bs';
import { MdCallEnd } from 'react-icons/md';
import './CallRoom.css';

/**
 * OutgoingCallModal – hiển thị khi người dùng vừa nhấn gọi, đang chờ bên kia nhấc máy
 */
function OutgoingCallModal({ calleeName, calleeAvatar, callType, onCancel }) {
  const dotRef = useRef(null);

  return (
    <div className="call-modal-overlay">
      <div className="call-modal-card ringing-card">
        <p className="call-modal-label">
          {callType === 'VIDEO' ? <BsCameraVideoFill /> : <BsTelephoneFill />}
          <span className="label-text">
            {callType === 'VIDEO' ? ' Đang gọi video...' : ' Đang gọi thoại...'}
          </span>
        </p>

        <div className="call-modal-avatar-wrap">
          <div className="call-modal-avatar call-modal-avatar--placeholder">
            {calleeAvatar ? <img src={calleeAvatar} alt={calleeName} /> : <BsPersonFill />}
          </div>
          <div className="pulse-ring"></div>
          <div className="pulse-ring pulse-ring--delay"></div>
        </div>

        <h2 className="call-modal-name">{calleeName || 'Đang kết nối...'}</h2>
        <p className="call-modal-status">Đang đổ chuông...</p>

        <div className="call-modal-actions">
          <button className="call-btn btn-danger btn-circle" onClick={onCancel} title="Huỷ">
            <MdCallEnd size={32} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default OutgoingCallModal;
