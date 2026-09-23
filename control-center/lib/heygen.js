// A thin client for HeyGen's real video-generation API, built against its
// documented v2 generate / v1 status surface. This has NOT been
// live-verified against a real HeyGen account (no credentials are available
// in this environment) -- see createHeyGenClient's own configured check,
// which is what lets the caller report a precise BLOCKED_HEYGEN_CONFIGURATION
// state instead of ever pretending to have rendered something.
//
// Never falls back to a public/random/generic avatar or a different voice:
// HEYGEN_AVATAR_ID and HEYGEN_VOICE_ID must both be the owner's own private
// avatar/voice IDs (see .env.example), and configured() is false unless
// every one of HEYGEN_API_KEY/HEYGEN_AVATAR_ID/HEYGEN_VOICE_ID is present.
const HEYGEN_GENERATE_URL = 'https://api.heygen.com/v2/video/generate';
const HEYGEN_STATUS_URL = 'https://api.heygen.com/v1/video_status.get';

export function createHeyGenClient({apiKey, avatarId, voiceId, fetchImpl = fetch} = {}) {
  const configured = Boolean(String(apiKey || '').trim() && String(avatarId || '').trim() && String(voiceId || '').trim());
  return {
    configured,
    async submitRender(script) {
      if (!configured) throw new Error('HeyGen is not configured (missing HEYGEN_API_KEY/HEYGEN_AVATAR_ID/HEYGEN_VOICE_ID)');
      const body = {
        video_inputs: [{
          character: {type: 'avatar', avatar_id: avatarId, avatar_style: 'normal'},
          voice: {type: 'text', input_text: String(script || '').slice(0, 5000), voice_id: voiceId}
        }],
        dimension: {width: 1280, height: 720}
      };
      const res = await fetchImpl(HEYGEN_GENERATE_URL, {
        method: 'POST',
        headers: {'X-Api-Key': apiKey, 'Content-Type': 'application/json'},
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.data?.video_id) {
        throw new Error(`HeyGen render submission failed: ${data?.error?.message || res.status}`);
      }
      return {videoId: String(data.data.video_id)};
    },
    async pollStatus(videoId) {
      if (!configured) throw new Error('HeyGen is not configured (missing HEYGEN_API_KEY/HEYGEN_AVATAR_ID/HEYGEN_VOICE_ID)');
      const res = await fetchImpl(`${HEYGEN_STATUS_URL}?video_id=${encodeURIComponent(videoId)}`, {
        headers: {'X-Api-Key': apiKey}
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(`HeyGen status check failed: ${data?.error?.message || res.status}`);
      const status = String(data?.data?.status || '').toLowerCase();
      return {
        status,
        videoUrl: data?.data?.video_url || null,
        error: data?.data?.error?.message || null,
        // HeyGen's own vocabulary ('completed'/'processing'/'pending'/'waiting'/
        // 'failed') is normalized here so callers never need to know it.
        done: status === 'completed' || status === 'failed'
      };
    }
  };
}
