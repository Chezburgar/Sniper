// WebRTC ICE configuration.
//
// STUN lets two peers discover their public address and punch a direct hole through
// most home routers. But on symmetric / carrier-grade NAT (a lot of mobile networks
// and locked-down corporate Wi-Fi) a direct link can't form — there you need a TURN
// server, which relays the game traffic through a third machine so the match still works.
//
// The TURN entries below use the free, best-effort OpenRelay project relays. They work
// for casual play but are shared and rate-limited, so they're a fallback, not a promise.
// For reliable matches, get your own free credentials (Metered's free tier is 500 MB/mo)
// at https://dashboard.metered.ca and either edit DEFAULT_ICE below, or drop them in at
// runtime from the browser console — no redeploy needed:
//
//   localStorage.setItem('ls_turn', JSON.stringify([
//     { urls: 'stun:stun.l.google.com:19302' },
//     { urls: 'turn:YOUR.turn.host:3478', username: 'USER', credential: 'PASS' },
//     { urls: 'turn:YOUR.turn.host:443?transport=tcp', username: 'USER', credential: 'PASS' }
//   ]))
//
// Clear the override with:  localStorage.removeItem('ls_turn')

export const DEFAULT_ICE = [
  // --- STUN (direct connection; handles the majority of networks) ---
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  // --- TURN relay fallback (free OpenRelay project; best-effort) ---
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];

export function iceServers() {
  try {
    const override = JSON.parse(localStorage.getItem('ls_turn'));
    if (Array.isArray(override) && override.length) return override;
  } catch (e) { /* malformed override — fall through to defaults */ }
  return DEFAULT_ICE;
}
