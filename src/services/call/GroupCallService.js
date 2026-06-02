/**
 * GroupCallService (Web) – Tách biệt hoàn toàn với CallService 1-1.
 * Quản lý nhiều luồng Media cho cuộc gọi nhóm (tối đa 9 người) trên trình duyệt.
 * 
 * Sử dụng Mediasoup-client thông qua WebSocket, tương tự như bản Mobile
 * nhưng dùng native WebRTC API của trình duyệt.
 */
class GroupCallService {
  constructor() {
    this._ws = null;
    this._device = null;
    this._sendTransport = null;
    this._recvTransport = null;
    this._localStream = null;
    this._producers = new Map();      // 'audio'/'video' → producer

    // Multi-peer management (khác với 1-1 chỉ có 1 stream)
    this._remoteStreams = new Map();   // peerId → MediaStream
    this._consumers = new Map();      // consumerId → peerId

    this._groupCallId = null;
    this._sfuUrl = null;
    this._roomId = null;
    this._peerId = null;
    this._callType = null;
    this._requestId = 0;
    this._pendingRequests = new Map();

    // Callbacks
    this.onPeersUpdated = null;
    this.onLocalStream = null;
    this.onCallEnded = null;
    this.onActiveSpeaker = null;

    // ICE Restart
    this._reconnectTimer = null;
  }

  getLocalStream() { return this._localStream; }
  getRemoteStreams() { return this._remoteStreams; }

  async joinCall({ groupCallId, sfuUrl, channel, peerId, type, callType, onPeersUpdated, onLocalStream, onCallEnded, onActiveSpeaker }) {
    this._groupCallId = groupCallId;
    this._sfuUrl = sfuUrl;
    this._roomId = channel;
    this._peerId = peerId || `web-group-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
    this._callType = String(type || callType || 'VOICE').toUpperCase();
    this.onPeersUpdated = onPeersUpdated || null;
    this.onLocalStream = onLocalStream || null;
    this.onCallEnded = onCallEnded || null;
    this.onActiveSpeaker = onActiveSpeaker || null;

    await this._connectToSfu();
    return this._localStream;
  }

  async leaveCall() {
    this._cleanup();
    this.onCallEnded?.();
  }

  async _connectToSfu() {
    this._cleanup();
    const { Device } = await import('mediasoup-client');
    
    if (!this._sfuUrl || !this._roomId || !this._peerId) {
      console.error('[GroupCallService Web] Missing connection params');
      return;
    }

    const base = this._sfuUrl.replace(/\/$/, '');
    const protocol = base.startsWith('http') ? base.replace(/^http/, 'ws') : base;
    const wsUrl = `${protocol}/?roomId=${encodeURIComponent(this._roomId)}&peerId=${encodeURIComponent(this._peerId)}`;

    console.log('[GroupCallService Web] Connecting to WS:', wsUrl);
    this._ws = new WebSocket(wsUrl, 'protoo');

    this._ws.onopen = async () => {
      console.log('[GroupCallService Web] WS connected successfully');
      try {
        const data = await this._sendRequest('getRouterRtpCapabilities', {});
        this._device = new Device();
        await this._device.load({ routerRtpCapabilities: data.routerRtpCapabilities });

        // Phải tạo Transport TRƯỚC khi Join để không lỡ newConsumer từ SFU
        await this._createSendTransport();
        await this._createRecvTransport();

        // Join room after loading device
        console.log('[GroupCallService Web] Joining SFU room...');
        const { peers } = await this._sendRequest('join', {
          displayName: `Web-User-${this._peerId?.split('-').pop()}`,
          device: { name: 'Browser', version: '1.0.0' },
          rtpCapabilities: this._device.rtpCapabilities,
          sctpCapabilities: this._device.sctpCapabilities,
        });

        console.log('[GroupCallService Web] Joined SFU room, peers:', peers?.length);
        
        // [FIX] Dùng peerId (trường chuẩn của SerializedPeer), KHÔNG dùng p.id
        if (peers && Array.isArray(peers)) {
          peers.forEach(p => {
            const pId = p.peerId || p.id; // peerId là trường chuẩn từ Server
            if (pId) {
              if (!this._remoteStreams.has(pId)) {
                this._remoteStreams.set(pId, new MediaStream());
              }
            }
          });
          this._notifyPeersUpdated();
        }

        await this._produceMedia();
        console.log('[GroupCallService Web] initialization complete');
      } catch (err) {
        console.error('[GroupCallService Web] SFU initialization failed:', err);
      }
    };

    this._ws.onmessage = (e) => this._handleMessage(JSON.parse(e.data));
    this._ws.onclose = () => console.log('[GroupCallService Web] WS closed');
    this._ws.onerror = (err) => console.warn('[GroupCallService Web] WS error:', err);
  }

  async _createSendTransport() {
    const response = await this._sendRequest('createWebRtcTransport', {
      forceTcp: false, producing: true, consuming: false,
      appData: { direction: 'producer' }
    });
    const transportInfo = { ...response, id: response.transportId };
    this._sendTransport = this._device.createSendTransport(transportInfo);

    this._sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
      this._sendRequest('connectWebRtcTransport', { transportId: this._sendTransport.id, dtlsParameters })
        .then(callback).catch(errback);
    });
    this._sendTransport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
      try {
        const { producerId } = await this._sendRequest('produce', {
          transportId: this._sendTransport.id, kind, rtpParameters, appData: { ...appData, source: kind },
        });
        callback({ id: producerId });
      } catch (e) { errback(e); }
    });
    this._sendTransport.on('connectionstatechange', (state) => {
      if (state === 'disconnected' || state === 'failed') this._scheduleReconnect('send');
    });
  }

  async _createRecvTransport() {
    const response = await this._sendRequest('createWebRtcTransport', {
      forceTcp: false, producing: false, consuming: true,
      appData: { direction: 'consumer' }
    });
    const transportInfo = { ...response, id: response.transportId };
    this._recvTransport = this._device.createRecvTransport(transportInfo);

    this._recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
      this._sendRequest('connectWebRtcTransport', { transportId: this._recvTransport.id, dtlsParameters })
        .then(callback).catch(errback);
    });
    this._recvTransport.on('connectionstatechange', (state) => {
      if (state === 'disconnected' || state === 'failed') this._scheduleReconnect('recv');
    });
  }

  async _produceMedia() {
    const constraints = {
      audio: true,
      video: this._callType === 'VIDEO' ? { width: 1280, height: 720 } : false,
    };
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this._localStream = stream;
      this.onLocalStream?.(stream);

      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        const audioProducer = await this._sendTransport.produce({ 
          track: audioTrack,
          appData: { source: 'audio' }
        });
        this._producers.set('audio', audioProducer);
      }
      if (this._callType === 'VIDEO') {
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          const videoProducer = await this._sendTransport.produce({ 
            track: videoTrack,
            appData: { source: 'video' }
          });
          this._producers.set('video', videoProducer);
        }
      }
    } catch (err) {
      console.error('[GroupCallService Web] getUserMedia error:', err);
    }
  }

  _handleMessage(msg) {
    if (msg.request) {
      if (msg.method === 'newConsumer') {
        this._consumePeer(msg.data)
          .then(() => {
            this._ws?.send(JSON.stringify({ response: true, id: msg.id, ok: true, data: {} }));
          })
          .catch(err => {
            this._ws?.send(JSON.stringify({ response: true, id: msg.id, ok: false, errorReason: err.message }));
          });
      } else {
        // Respond OK to other requests (e.g. newDataConsumer) to avoid protoo timeout
        this._ws?.send(JSON.stringify({ response: true, id: msg.id, ok: true, data: {} }));
      }
      return;
    }
    if (msg.response) {
      const pending = this._pendingRequests.get(msg.id);
      if (pending) {
        msg.ok ? pending.resolve(msg.data) : pending.reject(new Error(msg.errorReason));
        this._pendingRequests.delete(msg.id);
      }
      return;
    }
    if (msg.notification) this._handleNotification(msg.method, msg.data);
  }

  async _handleNotification(method, data) {
    switch (method) {
      case 'newPeer': {
        // [FIX] Dùng peerId (trường chuẩn), fallback sang id nếu có
        const pId = data.peer?.peerId || data.peer?.id;
        if (pId) {
          console.log('[GroupCallService Web] New peer joined:', pId);
          if (!this._remoteStreams.has(pId)) {
            this._remoteStreams.set(pId, new MediaStream());
          }
          this._notifyPeersUpdated();
        }
        break;
      }
      case 'peerClosed': {
        const pId = data.peerId;
        console.log('[GroupCallService Web] Peer left:', pId);
        if (pId) {
          this._remoteStreams.delete(pId);
          this._notifyPeersUpdated();
        }
        break;
      }
      case 'activeSpeaker':
        this.onActiveSpeaker?.(data.peerId || null);
        break;
    }
  }

  // [FIX] Đơn giản hóa: gửi tất cả stream thật (chỉ lọc bỏ key undefined/null)
  _notifyPeersUpdated() {
    if (!this.onPeersUpdated) return;
    const validStreams = new Map();
    for (const [pId, stream] of this._remoteStreams) {
      if (pId) { // Chỉ lọc bỏ undefined/null/empty, KHÔNG dùng _knownPeers
        validStreams.set(pId, stream);
      }
    }
    this.onPeersUpdated(validStreams);
  }

  async _consumePeer(data) {
    const { peerId, id, consumerId, kind, rtpParameters, producerId, appData } = data;
    
    // [FIX] Bỏ qua nếu peerId undefined (ví dụ Bot DataConsumer)
    if (!peerId) {
      console.warn('[GroupCallService Web] Skipping consume for undefined peerId');
      return;
    }
    
    const finalConsumerId = consumerId || id;
    const finalProducerId = producerId || id;
    
    try {
      const consumer = await this._recvTransport.consume({ 
        id: finalConsumerId, 
        producerId: finalProducerId, 
        kind, 
        rtpParameters,
        appData
      });
      if (consumer.track) {
        consumer.track.enabled = true;
      }
      this._consumers.set(finalConsumerId, peerId);
      let peerStream = this._remoteStreams.get(peerId);
      
      if (!peerStream) {
        peerStream = new MediaStream([consumer.track]);
      } else {
        peerStream.addTrack(consumer.track);
        // Tạo mới đối tượng MediaStream để React nhận ra thay đổi
        peerStream = new MediaStream(peerStream.getTracks());
      }
      
      this._remoteStreams.set(peerId, peerStream);
      this._notifyPeersUpdated();

      try {
        await this._sendRequest('resumeConsumer', { consumerId: finalConsumerId });
        console.log('[GroupCallService Web] Consumer resumed:', {
          consumerId: finalConsumerId,
          kind,
          peerId,
        });
      } catch (resumeError) {
        console.error('[GroupCallService Web] Failed to resume consumer:', {
          consumerId: finalConsumerId,
          kind,
          peerId,
          error: resumeError,
        });
      }
    } catch (err) {
      console.error('[GroupCallService Web] _consumePeer error:', err);
    }
  }

  // Network Resilience: ICE Restart
  _scheduleReconnect(transportType) {
    if (this._reconnectTimer) return;
    console.warn(`[GroupCallService Web] ${transportType} transport lost, restarting ICE in 30s...`);
    this._reconnectTimer = setTimeout(async () => {
      try {
        if (transportType === 'send' && this._sendTransport) {
          const iceParameters = await this._sendRequest('restartIce', { transportId: this._sendTransport.id });
          await this._sendTransport.restartIce({ iceParameters });
        }
        if (transportType === 'recv' && this._recvTransport) {
          const iceParameters = await this._sendRequest('restartIce', { transportId: this._recvTransport.id });
          await this._recvTransport.restartIce({ iceParameters });
        }
        console.log('[GroupCallService Web] ICE restart OK');
      } catch (err) {
        console.error('[GroupCallService Web] ICE restart failed:', err);
        this.leaveCall();
      } finally {
        this._reconnectTimer = null;
      }
    }, 30000);
  }

  setMicEnabled(enabled) {
    const producer = this._producers.get('audio');
    if (!producer) return;
    enabled ? producer.resume() : producer.pause();
  }

  setCameraEnabled(enabled) {
    const producer = this._producers.get('video');
    if (!producer) return;
    enabled ? producer.resume() : producer.pause();
  }

  toggleMic(enabled) { this.setMicEnabled(enabled); }
  toggleCamera(enabled) { this.setCameraEnabled(enabled); }

  _sendRequest(method, data) {
    return new Promise((resolve, reject) => {
      const id = ++this._requestId;
      this._pendingRequests.set(id, { resolve, reject });
      this._ws?.send(JSON.stringify({ request: true, id, method, data }));
      setTimeout(() => {
        if (this._pendingRequests.has(id)) {
          this._pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 15000);
    });
  }

  _cleanup() {
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
    this._producers.forEach(p => { try { p.close(); } catch (_) {} });
    this._producers.clear();
    this._sendTransport?.close();
    this._recvTransport?.close();
    this._ws?.close();
    this._localStream?.getTracks().forEach(t => t.stop());
    this._remoteStreams.clear();
    this._consumers.clear();
    this._localStream = null;
    this._sendTransport = null;
    this._recvTransport = null;
    this._ws = null;
    this._device = null;
    this._groupCallId = null;
    console.log('[GroupCallService Web] Cleanup complete');
  }
}

const groupCallService = new GroupCallService();
export default groupCallService;
