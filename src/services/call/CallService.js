import * as mediasoupClient from 'mediasoup-client';
import { Device } from 'mediasoup-client';
import { initiateCallApi, acceptCallApi, rejectCallApi, endCallApi, sendCallActionApi } from './callApi';

console.log('[MediaService] Core file loaded v1.1 - 2026-04-14');

// SFU signaling path format used by mediasoup-demo server
// ws://{host}:{port}/?roomId={roomId}&peerId={peerId}

class CallService {
  constructor() {
    this._device = null;
    this._protooTransport = null;
    this._sendTransport = null;
    this._recvTransport = null;
    this._localStream = null;
    this._producers = new Map(); // kind -> producer
    this._consumers = new Map(); // consumerId -> consumer
    this._activeCallId = null;
    this._sfuUrl = null;
    this._roomId = null;
    this._peerId = null;
    this._ws = null;           // raw WebSocket (protoo protocol)
    this._requestId = 0;
    this._pendingRequests = new Map(); // id -> { resolve, reject }
    this._onRemoteStream = null; // callback(stream)
    this._onLocalStream = null;  // callback(stream)
    this._onCallEnded = null;    // callback()
    this._onStateChange = null;  // callback(state: 'ringing'|'connected'|'ended')
    this._onRemoteVideoToggle = null; // callback(enabled)
  }

  // ─── Public API ───────────────────────────────────────────────

  /**
   * Người A khởi tạo cuộc gọi đến B
   */
  async startCall({ calleeId, type, peerId, onRemoteStream, onLocalStream, onCallEnded, onStateChange, onRemoteVideoToggle }) {
    console.log('[CallService] startCall request:', { calleeId, type, peerId });
    this._onRemoteStream = onRemoteStream;
    this._onLocalStream = onLocalStream;
    this._onCallEnded = onCallEnded;
    this._onStateChange = onStateChange;
    this._onRemoteVideoToggle = onRemoteVideoToggle;
    this._callType = (type || 'VIDEO').toUpperCase(); // Chuẩn hóa thành VIDEO/VOICE

    // Reset state cũ
    this._producers.clear();
    this._consumers.clear();
    this._activeCallId = null;

    // [v22] Thêm khoảng nghỉ để SFU dọn dẹp tài nguyên cũ
    await new Promise(r => setTimeout(r, 500));

    // 1. Gọi backend → nhận callId, channel (roomId), sfuUrl
    const { callId, channel, sfuUrl } = await initiateCallApi(calleeId, type);
    this._activeCallId = callId;
    this._sfuUrl = sfuUrl;
    this._roomId = channel;
    // [v22] PeerId siêu duy nhất để tránh xung đột trên SFU
    this._peerId = peerId || `web-caller-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    onStateChange?.('ringing');

    // 2. Kết nối vào SFU room
    await this._joinRoom({ videoEnabled: type === 'VIDEO' });
    // Bỏ dòng onStateChange?.('connected') để người gọi không tự nhảy vào màn hình Connected trước khi người nhận OK
    return callId;
  }

  /**
   * Người B chấp nhận cuộc gọi đến
   */
  async acceptCall({ callId, sfuUrl, channel, peerId, onRemoteStream, onLocalStream, onCallEnded, onStateChange, onRemoteVideoToggle, type }) {
    // [v22] Thêm khoảng nghỉ để SFU dọn dẹp tài nguyên cũ
    await new Promise(r => setTimeout(r, 500));

    this._onRemoteStream = onRemoteStream;
    this._onLocalStream = onLocalStream;
    this._onCallEnded = onCallEnded;
    this._onStateChange = onStateChange;
    this._onRemoteVideoToggle = onRemoteVideoToggle;
    this._activeCallId = callId;
    this._sfuUrl = sfuUrl;
    this._roomId = channel;
    // [v22] PeerId siêu duy nhất
    this._peerId = peerId || `web-callee-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    this._callType = (type || 'VIDEO').toUpperCase();

    // Reset state cũ
    this._producers.clear();
    this._consumers.clear();

    // 1. Báo backend accept
    await acceptCallApi(callId);

    // 2. Join vào SFU room
    await this._joinRoom({ videoEnabled: type === 'VIDEO' });
    onStateChange?.('connected');
  }

  /**
   * Từ chối cuộc gọi
   */
  async rejectCall(callId) {
    try {
      await rejectCallApi(callId);
    } catch (e) {
      console.warn('[CallService] rejectCall error:', e);
    }
  }

  /**
   * Kết thúc cuộc gọi đang diễn ra
   */
  async endCall() {
    const callId = this._activeCallId;
    this._cleanup();
    if (callId) {
      try {
        await endCallApi(callId);
      } catch (e) {
        console.warn('[CallService] endCall error:', e);
      }
    }
    this._onCallEnded?.();
    this._onStateChange?.('ended');
  }

  /**
   * Lấy local MediaStream
   */
  getLocalStream() {
    return this._localStream;
  }

  /**
   * Tắt/bật mic
   */
  async setMicEnabled(enabled) {
    const producer = this._producers.get('audio');
    if (!producer) {
      console.warn('[CallService] No audio producer found to toggle');
      return;
    }

    try {
      if (enabled) {
        console.log('[CallService] Mic Resume - activeCallId:', this._activeCallId);
        await producer.resume();
        if (this._activeCallId) sendCallActionApi(this._activeCallId, 'AUDIO_ON').catch(e => console.error('[CallService] AUDIO_ON error:', e));
      } else {
        console.log('[CallService] Mic Pause - activeCallId:', this._activeCallId);
        await producer.pause();
        if (this._activeCallId) sendCallActionApi(this._activeCallId, 'AUDIO_OFF').catch(e => console.error('[CallService] AUDIO_OFF error:', e));
      }
    } catch (err) {
      console.error('[CallService] Toggle Mic error:', err);
    }
  }

  /**
   * Tắt/bật camera
   */
  async setCameraEnabled(enabled) {
    const producer = this._producers.get('video');
    if (!producer) {
      console.warn('[CallService] No video producer found to toggle');
      return;
    }

    try {
      if (enabled) {
        console.log('[CallService] Cam Resume - activeCallId:', this._activeCallId);
        await producer.resume();
        if (this._activeCallId) sendCallActionApi(this._activeCallId, 'VIDEO_ON').catch(e => console.error('[CallService] VIDEO_ON error:', e));
      } else {
        console.log('[CallService] 📤 Signaling Cam Pause for call:', this._activeCallId);
        await producer.pause();
        if (this._activeCallId) {
          sendCallActionApi(this._activeCallId, 'VIDEO_OFF')
            .then(() => console.log('[CallService] 📤 Signaling Cam Pause SUCCESS'))
            .catch(e => console.error('[CallService] ❌ Signaling Cam Pause FAILED:', e));
        } else {
          console.warn('[CallService] ⚠️ No activeCallId found, cannot signal cam pause!');
        }
      }
    } catch (err) {
      console.error('[CallService] Toggle Cam error:', err);
    }
  }

  // ─── Private: SFU / mediasoup ────────────────────────────────

  async _joinRoom({ videoEnabled }) {
    console.log('[CallService] _joinRoom starting... videoEnabled:', videoEnabled);
    // Lấy local media
    const constraints = {
      audio: true,
      video: videoEnabled ? { width: 640, height: 480 } : false,
    };
    console.log('[CallService] Requesting getUserMedia...', constraints);
    const stream = await navigator.mediaDevices.getUserMedia(constraints).catch(() => null);

    if (stream) {
      console.log('[CallService] Local stream captured');
      this._localStream = stream;

      // QUAN TRỌNG: Phát lại cho UI để cập nhật state sau khi join
      if (this._onLocalStream) {
        console.log('[CallService] Signaling onLocalStream to UI...');
        this._onLocalStream(this._localStream);
      }
    }

    // Kết nối WebSocket protoo đến SFU
    console.log('[CallService] Connecting to protoo WS...');
    await this._connectProtoo();

    // Lấy RTP capabilities của SFU router
    console.log('[CallService] Fetching router capabilities...');
    const { routerRtpCapabilities } = await this._sendRequest('getRouterRtpCapabilities');

    // Tạo (1 lần) và load mediasoup device
    if (!this._device) {
      console.log('[CallService] Creating singleton Mediasoup Device...');
      this._device = new Device();
    }

    if (!this._device.loaded) {
      console.log('[CallService] Loading capabilities into Device...');
      await this._device.load({ routerRtpCapabilities });
    } else {
      console.log('[CallService] Device already loaded, reusing...');
    }

    // 3. Tạo Sẵn Transport (Quan trọng: Phải làm TRƯỚC khi Join để không lỡ nhịp video tín hiệu từ server)
    console.log('[CallService] Pre-creating transports...');
    await this._createSendTransport();
    await this._createRecvTransport();

    // 4. Tham gia phòng (Join) để SFU biết capabilities của client
    console.log('[CallService] Joining room...');
    await this._sendRequest('join', {
      displayName: this._peerId,
      device: { name: 'Web', version: '1.0' },
      rtpCapabilities: this._device.rtpCapabilities,
      sctpCapabilities: this._device.sctpCapabilities,
    });

    // Gửi stream local lên SFU (produce)
    if (this._localStream) {
      await this._produceStream(videoEnabled);
    }
  }

  async _connectProtoo() {
    return new Promise((resolve, reject) => {
      // mediasoup-demo server dùng protoo WebSocket protocol
      // URL format: ws://host:port/?roomId=XXX&peerId=YYY
      const url = this._buildProtooUrl();
      this._ws = new WebSocket(url, 'protoo');

      this._ws.addEventListener('open', () => {
        console.log('[CallService] Protoo WS connected');
        resolve();
      });

      this._ws.addEventListener('error', (err) => {
        console.error('[CallService] Protoo WS error:', err);
        reject(err);
      });

      this._ws.addEventListener('close', () => {
        console.log('[CallService] Protoo WS closed');
        this._cleanup();
        this._onCallEnded?.();
        this._onStateChange?.('ended');
      });

      this._ws.addEventListener('message', (event) => {
        this._handleProtooMessage(JSON.parse(event.data));
      });
    });
  }

  _buildProtooUrl() {
    // sfuUrl is something like "ws://localhost:4443"
    // mediasoup-demo expects: ws://host:port/?roomId=...&peerId=...
    const base = this._sfuUrl.replace(/\/$/, '');
    return `${base}/?roomId=${encodeURIComponent(this._roomId)}&peerId=${encodeURIComponent(this._peerId)}`;
  }

  _handleProtooMessage(message) {
    // Protoo server sends { request, response, notification }
    if (message.response) {
      const pending = this._pendingRequests.get(message.id);
      if (!pending) return;
      this._pendingRequests.delete(message.id);
      if (message.ok) {
        pending.resolve(message.data);
      } else {
        pending.reject(new Error(message.errorReason || 'protoo error'));
      }
      return;
    }

    // Handle server notifications
    if (message.notification) {
      const { method, data } = message;
      if (method === 'consumerPaused') {
        const consumer = this._consumers.get(data.consumerId);
        console.log('[CallService] <--- NOTIFICATION: consumerPaused', data.consumerId, consumer?.kind);
        if (consumer && consumer.kind === 'video') {
          console.log('[CallService] Remote video PAUSED (Switching to Avatar)');
          this._onRemoteVideoToggle?.(false);
        }
      } else if (method === 'consumerResumed') {
        const consumer = this._consumers.get(data.consumerId);
        console.log('[CallService] <--- NOTIFICATION: consumerResumed', data.consumerId, consumer?.kind);
        if (consumer && consumer.kind === 'video') {
          console.log('[CallService] Remote video RESUMED (Switching to Video)');
          this._onRemoteVideoToggle?.(true);
        }
      }
    }

    // Handle server requests (quan trọng: newConsumer là request)
    if (message.request && message.method === 'newConsumer') {
      this._handleNewConsumer(message.data)
        .then(() => {
          this._ws.send(JSON.stringify({ response: true, id: message.id, ok: true, data: {} }));
        })
        .catch(err => {
          this._ws.send(JSON.stringify({ response: true, id: message.id, ok: false, errorReason: err.message }));
        });
    }
  }

  _sendRequest(method, data = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this._requestId;
      const request = {
        request: true,
        id,
        method,
        data,
      };
      this._pendingRequests.set(id, { resolve, reject });
      this._ws.send(JSON.stringify(request));
    });
  }

  async _createSendTransport() {
    const transportInfo = await this._sendRequest('createWebRtcTransport', {
      forceTcp: false,
      sctpCapabilities: this._device.sctpCapabilities,
      appData: { direction: 'producer' },
    });

    // Map transportId to id for mediasoup-client
    const transportParams = {
      id: transportInfo.transportId,
      ...transportInfo
    };

    this._sendTransport = this._device.createSendTransport(transportParams);

    this._sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
      this._sendRequest('connectWebRtcTransport', {
        transportId: this._sendTransport.id,
        dtlsParameters,
      })
        .then(callback)
        .catch(errback);
    });

    this._sendTransport.on('connectionstatechange', (state) => {
      console.log('[CallService] Send transport connection state:', state);
    });

    this._sendTransport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
      try {
        const { producerId } = await this._sendRequest('produce', {
          transportId: this._sendTransport.id,
          kind,
          rtpParameters,
          appData: { ...appData, source: kind }, // Đảm bảo có source (audio/video) cho server
        });
        callback({ id: producerId });
      } catch (e) {
        errback(e);
      }
    });
  }

  async _createRecvTransport() {
    const transportInfo = await this._sendRequest('createWebRtcTransport', {
      forceTcp: false,
      sctpCapabilities: this._device.sctpCapabilities,
      appData: { direction: 'consumer' },
    });

    // Map transportId to id for mediasoup-client
    const transportParams = {
      id: transportInfo.transportId,
      ...transportInfo
    };

    this._recvTransport = this._device.createRecvTransport(transportParams);

    this._recvTransport.on('connectionstatechange', (state) => {
      console.log('[CallService] Receive transport connection state:', state);
    });

    this._recvTransport.on('connectionstatechange', (state) => {
      console.log('[CallService] Receive transport connection state:', state);
    });

    this._recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
      this._sendRequest('connectWebRtcTransport', {
        transportId: this._recvTransport.id,
        dtlsParameters,
      })
        .then(callback)
        .catch(errback);
    });
  }

  async _produceStream(videoEnabled) {
    console.log('[CallService] _produceStream starting... videoEnabled:', videoEnabled);
    const audioTrack = this._localStream?.getAudioTracks()[0];
    if (audioTrack) {
      console.log(`[CallService] Producing audio... State: ${audioTrack.readyState}`);
      const audioProducer = await this._sendTransport.produce({ track: audioTrack });
      this._producers.set('audio', audioProducer);
      console.log('[CallService] Audio producer created:', audioProducer.id);
    }

    if (videoEnabled) {
      const videoTrack = this._localStream?.getVideoTracks()[0];
      if (videoTrack) {
        console.log(`[CallService] Producing video... State: ${videoTrack.readyState}`);
        const videoProducer = await this._sendTransport.produce({
          track: videoTrack,
          encodings: [
            { maxBitrate: 100000 },
            { maxBitrate: 300000 },
            { maxBitrate: 900000 },
          ],
          codecOptions: { videoGoogleStartBitrate: 1000 },
        });
        this._producers.set('video', videoProducer);
        console.log('[CallService] Video producer created ID:', videoProducer.id);
      }
    }
  }

  async _handleNewConsumer({ consumerId, producerId, kind, rtpParameters, appData }) {
    console.log('[CallService] _handleNewConsumer received:', { consumerId, kind, producerId });

    // TRÁNH RACE CONDITION: Đợi RecvTransport sẵn sàng
    let retryCount = 0;
    while (!this._recvTransport && retryCount < 10) {
      console.log(`[CallService] RecvTransport not ready (Attempt ${retryCount + 1}/10), waiting 500ms...`);
      await new Promise(res => setTimeout(res, 500));
      retryCount++;
    }

    if (!this._recvTransport) {
      console.error('[CallService] RecvTransport initialization TIMEOUT! Cannot consume.');
      return;
    }

    const consumer = await this._recvTransport.consume({
      id: consumerId,
      producerId,
      kind,
      rtpParameters,
      appData,
    });

    this._consumers.set(consumerId, consumer);

    // Kích hoạt ngay lập tức trên Server (SỬ DỤNG REQUEST ĐỂ ĐẢM BẢO SERVER NHẬN ĐƯỢC)
    console.log('[CallService] 📤 Resuming consumer:', consumerId);
    try {
      await this._sendRequest('resumeConsumer', { consumerId });
      console.log('[CallService] ✅ Consumer resumed successfully:', consumerId);
    } catch (err) {
      console.error('[CallService] ❌ Failed to resume consumer:', err);
    }

    // Web: track.enabled mặc định là true, nhưng ta ép lại lần nữa
    if (consumer.track) consumer.track.enabled = true;

    if (!this._remoteStream) {
      this._remoteStream = new MediaStream();
    }
    this._remoteStream.addTrack(consumer.track);

    // QUAN TRỌNG: Tạo reference mới để React nhận diện thay đổi
    const newStream = new MediaStream(this._remoteStream.getTracks());
    this._onRemoteStream?.(newStream, Date.now());

    // [v24] Bắt đầu theo dõi lưu lượng trên Web
    const statsInterval = setInterval(async () => {
      if (!this._recvTransport || !this._ws) { clearInterval(statsInterval); return; }
      try {
        const stats = await this._recvTransport.getStats();
        stats.forEach((report) => {
          if (report.type === 'inbound-rtp') {
            if (report.kind === 'audio') {
              // console.log(`[CallService] Web Audio Stats - Bytes Received: ${report.bytesReceived}`);
            } else if (report.kind === 'video') {
              console.log(`[CallService] Web Video Stats - Bytes Received: ${report.bytesReceived}`);
            }
          }
        });
      } catch (e) { }
    }, 2000);
  }

  _cleanup() {
    // Dừng tất cả producer
    for (const producer of this._producers.values()) {
      try { producer.close(); } catch (_) { /* noop */ }
    }
    this._producers.clear();

    // Dừng tất cả consumer
    for (const consumer of this._consumers.values()) {
      try { consumer.close(); } catch (_) { /* noop */ }
    }
    this._consumers.clear();

    // Đóng transport
    try { this._sendTransport?.close(); } catch (_) { /* noop */ }
    try { this._recvTransport?.close(); } catch (_) { /* noop */ }
    this._sendTransport = null;
    this._recvTransport = null;

    // Dừng local stream
    if (this._localStream) {
      this._localStream.getTracks().forEach((t) => {
        t.enabled = false;
        t.stop();
      });
      this._localStream = null;
    }

    // Reset remote stream
    if (this._remoteStream) {
      this._remoteStream.getTracks().forEach(track => {
        track.enabled = false;
        track.stop();
      });
      this._remoteStream = null;
    }

    // Đóng WS
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.close();
    }
    this._ws = null;

    this._activeCallId = null;
  }
}

// Singleton
export default new CallService();
