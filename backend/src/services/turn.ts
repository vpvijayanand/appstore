import crypto from 'crypto';

// ── TURN REST API ephemeral credentials ──────────────────────────────────────
// Generates short-lived TURN credentials using the "TURN REST API" convention
// supported by coturn when started with --use-auth-secret --static-auth-secret.
// See: https://datatracker.ietf.org/doc/html/draft-uberti-behave-turn-rest-00
//
// username = "<unix-expiry-timestamp>:<label>"
// password = base64(HMAC-SHA1(sharedSecret, username))
//
// Both the admin portal (viewer) and the Android app (publisher) call the same
// /ice-servers endpoint (via their own auth) to get STUN + TURN server configs
// for building an RTCPeerConnection.

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const TURN_SECRET = process.env.TURN_SECRET || '';
const TURN_HOST = process.env.TURN_HOST || '';
const TURN_PORT = process.env.TURN_PORT || '3478';
const TURN_TTL_SECONDS = parseInt(process.env.TURN_CREDENTIAL_TTL_SECONDS || '3600', 10);

export function getIceServers(label: string): IceServer[] {
  const servers: IceServer[] = [
    { urls: ['stun:stun.l.google.com:19302'] },
  ];

  if (TURN_HOST && TURN_SECRET) {
    const expiry = Math.floor(Date.now() / 1000) + TURN_TTL_SECONDS;
    const username = `${expiry}:${label}`;
    const credential = crypto
      .createHmac('sha1', TURN_SECRET)
      .update(username)
      .digest('base64');

    servers.push({
      urls: [
        `turn:${TURN_HOST}:${TURN_PORT}?transport=udp`,
        `turn:${TURN_HOST}:${TURN_PORT}?transport=tcp`,
      ],
      username,
      credential,
    });
  }

  return servers;
}
