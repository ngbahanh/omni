// src/tools/_media-downloader/url-parser.js
// URL recognition for YouTube, TikTok, Instagram, Facebook, X (Twitter)

import { execSync } from "child_process";
import { PLATFORMS, URL_TYPES } from "./constants.js";

/**
 * Resolve a short URL (t.co, vm.tiktok.com, fb.watch, youtu.be) by following redirects.
 * @param {string} url
 * @returns {string} resolved URL
 */
function resolveShortUrl(url) {
  try {
    const result = execSync(
      `curl -Ls -o /dev/null -w '%{url_effective}' '${url}'`,
      {
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 10000,
      },
    );
    return result.toString().trim();
  } catch {
    return url; // fallback to original
  }
}

/**
 * Parse a URL and detect platform + type + username/identifier.
 * @param {string} rawUrl
 * @returns {{ platform: string, type: string, username: string, url: string } | null}
 */
export function parseUrl(rawUrl) {
  let url = rawUrl.trim();
  if (!url) return null;

  // Ensure protocol
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }

  // Resolve short links first
  if (/^https?:\/\/(t\.co|vm\.tiktok\.com|fb\.watch|youtu\.be)\//i.test(url)) {
    if (/youtu\.be\//i.test(url)) {
      // youtu.be is a YouTube short link — parse directly
      return parseYouTube(url);
    }
    url = resolveShortUrl(url);
  }

  // Detect platform by hostname
  let hostname;
  try {
    hostname = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }

  if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) {
    return parseYouTube(url);
  }
  if (hostname.includes("tiktok.com")) {
    return parseTikTok(url);
  }
  if (hostname.includes("instagram.com")) {
    return parseInstagram(url);
  }
  if (hostname.includes("facebook.com") || hostname === "fb.watch") {
    return parseFacebook(url);
  }
  if (hostname === "twitter.com" || hostname === "x.com") {
    return parseX(url);
  }

  return null;
}

// ─── YouTube ─────────────────────────────────────────────────────

function parseYouTube(url) {
  const parsed = new URL(url);
  const path = parsed.pathname;

  // youtu.be short link → single video
  if (parsed.hostname.includes("youtu.be")) {
    const id = path.replace("/", "");
    return {
      platform: PLATFORMS.YOUTUBE,
      type: URL_TYPES.SINGLE_VIDEO,
      username: id,
      url,
    };
  }

  // Single video: /watch?v=XXX
  const videoId = parsed.searchParams.get("v");
  if (videoId) {
    return {
      platform: PLATFORMS.YOUTUBE,
      type: URL_TYPES.SINGLE_VIDEO,
      username: videoId,
      url,
    };
  }

  // Short video: /shorts/XXX
  const shortsMatch = path.match(/\/shorts\/([^/]+)/);
  if (shortsMatch) {
    return {
      platform: PLATFORMS.YOUTUBE,
      type: URL_TYPES.SINGLE_VIDEO,
      username: shortsMatch[1],
      url,
    };
  }

  // Playlist: /playlist?list=XXX
  const listId = parsed.searchParams.get("list");
  if (listId && path.includes("/playlist")) {
    return {
      platform: PLATFORMS.YOUTUBE,
      type: URL_TYPES.PLAYLIST,
      username: listId,
      url,
    };
  }

  // Channel handle: /@username or /@username/videos etc
  const handleMatch = path.match(/\/@([^/]+)/);
  if (handleMatch) {
    const handle = handleMatch[1];
    if (path.endsWith("/shorts")) {
      return {
        platform: PLATFORMS.YOUTUBE,
        type: URL_TYPES.SHORTS_TAB,
        username: `@${handle}`,
        url,
      };
    }
    if (path.endsWith("/playlists")) {
      return {
        platform: PLATFORMS.YOUTUBE,
        type: URL_TYPES.PLAYLISTS_TAB,
        username: `@${handle}`,
        url,
      };
    }
    // /videos tab or base channel
    return {
      platform: PLATFORMS.YOUTUBE,
      type: URL_TYPES.CHANNEL,
      username: `@${handle}`,
      url,
    };
  }

  // Channel ID: /channel/UCXXXX
  const channelMatch = path.match(/\/channel\/([^/]+)/);
  if (channelMatch) {
    return {
      platform: PLATFORMS.YOUTUBE,
      type: URL_TYPES.CHANNEL,
      username: channelMatch[1],
      url,
    };
  }

  // User URL: /user/username
  const userMatch = path.match(/\/user\/([^/]+)/);
  if (userMatch) {
    return {
      platform: PLATFORMS.YOUTUBE,
      type: URL_TYPES.CHANNEL,
      username: userMatch[1],
      url,
    };
  }

  return null;
}

// ─── TikTok ──────────────────────────────────────────────────────

function parseTikTok(url) {
  const parsed = new URL(url);
  const path = parsed.pathname;

  // Single video: /@user/video/1234567890
  const videoMatch = path.match(/\/@([^/]+)\/video\/(\d+)/);
  if (videoMatch) {
    return {
      platform: PLATFORMS.TIKTOK,
      type: URL_TYPES.SINGLE_VIDEO,
      username: `@${videoMatch[1]}`,
      url,
    };
  }

  // Profile: /@username
  const profileMatch = path.match(/\/@([^/?]+)/);
  if (profileMatch) {
    return {
      platform: PLATFORMS.TIKTOK,
      type: URL_TYPES.PROFILE,
      username: `@${profileMatch[1]}`,
      url,
    };
  }

  return null;
}

// ─── Instagram ───────────────────────────────────────────────────

function parseInstagram(url) {
  const parsed = new URL(url);
  const path = parsed.pathname.replace(/\/+$/, "");

  // Single story: /stories/username/1234567890
  const storyMatch = path.match(/\/stories\/([^/]+)\/(\d+)/);
  if (storyMatch) {
    return {
      platform: PLATFORMS.INSTAGRAM,
      type: URL_TYPES.SINGLE_STORY,
      username: storyMatch[1],
      url,
    };
  }

  // Highlights: /stories/highlights/XXXXXXXXXX
  const highlightMatch = path.match(/\/stories\/highlights\/(\d+)/);
  if (highlightMatch) {
    return {
      platform: PLATFORMS.INSTAGRAM,
      type: URL_TYPES.HIGHLIGHTS,
      username: highlightMatch[1],
      url,
    };
  }

  // Single post: /p/XXXXXXXXXX
  const postMatch = path.match(/\/p\/([^/]+)/);
  if (postMatch) {
    return {
      platform: PLATFORMS.INSTAGRAM,
      type: URL_TYPES.SINGLE_POST,
      username: postMatch[1],
      url,
    };
  }

  // Single reel: /reel/XXXXXXXXXX
  const reelMatch = path.match(/\/reel\/([^/]+)/);
  if (reelMatch) {
    return {
      platform: PLATFORMS.INSTAGRAM,
      type: URL_TYPES.SINGLE_REEL,
      username: reelMatch[1],
      url,
    };
  }

  // Profile: /username (must be last — catch-all)
  const profileMatch = path.match(/^\/([a-zA-Z0-9_.]+)$/);
  if (profileMatch) {
    return {
      platform: PLATFORMS.INSTAGRAM,
      type: URL_TYPES.PROFILE,
      username: profileMatch[1],
      url,
    };
  }

  return null;
}

// ─── Facebook ────────────────────────────────────────────────────

function parseFacebook(url) {
  const parsed = new URL(url);
  const path = parsed.pathname.replace(/\/+$/, "");

  // fb.watch short link — already resolved, but might still be here
  if (parsed.hostname === "fb.watch") {
    return {
      platform: PLATFORMS.FACEBOOK,
      type: URL_TYPES.SINGLE_VIDEO,
      username: path.replace("/", ""),
      url,
    };
  }

  // Single video: /watch?v=XXX
  const watchId = parsed.searchParams.get("v");
  if (path.includes("/watch") && watchId) {
    return {
      platform: PLATFORMS.FACEBOOK,
      type: URL_TYPES.SINGLE_VIDEO,
      username: watchId,
      url,
    };
  }

  // Reel: /reel/XXXXXXXXXX
  const reelMatch = path.match(/\/reel\/(\d+)/);
  if (reelMatch) {
    return {
      platform: PLATFORMS.FACEBOOK,
      type: URL_TYPES.SINGLE_VIDEO,
      username: reelMatch[1],
      url,
    };
  }

  // Video in page: /PageName/videos/1234567890
  const pageVideoMatch = path.match(/\/([^/]+)\/videos\/(\d+)/);
  if (pageVideoMatch) {
    return {
      platform: PLATFORMS.FACEBOOK,
      type: URL_TYPES.SINGLE_VIDEO,
      username: pageVideoMatch[1],
      url,
    };
  }

  // Permalink post
  if (
    path.includes("/permalink.php") ||
    parsed.searchParams.has("story_fbid")
  ) {
    return {
      platform: PLATFORMS.FACEBOOK,
      type: URL_TYPES.SINGLE_POST,
      username: "post",
      url,
    };
  }

  // Photo album: /media/set/?set=a.XXX
  if (path.includes("/media/set")) {
    return {
      platform: PLATFORMS.FACEBOOK,
      type: URL_TYPES.ALBUM,
      username: "album",
      url,
    };
  }

  // Single photo: /photo?fbid=XXX
  const fbid = parsed.searchParams.get("fbid");
  if (path.includes("/photo") && fbid) {
    return {
      platform: PLATFORMS.FACEBOOK,
      type: URL_TYPES.SINGLE_PHOTO,
      username: fbid,
      url,
    };
  }

  // Group post: /groups/GROUPID/posts/POSTID
  const groupMatch = path.match(/\/groups\/([^/]+)\/posts\/(\d+)/);
  if (groupMatch) {
    return {
      platform: PLATFORMS.FACEBOOK,
      type: URL_TYPES.GROUP_POST,
      username: groupMatch[1],
      url,
    };
  }

  // Profile with numeric ID: /profile.php?id=XXX
  const profileId = parsed.searchParams.get("id");
  if (path.includes("/profile.php") && profileId) {
    return {
      platform: PLATFORMS.FACEBOOK,
      type: URL_TYPES.PAGE,
      username: profileId,
      url,
    };
  }

  // Public page: /PageName (catch-all)
  const pageMatch = path.match(/^\/([a-zA-Z0-9.]+)$/);
  if (pageMatch) {
    return {
      platform: PLATFORMS.FACEBOOK,
      type: URL_TYPES.PAGE,
      username: pageMatch[1],
      url,
    };
  }

  return null;
}

// ─── X (Twitter) ─────────────────────────────────────────────────

function parseX(url) {
  const parsed = new URL(url);
  const path = parsed.pathname.replace(/\/+$/, "");

  // Single tweet: /user/status/1234567890
  const tweetMatch = path.match(/\/([^/]+)\/status\/(\d+)/);
  if (tweetMatch) {
    return {
      platform: PLATFORMS.X,
      type: URL_TYPES.TWEET,
      username: `@${tweetMatch[1]}`,
      url,
    };
  }

  // Profile: /username
  const profileMatch = path.match(/^\/([a-zA-Z0-9_]+)$/);
  if (profileMatch) {
    return {
      platform: PLATFORMS.X,
      type: URL_TYPES.PROFILE,
      username: `@${profileMatch[1]}`,
      url,
    };
  }

  return null;
}
