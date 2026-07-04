// WebRTC networking via PeerJS (public broker) — works on static hosting.
// Star topology: the host relays traffic between all clients.
/* global Peer */
import { iceServers } from './rtcconfig.js';

const PREFIX = 'longshot-v1-';

// PeerJS options shared by host and client, including STUN + TURN relay.
// Async because Metered TURN credentials are fetched at connect time.
async function peerOpts() {
  return { debug: 1, config: { iceServers: await iceServers() } };
}

export function makeRoomCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export class Net {
  constructor() {
    this.peer = null;
    this.isHost = false;
    this.conns = new Map();  // peerJsId -> DataConnection (host only)
    this.hostConn = null;    // client only
    this.onData = () => { };        // (msg, fromPeerJsId)
    this.onPeerConnect = () => { }; // host: (peerJsId)
    this.onPeerDisconnect = () => { }; // host: (peerJsId)
    this.onDisconnected = () => { };   // client: lost the host
    this.destroyed = false;
  }

  async hostGame(code) {
    const opts = await peerOpts();
    return new Promise((resolve, reject) => {
      this.isHost = true;
      const peer = new Peer(PREFIX + code, opts);
      this.peer = peer;
      let settled = false;
      peer.on('open', () => { settled = true; resolve(code); });
      peer.on('error', (err) => {
        if (!settled) {
          settled = true;
          reject(new Error(err.type === 'unavailable-id'
            ? 'Room code already in use — try hosting again.'
            : 'Could not reach the matchmaking server (' + err.type + ').'));
        } else console.warn('[net]', err.type);
      });
      peer.on('connection', (conn) => {
        conn.on('open', () => {
          this.conns.set(conn.peer, conn);
          this.onPeerConnect(conn.peer);
        });
        conn.on('data', (d) => this.onData(d, conn.peer));
        const drop = () => {
          if (this.conns.delete(conn.peer)) this.onPeerDisconnect(conn.peer);
        };
        conn.on('close', drop);
        conn.on('error', drop);
      });
    });
  }

  async joinGame(code) {
    const opts = await peerOpts();
    return new Promise((resolve, reject) => {
      this.isHost = false;
      const peer = new Peer(opts);
      this.peer = peer;
      let settled = false;
      const fail = (msg) => { if (!settled) { settled = true; reject(new Error(msg)); } };
      peer.on('error', (err) => {
        if (err.type === 'peer-unavailable') fail('Room "' + code + '" not found.');
        else fail('Connection error (' + err.type + ').');
      });
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + code, { reliable: true });
        this.hostConn = conn;
        const timer = setTimeout(() => fail('Connection to host timed out.'), 12000);
        conn.on('open', () => {
          clearTimeout(timer);
          settled = true;
          resolve();
        });
        conn.on('data', (d) => this.onData(d, conn.peer));
        conn.on('close', () => { if (settled && !this.destroyed) this.onDisconnected(); });
        conn.on('error', () => { if (settled && !this.destroyed) this.onDisconnected(); });
      });
    });
  }

  // client -> host, or host -> everyone
  send(msg) {
    if (this.isHost) {
      for (const c of this.conns.values()) if (c.open) c.send(msg);
    } else if (this.hostConn && this.hostConn.open) {
      this.hostConn.send(msg);
    }
  }

  sendTo(peerJsId, msg) {
    const c = this.conns.get(peerJsId);
    if (c && c.open) c.send(msg);
  }

  // host: forward a client's message to all other clients
  relay(msg, exceptPeerJsId) {
    for (const [id, c] of this.conns) {
      if (id !== exceptPeerJsId && c.open) c.send(msg);
    }
  }

  destroy() {
    this.destroyed = true;
    try { this.peer && this.peer.destroy(); } catch (e) { /* ignore */ }
    this.peer = null;
    this.conns.clear();
    this.hostConn = null;
  }
}
