// ============================================================
//  SASI STREAMS — SECRETS TEMPLATE
//  Copy this file to `secrets.js` and fill in your keys.
//  `secrets.js` is gitignored — only commit this example file.
// ============================================================

window.SASI_SECRETS = {

  // ── YouTube Data API v3 ─────────────────────────────────
  // Get API keys at: https://console.cloud.google.com/
  //   1. Create a project → Enable "YouTube Data API v3"
  //   2. Create credentials → API key
  // Multiple keys for marathon streams (auto-rotates on quota):
  //   1 key ≈ 12hrs, 2 keys ≈ 24hrs, 3 keys ≈ 36hrs
  youtube: {
    apiKeys: [
      'YOUR_YOUTUBE_API_KEY_HERE',
      // 'PASTE_SECOND_KEY_HERE',
      // 'PASTE_THIRD_KEY_HERE',
    ],
    apiKey:    'YOUR_YOUTUBE_API_KEY_HERE',  // backward compat
    channelId: 'YOUR_CHANNEL_ID_HERE',       // starts with UC...
  },

  // ── Twitch ─────────────────────────────────────────────
  twitch: {
    clientId:     '',
    clientSecret: '',
    username:     '',  // your Twitch channel name
  },

  // ── StreamElements (for alerts) ────────────────────────
  // Get JWT at: https://streamelements.com/dashboard/account/channels
  // activePlatform in config.js picks which JWT to use.
  streamelements: {
    youtube: {
      jwt: 'PASTE_YOUTUBE_SE_JWT_HERE',
    },
    twitch: {
      jwt: 'PASTE_TWITCH_SE_JWT_HERE',
    },
  },

};
