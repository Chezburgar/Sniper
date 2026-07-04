// WebRTC ICE configuration.
//
// STUN lets two peers discover their public address and punch a direct hole through
// most home routers. On symmetric / carrier-grade NAT (lots of mobile networks and
// locked-down Wi-Fi) a direct link can't form — there you need a TURN server, which
// relays the game traffic through a third machine so the match still works.
//
// ─── Set up a real (free) TURN server with Metered ────────────────────────────
//   1. Sign up at https://dashboard.metered.ca  (free tier = 50 GB/mo, plenty).
//   2. Open your app — the dashboard shows an "App Name" and a "Secret Key".
//   3. Put them below (or set them at runtime, no redeploy — see localStorage note).
//        subdomain : your App Name, e.g. 'longshot'  (TURN domain longshot.metered.live)
//        apiKey    : the Secret Key string
//   Once both are filled in, every host/join automatically pulls fresh TURN
//   credentials from Metered. If they're blank, we fall back to STUN + a shared,
//   best-effort free relay (works sometimes, not guaranteed).
//
//   Runtime override without editing this file (open the browser console on the game):
//     localStorage.setItem('ls_metered_sub', 'longshot')
//     localStorage.setItem('ls_metered_key', 'YOUR_SECRET_KEY')
//   Clear with: localStorage.removeItem('ls_metered_sub'); localStorage.removeItem('ls_metered_key')

export const METERED = {
  subdomain: 'ggvault',                              // Metered App Name (ggvault.metered.live)
  apiKey: '5c57bfbf44efd36a47a66a5241dda9428d0e',    // Metered credential API key
};

// ─── EASIEST: paste the Metered dashboard snippet here ────────────────────────
// On dashboard.metered.ca open your app, find the ready-made "iceServers" code
// block (it has a Copy button) and paste its entries between the brackets below.
// If STATIC_ICE has any entries they're used directly — no live fetch, most robust.
// It looks like:
//   { urls: 'stun:stun.relay.metered.ca:80' },
//   { urls: 'turn:global.relay.metered.ca:80', username: 'AAA', credential: 'BBB' },
//   ...
export const STATIC_ICE = [
];

// Static fallback used only when Metered isn't configured.
export const DEFAULT_ICE = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];

function meteredCreds() {
  let sub = METERED.subdomain, key = METERED.apiKey;
  try {
    sub = localStorage.getItem('ls_metered_sub') || sub;
    key = localStorage.getItem('ls_metered_key') || key;
  } catch (e) { /* localStorage blocked — use the hard-coded values */ }
  return { sub: (sub || '').trim(), key: (key || '').trim() };
}

export function turnConfigured() {
  if (STATIC_ICE.some(s => String(s.urls).startsWith('turn'))) return true;
  const { sub, key } = meteredCreds();
  return !!(sub && key);
}

// Returns an iceServers array. Async because Metered credentials are fetched at runtime.
export async function iceServers() {
  // 1) full manual override (advanced)
  try {
    const override = JSON.parse(localStorage.getItem('ls_turn'));
    if (Array.isArray(override) && override.length) return override;
  } catch (e) { /* malformed — ignore */ }

  // 2) hard-coded dashboard snippet (most reliable)
  if (STATIC_ICE.length) {
    const hasStun = STATIC_ICE.some(s => String(s.urls).startsWith('stun'));
    return hasStun ? STATIC_ICE : [{ urls: 'stun:stun.l.google.com:19302' }, ...STATIC_ICE];
  }

  // 3) Metered dynamic credentials (via API key)
  const { sub, key } = meteredCreds();
  if (sub && key) {
    try {
      const url = `https://${sub}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(key)}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const servers = await res.json();
        if (Array.isArray(servers) && servers.length) {
          // prepend a STUN server for the fast direct path
          return [{ urls: 'stun:stun.l.google.com:19302' }, ...servers];
        }
        console.warn('[turn] Metered returned no servers; using fallback');
      } else {
        console.warn('[turn] Metered credentials request failed:', res.status);
      }
    } catch (e) {
      console.warn('[turn] Metered fetch error, using fallback:', e);
    }
  }

  // 3) static fallback
  return DEFAULT_ICE;
}
