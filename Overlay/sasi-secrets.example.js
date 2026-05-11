// ============================================================
//  SASI STUDIO — secrets template (multi-channel, v2)
//
//  Save a copy of this file as Overlay/sasi-secrets.js (parent dir
//  of the active theme). It's gitignored — never commit real keys.
//
//  After editing, refresh OBS browser sources OR click Restart in
//  the dashboard so changes apply.
// ============================================================

window.SASI_SECRETS = {

  // ── Currently-active channel ──────────────────────────────
  // Determines which channels[].xxx config is used by chat / alerts / brand.
  // Switch via dashboard "Channels" section, or hand-edit here.
  activeChannel: 'sasi-streams',

  // ── Shared across all channels ────────────────────────────
  // StreamElements account is usually one for all your channels.
  streamelements: {
    youtube: {
      jwt: '',  // SE → Account → Show secrets → JWT Token (YouTube account)
    },
    twitch: {
      jwt: '',  // SE → Account → Show secrets → JWT Token (Twitch account)
    },
  },

  // ── Per-channel config + secrets ──────────────────────────
  // Each entry bundles brand + theme + per-channel keys.
  // The dashboard "Switch Channel" button does:
  //   1. Set activeChannel here
  //   2. Apply the channel's theme (rename folder swap)
  //   3. Push brand to localStorage so overlays update live
  channels: {

    'sasi-streams': {
      brand: {
        name:    'SASI STREAMS',
        tagline: 'LIVE STREAM',
        logo:    'assets/Sasi_Streams_logo.png',  // path relative to active theme folder
      },
      theme: 'sasi-overlays',  // active theme folder name (no -<suffix> = default)

      youtube: {
        // Multiple keys auto-rotate when one hits quota. Get from Google Cloud
        // Console → enable YouTube Data API v3 → Credentials → Create API Key.
        apiKeys: [
          'YOUR_YT_API_KEY_HERE',
        ],
        channelId: 'UC_YOUR_CHANNEL_ID',  // starts with UC...
      },

      twitch: {
        // username is required for anonymous IRC chat polling.
        // clientId / clientSecret are reserved for future Twitch-API features
        // (channel-points triggers, follower events, etc.). Leave blank unless
        // you've created a Twitch app at dev.twitch.tv/console.
        username:     'your_twitch_username',
        clientId:     '',
        clientSecret: '',
      },
    },

    // Example second channel — uncomment + customize
    // 'sasi-labs': {
    //   brand: {
    //     name:    'SASI LABS',
    //     tagline: 'LAB SESSION',
    //     logo:    'assets/sasi-labs-logo.png',
    //   },
    //   theme: 'sasi-overlays-blue',
    //   youtube: {
    //     apiKeys: ['YOUR_OTHER_YT_KEY'],
    //     channelId: 'UC_LABS_CHANNEL_ID',
    //   },
    //   twitch: {
    //     username:     'sasi_labs',
    //     clientId:     '',
    //     clientSecret: '',
    //   },
    // },
  },
};

// ── Backwards-compat layer ───────────────────────────────────
// Older overlay code reads window.SASI_SECRETS.youtube directly (single-channel
// shape). This shim resolves the active channel into top-level fields so
// nothing breaks during the multi-channel migration.
(function () {
  const s = window.SASI_SECRETS;
  if (!s || !s.channels) return;
  const active = s.channels[s.activeChannel];
  if (!active) return;
  if (!s.youtube) s.youtube = active.youtube;
  if (!s.twitch)  s.twitch  = active.twitch;
})();
