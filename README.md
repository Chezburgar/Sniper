# LONGSHOT — Online Sniper PvP

A 3D online multiplayer bolt-action sniper duel that runs entirely in the browser —
no installs, no servers to run. Built with Three.js, synthesized WebAudio sound, and
peer-to-peer WebRTC networking (PeerJS), so it works from static hosting like GitHub Pages.

**Play:** https://chezburgar.github.io/Sniper/

## How to play

| Action | Key |
|---|---|
| Move | `WASD` |
| Scope | Hold `RMB` |
| Fire | `LMB` |
| Hold breath (scoped) / Sprint | `SHIFT` |
| Reload | `R` |
| Crouch | `C` |
| Jump | `SPACE` |
| Scoreboard | Hold `TAB` |

- **Host Match** — opens a room and gives you a 5-letter code to share.
- **Join Match** — enter a friend's code. You can also share a link like
  `https://chezburgar.github.io/Sniper/#CODE` to prefill it.
- **Practice Range** — offline warm-up against 5 wandering bots that shoot back.

Damage is zone-based: headshots are lethal, chest and legs take multiple hits.
The bolt cycles between shots — make the first one count. Holding breath steadies
the scope for about 3 seconds.

## The map — "Al-Ramla"

A sun-baked desert village at golden hour: a fountain plaza ringed by stucco houses,
rooftop sniper nests with exterior staircases, a 16-metre climbable bell tower,
walkable perimeter ramparts with corner bastions, market stalls, palms, and dunes
rolling out to distant pyramids. Every rooftop with a parapet is reachable.

## Tech

- **Rendering:** Three.js — ACES tone mapping, PCF soft shadows, distance fog,
  procedurally generated canvas textures (stucco, cobblestone, sand, wood).
- **Audio:** 100% synthesized WebAudio — rifle crack with echo slap-back, bolt cycling,
  bullet whizzes, hitmarkers, desert wind ambience. No audio files.
- **Netcode:** PeerJS (WebRTC data channels) in a host-relay star topology,
  with snapshot interpolation for remote players. Works on static hosting because
  the "server" is just the hosting player's browser.
- **Zero build step:** plain ES modules + CDN imports.

> Note: connections use the free public PeerJS broker and STUN only. On rare
> symmetric-NAT networks a peer may fail to connect — try a different network if so.

## Run locally

Any static file server works:

```sh
npx http-server -p 8080
# open http://localhost:8080
```
