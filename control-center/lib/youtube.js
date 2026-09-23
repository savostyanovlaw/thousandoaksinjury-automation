// A thin client for YouTube's real Data API v3, built against its
// documented OAuth refresh-token flow and multipart video upload. This has
// NOT been live-verified against a real YouTube channel (no credentials are
// available in this environment) -- see createYouTubeClient's own
// configured check, which is what lets the caller report a precise
// BLOCKED_YOUTUBE_CONFIGURATION state instead of ever pretending to have
// published something.
//
// Uploads default to privacyStatus='private' unless the caller explicitly
// passes a different value -- see approvals/[id].js's publish branch, which
// never does. CI must never be able to publish a public video; nothing in
// this file makes an outbound call on its own, only when explicitly invoked
// from the owner's Approve & Publish decision.
const YOUTUBE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const YOUTUBE_UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status';

export function createYouTubeClient({clientId, clientSecret, refreshToken, fetchImpl = fetch} = {}) {
  const configured = Boolean(String(clientId || '').trim() && String(clientSecret || '').trim() && String(refreshToken || '').trim());
  async function getAccessToken() {
    const res = await fetchImpl(YOUTUBE_TOKEN_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token'}).toString()
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.access_token) throw new Error(`YouTube OAuth token refresh failed: ${data?.error_description || res.status}`);
    return data.access_token;
  }
  return {
    configured,
    // privacyStatus defaults to 'private' -- the caller must pass an
    // explicit, owner-authorized value to publish more openly, and nothing
    // in this codebase does that automatically.
    async uploadVideo({videoUrl, title, description, privacyStatus = 'private'}) {
      if (!configured) throw new Error('YouTube is not configured (missing YOUTUBE_CLIENT_ID/YOUTUBE_CLIENT_SECRET/YOUTUBE_REFRESH_TOKEN)');
      const accessToken = await getAccessToken();
      const videoRes = await fetchImpl(videoUrl);
      if (!videoRes.ok) throw new Error(`Failed to fetch the rendered video for upload: ${videoRes.status}`);
      const videoBytes = await videoRes.arrayBuffer();
      const boundary = `slc_yt_upload_${crypto.randomUUID()}`;
      const metadata = JSON.stringify({
        snippet: {title: String(title || '').slice(0, 100), description: String(description || '').slice(0, 5000)},
        status: {privacyStatus}
      });
      const body = new Blob([
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`,
        videoBytes,
        `\r\n--${boundary}--`
      ]);
      const res = await fetchImpl(YOUTUBE_UPLOAD_URL, {
        method: 'POST',
        headers: {Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}`},
        body
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.id) throw new Error(`YouTube upload failed: ${data?.error?.message || res.status}`);
      return {videoId: String(data.id), url: `https://www.youtube.com/watch?v=${data.id}`};
    }
  };
}
