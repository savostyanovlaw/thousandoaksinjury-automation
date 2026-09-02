/* ============================================================================
   video-gallery.js
   Powers the homepage "Personal Injury Videos & Legal Insights" section.
   Loaded ONLY by index.html (the only page containing #video-gallery).
   This file does not touch the site's consent banner or analytics.

   ----------------------------------------------------------------------------
   TO ADD A VIDEO OR A SHORT:
     1. Add ONE object to the VIDEOS array below.
     2. Save its preview image to  website/images/videos/<id>.jpg
        (see THUMBNAILS note below). Nothing else needs to change.

     youtubeId    (required)  The 11-character YouTube ID, OR a full
                              youtube.com/watch?v=, youtube.com/shorts/, or
                              youtu.be/ URL. The ID is extracted for you.
     title        (required)  Plain-text card title, written for a person.
     description  (optional)  One short line. Use "" or omit to hide it.
     language     (required)  "English" or "Русский".
     type         (required)  "video" or "short". Controls the small
                              VIDEO / SHORT label only. Both kinds embed and
                              play the same way in a standard 16:9 player.
     thumbnail    (optional)  Preview-image filename inside /images/videos/.
                              Defaults to "<id>.jpg".

   Example:
     {
       youtubeId: "https://youtu.be/XXXXXXXXXXX",
       title: "What to do after a rear-end collision in California",
       description: "Steps that protect your health and your claim.",
       language: "English",
       type: "video"
     }

   ----------------------------------------------------------------------------
   THUMBNAILS (local only - no third-party request before Play):
   Every card's preview image is served from THIS site
   (/images/videos/<id>.jpg). Nothing is requested from YouTube, i.ytimg.com,
   Google, or youtube-nocookie.com until the visitor clicks the Play control;
   only then does the youtube-nocookie.com player iframe load (no autoplay).

   When you add a video, save its preview image once:
     - path : website/images/videos/<the 11-char id>.jpg
     - a 16:9 image around 800x450 is a good size
     - YouTube's own 16:9 frame is at
         https://i.ytimg.com/vi/<id>/maxresdefault.jpg
       download it, resize/compress, and commit the file. It is NOT fetched
       at runtime.
   If the image is missing the card still works: it shows a plain Play button
   over a solid background, and the video still loads on click.
   ============================================================================ */

(function () {
  "use strict";

  var THUMB_DIR = "/images/videos/";

  var VIDEOS = [
    // --- ADD VIDEOS BELOW THIS LINE ---
    {
      youtubeId: "https://www.youtube.com/shorts/ggNpZ166QFc",
      title: "First Things To Do After a Car Accident in California",
      description: "Practical first steps to consider after a car accident in California, including protecting your health and preserving important information for a potential injury claim.",
      language: "English",
      type: "short"
    }
    // --- ADD VIDEOS ABOVE THIS LINE ---
  ];

  function extractId(value) {
    var s = String(value || "").trim();
    var m = s.match(/(?:youtu\.be\/|\/shorts\/|[?&]v=|\/embed\/)([A-Za-z0-9_-]{11})/);
    if (m) { return m[1]; }
    if (/^[A-Za-z0-9_-]{11}$/.test(s)) { return s; }
    return "";
  }

  function buildCard(v) {
    var id = extractId(v.youtubeId);
    if (!id || !v.title) { return null; }

    var isShort = v.type === "short";

    var card = document.createElement("article");
    card.className = "video-card";

    var media = document.createElement("div");
    media.className = "video-media";

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "video-play";
    btn.setAttribute("aria-label", "Load and play video: " + v.title);

    var img = document.createElement("img");
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    img.loading = "lazy";
    img.decoding = "async";
    // If the local preview image is missing, drop it and fall back to the
    // solid media background + Play button. No external request is made.
    img.addEventListener("error", function () {
      if (img.parentNode) { img.parentNode.removeChild(img); }
    });
    img.src = THUMB_DIR + (v.thumbnail || (id + ".jpg")); // LOCAL THUMBNAIL SOURCE
    btn.appendChild(img);
    media.appendChild(btn);

    btn.addEventListener("click", function () {
      var frame = document.createElement("iframe");
      // No autoplay: the YouTube player is shown; the visitor presses play in it.
      frame.src = "https://www.youtube-nocookie.com/embed/" + id + "?rel=0";
      frame.title = v.title;
      frame.loading = "lazy";
      frame.setAttribute("allow", "encrypted-media; picture-in-picture; fullscreen");
      frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
      media.textContent = "";
      media.appendChild(frame);
    });

    var body = document.createElement("div");
    body.className = "video-body";

    var meta = document.createElement("p");
    meta.className = "video-meta";
    meta.textContent = (isShort ? "SHORT" : "VIDEO") + " · " + (v.language || "");
    body.appendChild(meta);

    var heading = document.createElement("h3");
    heading.textContent = v.title;
    body.appendChild(heading);

    if (v.description) {
      var desc = document.createElement("p");
      desc.textContent = v.description;
      body.appendChild(desc);
    }

    var link = document.createElement("a");
    link.href = (isShort ? "https://www.youtube.com/shorts/" : "https://www.youtube.com/watch?v=") + id;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Watch on YouTube →";
    body.appendChild(link);

    card.appendChild(media);
    card.appendChild(body);
    return card;
  }

  function init() {
    var section = document.getElementById("videos");
    var grid = document.getElementById("video-gallery");
    if (!section || !grid) { return; }

    var built = 0;
    for (var i = 0; i < VIDEOS.length; i++) {
      var card = buildCard(VIDEOS[i]);
      if (card) { grid.appendChild(card); built++; }
    }

    // Reveal the section only once at least one valid video is configured.
    if (built > 0) { section.hidden = false; }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
