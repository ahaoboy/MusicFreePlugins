import axios from "axios";
import dayjs = require("dayjs");
import he = require("he");
import CryptoJs = require("crypto-js");

// ============================================================================
// URL Resolver Plugin
// A unified plugin to parse and resolve media from different platform URLs
// Supported platforms: Bilibili, YouTube
// ============================================================================

// Platform identifiers
type SupportedPlatform = "bilibili" | "youtube" | "unknown";

interface ParsedUrl {
  platform: SupportedPlatform;
  type: "single" | "playlist" | "unknown";
  id: string;
  listId?: string;
}

// ============================================================================
// URL Pattern Matchers
// ============================================================================

const URL_PATTERNS = {
  bilibili: {
    // Match: https://www.bilibili.com/video/BV17638zoEXK
    // Match: https://b23.tv/BV17638zoEXK
    video: /(?:bilibili\.com\/video\/|b23\.tv\/)(BV[\w]+|av\d+)/i,
    // Match: https://www.bilibili.com/medialist/play/ml123456
    // Match: https://www.bilibili.com/list/ml123456
    playlist: /bilibili\.com\/(?:medialist\/play\/|list\/)(ml\d+)/i,
    // Match: https://space.bilibili.com/123456/favlist?fid=123456
    favorite: /bilibili\.com\/.*fid=(\d+)/i,
  },
  youtube: {
    // Match: https://www.youtube.com/watch?v=VIDEO_ID
    // Match: https://youtu.be/VIDEO_ID
    video: /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/i,
    // Match: https://www.youtube.com/watch?v=VIDEO_ID&list=PLAYLIST_ID
    // Match: https://www.youtube.com/playlist?list=PLAYLIST_ID
    playlist: /(?:youtube\.com\/.*[?&]list=|youtube\.com\/playlist\?list=)([\w-]+)/i,
  },
};

/**
 * Parse URL and identify platform and resource type
 */
function parseUrl(urlLike: string): ParsedUrl {
  const url = urlLike.trim();

  // Check Bilibili patterns
  const biliVideoMatch = url.match(URL_PATTERNS.bilibili.video);
  if (biliVideoMatch) {
    const playlistMatch = url.match(URL_PATTERNS.bilibili.playlist);
    const favoriteMatch = url.match(URL_PATTERNS.bilibili.favorite);
    return {
      platform: "bilibili",
      type: playlistMatch || favoriteMatch ? "playlist" : "single",
      id: biliVideoMatch[1],
      listId: playlistMatch?.[1] || favoriteMatch?.[1],
    };
  }

  const biliFavoriteMatch = url.match(URL_PATTERNS.bilibili.favorite);
  if (biliFavoriteMatch) {
    return {
      platform: "bilibili",
      type: "playlist",
      id: biliFavoriteMatch[1],
      listId: biliFavoriteMatch[1],
    };
  }

  // Check YouTube patterns
  const ytVideoMatch = url.match(URL_PATTERNS.youtube.video);
  if (ytVideoMatch) {
    const playlistMatch = url.match(URL_PATTERNS.youtube.playlist);
    return {
      platform: "youtube",
      type: playlistMatch ? "playlist" : "single",
      id: ytVideoMatch[1],
      listId: playlistMatch?.[1],
    };
  }

  const ytPlaylistMatch = url.match(URL_PATTERNS.youtube.playlist);
  if (ytPlaylistMatch) {
    return {
      platform: "youtube",
      type: "playlist",
      id: ytPlaylistMatch[1],
      listId: ytPlaylistMatch[1],
    };
  }

  return {
    platform: "unknown",
    type: "unknown",
    id: "",
  };
}

/**
 * Check if URL is supported
 */
function isSupportedUrl(urlLike: string): boolean {
  const parsed = parseUrl(urlLike);
  return parsed.platform !== "unknown";
}

// ============================================================================
// Bilibili Handlers (reused from bilibili plugin)
// ============================================================================

const bilibiliHeaders = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36 Edg/89.0.774.63",
  accept: "*/*",
  "accept-encoding": "gzip, deflate, br",
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
};

function durationToSec(duration: string | number): number {
  if (typeof duration === "number") {
    return duration;
  }
  if (typeof duration === "string") {
    const dur = duration.split(":");
    return dur.reduce((prev, curr) => 60 * prev + +curr, 0);
  }
  return 0;
}

function formatBilibiliMedia(result: any) {
  const title = he.decode(
    result.title?.replace(/(<em(.*?)>)|(<\/em>)/g, "") ?? ""
  );
  return {
    id: result.cid ?? result.bvid ?? result.aid,
    aid: result.aid,
    bvid: result.bvid,
    artist: result.author ?? result.owner?.name,
    title,
    album: result.bvid ?? result.aid,
    artwork: result.pic?.startsWith("//")
      ? "http:".concat(result.pic)
      : result.pic,
    duration: durationToSec(result.duration),
    date: result.pubdate
      ? dayjs.unix(result.pubdate).format("YYYY-MM-DD")
      : undefined,
  };
}

/**
 * Get Bilibili video info by bvid or aid
 */
async function getBilibiliVideoInfo(bvid?: string, aid?: string) {
  const params = bvid ? { bvid } : { aid };
  const res = await axios.get(
    "https://api.bilibili.com/x/web-interface/view",
    {
      headers: bilibiliHeaders,
      params,
    }
  );
  return res.data;
}

/**
 * Get Bilibili favorite list
 */
async function getBilibiliFavoriteList(mediaId: string) {
  const result: any[] = [];
  const pageSize = 20;
  let page = 1;

  while (true) {
    try {
      const { data } = await axios.get(
        "https://api.bilibili.com/x/v3/fav/resource/list",
        {
          params: {
            media_id: mediaId,
            platform: "web",
            ps: pageSize,
            pn: page,
          },
        }
      );

      if (!data.data?.medias) break;
      result.push(...data.data.medias);

      if (!data.data.has_more) break;
      page += 1;
    } catch (error) {
      console.warn("Failed to fetch Bilibili favorite list:", error);
      break;
    }
  }

  return result.map((item) => ({
    id: item.id,
    aid: item.aid,
    bvid: item.bvid,
    artwork: item.cover,
    title: item.title,
    artist: item.upper?.name,
    album: item.bvid ?? item.aid,
    duration: durationToSec(item.duration),
  }));
}

/**
 * Resolve Bilibili URL to music item(s)
 */
async function resolveBilibiliUrl(parsed: ParsedUrl) {
  // Handle favorite/playlist
  if (parsed.type === "playlist" && parsed.listId) {
    const items = await getBilibiliFavoriteList(parsed.listId);
    return {
      type: "playlist" as const,
      items,
    };
  }

  // Handle single video
  const isBvid = parsed.id.toLowerCase().startsWith("bv");
  const videoInfo = await getBilibiliVideoInfo(
    isBvid ? parsed.id : undefined,
    isBvid ? undefined : parsed.id.replace(/^av/i, "")
  );

  if (videoInfo.code !== 0) {
    throw new Error(`Bilibili API error: ${videoInfo.message}`);
  }

  const data = videoInfo.data;
  const pages = data.pages || [];

  // Multi-part video
  if (pages.length > 1) {
    const items = pages.map((p: any) => ({
      id: p.cid,
      cid: p.cid,
      bvid: data.bvid,
      aid: data.aid,
      title: p.part,
      artist: data.owner?.name,
      artwork: data.pic,
      duration: p.duration,
      album: data.title,
    }));
    return {
      type: "playlist" as const,
      items,
    };
  }

  // Single video
  return {
    type: "single" as const,
    item: formatBilibiliMedia(data),
  };
}

// ============================================================================
// YouTube Handlers (reused from youtube plugin)
// ============================================================================

const youtubeClientContext = {
  client: {
    hl: "en",
    gl: "US",
    clientName: "WEB",
    clientVersion: "2.20231121.08.00",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  },
  user: { lockedSafetyMode: false },
  request: { useSsl: true },
};

function formatYoutubeItem(item: any) {
  return {
    id: item.videoId,
    title:
      item.title?.runs?.[0]?.text ||
      item.title?.simpleText ||
      item.title,
    artist:
      item.ownerText?.runs?.[0]?.text ||
      item.shortBylineText?.runs?.[0]?.text ||
      item.videoOwnerRenderer?.title?.runs?.[0]?.text ||
      "Unknown",
    artwork:
      item.thumbnail?.thumbnails?.[0]?.url ||
      item.thumbnails?.[0]?.url,
    duration: item.lengthSeconds ? parseInt(item.lengthSeconds) : undefined,
  };
}

/**
 * Get YouTube video info
 */
async function getYoutubeVideoInfo(videoId: string) {
  const data = {
    context: youtubeClientContext,
    videoId,
  };

  const res = await axios.post(
    "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
    JSON.stringify(data),
    {
      headers: { "Content-Type": "application/json" },
    }
  );

  return res.data;
}

/**
 * Get YouTube playlist items
 */
async function getYoutubePlaylistItems(playlistId: string) {
  const items: any[] = [];
  let continuation: string | undefined;

  // Initial request
  const initialData = {
    context: youtubeClientContext,
    browseId: `VL${playlistId}`,
  };

  try {
    const res = await axios.post(
      "https://www.youtube.com/youtubei/v1/browse?prettyPrint=false",
      JSON.stringify(initialData),
      {
        headers: { "Content-Type": "application/json" },
      }
    );

    const contents =
      res.data?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer
        ?.content?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer
        ?.contents?.[0]?.playlistVideoListRenderer?.contents || [];

    for (const content of contents) {
      if (content.playlistVideoRenderer) {
        const video = content.playlistVideoRenderer;
        items.push({
          id: video.videoId,
          title: video.title?.runs?.[0]?.text || video.title?.simpleText,
          artist: video.shortBylineText?.runs?.[0]?.text || "Unknown",
          artwork: video.thumbnail?.thumbnails?.[0]?.url,
          duration: video.lengthSeconds ? parseInt(video.lengthSeconds) : undefined,
        });
      }
      if (content.continuationItemRenderer) {
        continuation =
          content.continuationItemRenderer.continuationEndpoint
            ?.continuationCommand?.token;
      }
    }

    // Fetch continuation pages (limit to avoid too many requests)
    let pageCount = 0;
    const maxPages = 5;

    while (continuation && pageCount < maxPages) {
      const contData = {
        context: youtubeClientContext,
        continuation,
      };

      const contRes = await axios.post(
        "https://www.youtube.com/youtubei/v1/browse?prettyPrint=false",
        JSON.stringify(contData),
        {
          headers: { "Content-Type": "application/json" },
        }
      );

      const contContents =
        contRes.data?.onResponseReceivedActions?.[0]
          ?.appendContinuationItemsAction?.continuationItems || [];

      continuation = undefined;

      for (const content of contContents) {
        if (content.playlistVideoRenderer) {
          const video = content.playlistVideoRenderer;
          items.push({
            id: video.videoId,
            title: video.title?.runs?.[0]?.text || video.title?.simpleText,
            artist: video.shortBylineText?.runs?.[0]?.text || "Unknown",
            artwork: video.thumbnail?.thumbnails?.[0]?.url,
            duration: video.lengthSeconds ? parseInt(video.lengthSeconds) : undefined,
          });
        }
        if (content.continuationItemRenderer) {
          continuation =
            content.continuationItemRenderer.continuationEndpoint
              ?.continuationCommand?.token;
        }
      }

      pageCount++;
    }
  } catch (error) {
    console.warn("Failed to fetch YouTube playlist:", error);
  }

  return items;
}

/**
 * Resolve YouTube URL to music item(s)
 */
async function resolveYoutubeUrl(parsed: ParsedUrl) {
  // Handle playlist
  if (parsed.type === "playlist" && parsed.listId) {
    const items = await getYoutubePlaylistItems(parsed.listId);
    return {
      type: "playlist" as const,
      items,
    };
  }

  // Handle single video
  const videoInfo = await getYoutubeVideoInfo(parsed.id);
  const details = videoInfo.videoDetails;

  if (!details) {
    throw new Error("Failed to get YouTube video info");
  }

  return {
    type: "single" as const,
    item: {
      id: details.videoId,
      title: details.title,
      artist: details.author,
      artwork: details.thumbnail?.thumbnails?.[0]?.url,
      duration: details.lengthSeconds ? parseInt(details.lengthSeconds) : undefined,
    },
  };
}

// ============================================================================
// Main Resolver
// ============================================================================

/**
 * Resolve URL to music item(s)
 * Returns single item or array of items based on URL type
 */
async function resolveUrl(urlLike: string) {
  const parsed = parseUrl(urlLike);

  if (parsed.platform === "unknown") {
    return null;
  }

  switch (parsed.platform) {
    case "bilibili":
      return await resolveBilibiliUrl(parsed);
    case "youtube":
      return await resolveYoutubeUrl(parsed);
    default:
      return null;
  }
}

/**
 * Import music from URL (for plugin interface compatibility)
 */
async function importMusicItem(urlLike: string) {
  const result = await resolveUrl(urlLike);
  if (!result) return null;

  if (result.type === "single") {
    return result.item;
  }

  // Return first item if playlist
  return result.items?.[0] || null;
}

/**
 * Import music sheet/playlist from URL
 */
async function importMusicSheet(urlLike: string) {
  const result = await resolveUrl(urlLike);
  if (!result) return null;

  if (result.type === "playlist") {
    return result.items;
  }

  // Wrap single item in array
  return result.item ? [result.item] : null;
}

// ============================================================================
// Media Source Handlers
// ============================================================================

/**
 * Get Bilibili media source
 */
async function getBilibiliMediaSource(
  musicItem: any,
  quality: IMusic.IQualityKey
) {
  let cid = musicItem.cid;

  if (!cid) {
    const videoInfo = await getBilibiliVideoInfo(musicItem.bvid, musicItem.aid);
    cid = videoInfo.data?.cid;
  }

  const params = musicItem.bvid
    ? { bvid: musicItem.bvid }
    : { aid: musicItem.aid };

  const res = await axios.get("https://api.bilibili.com/x/player/playurl", {
    headers: bilibiliHeaders,
    params: { ...params, cid, fnval: 16 },
  });

  let url: string | undefined;

  if (res.data.data?.dash) {
    const audios = res.data.data.dash.audio || [];
    audios.sort((a: any, b: any) => a.bandwidth - b.bandwidth);

    const qualityIndex = { low: 0, standard: 1, high: 2, super: 3 };
    const idx = Math.min(qualityIndex[quality] || 0, audios.length - 1);
    url = audios[idx]?.baseUrl;
  } else {
    url = res.data.data?.durl?.[0]?.url;
  }

  if (!url) return null;

  const hostUrl = url.substring(url.indexOf("/") + 2);
  return {
    url,
    headers: {
      "user-agent": bilibiliHeaders["user-agent"],
      accept: "*/*",
      host: hostUrl.substring(0, hostUrl.indexOf("/")),
      referer: `https://www.bilibili.com/video/${musicItem.bvid || musicItem.aid}`,
    },
  };
}

/**
 * Get YouTube media source
 */
async function getYoutubeMediaSource(
  musicItem: any,
  quality: IMusic.IQualityKey
) {
  const data = {
    context: {
      client: {
        clientName: "ANDROID_MUSIC",
        clientVersion: "6.14.50",
        userAgent:
          "com.google.android.apps.youtube.music/6.14.50 (Linux; U; Android 13; GB) gzip",
        hl: "en",
        gl: "GB",
        osName: "Android",
        osVersion: "13",
        platform: "MOBILE",
      },
      user: { enableSafetyMode: false },
      request: { internalExperimentFlags: [] },
    },
    contentCheckOk: true,
    racyCheckOk: true,
    video_id: musicItem.id,
  };

  const res = await axios.post(
    "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
    JSON.stringify(data),
    {
      headers: { "Content-Type": "application/json" },
    }
  );

  const formats = res.data.streamingData?.formats || [];
  const adaptiveFormats = res.data.streamingData?.adaptiveFormats || [];

  const qualityMap: Record<string, IMusic.IQualityKey> = {
    tiny: "low",
    small: "standard",
    medium: "high",
    large: "super",
  };

  const urls: Record<string, string> = {};
  [...formats, ...adaptiveFormats].forEach((it: any) => {
    const q = qualityMap[it.quality];
    if (q && it.url && !urls[q]) {
      urls[q] = it.url;
    }
  });

  return { url: urls[quality] || urls.standard || urls.low };
}

/**
 * Get media source based on platform
 */
async function getMediaSource(musicItem: any, quality: IMusic.IQualityKey) {
  // Detect platform from musicItem properties
  if (musicItem.bvid || musicItem.aid) {
    return getBilibiliMediaSource(musicItem, quality);
  }

  // Default to YouTube (has simple id)
  return getYoutubeMediaSource(musicItem, quality);
}

// ============================================================================
// Plugin Export
// ============================================================================

module.exports = {
  platform: "URL Resolver",
  author: "MusicFree",
  version: "0.0.1",
  description: "Resolve media from URLs (Bilibili, YouTube)",
  srcUrl:
    "https://gitee.com/maotoumao/MusicFreePlugins/raw/v0.1/dist/urlresolver/index.js",
  cacheControl: "no-cache",

  // Utility functions
  parseUrl,
  isSupportedUrl,
  resolveUrl,

  // Plugin interface methods
  importMusicItem,
  importMusicSheet,
  getMediaSource,

  // Hints for users
  hints: {
    importMusicItem: [
      "Supported URLs:",
      "- Bilibili: https://www.bilibili.com/video/BVxxxxxx",
      "- YouTube: https://www.youtube.com/watch?v=xxxxxx",
      "- YouTube: https://youtu.be/xxxxxx",
    ],
    importMusicSheet: [
      "Supported playlist URLs:",
      "- Bilibili favorite: URL with fid parameter",
      "- YouTube playlist: https://www.youtube.com/playlist?list=xxxxxx",
      "- YouTube video with list: https://www.youtube.com/watch?v=xxx&list=xxx",
    ],
  },
};

// ============================================================================
// Test Code (uncomment to test)
// ============================================================================

// Test Bilibili single video
// resolveUrl("https://www.bilibili.com/video/BV17638zoEXK").then((r) =>
//   console.log("Bilibili single:", JSON.stringify(r, null, 2))
// );

// Test YouTube single video
// resolveUrl("https://www.youtube.com/watch?v=tmE1k41Ncoo").then((r) =>
//   console.log("YouTube single:", JSON.stringify(r, null, 2))
// );

// Test YouTube playlist
// resolveUrl(
//   "https://www.youtube.com/watch?v=tmE1k41Ncoo&list=PLxfJZ3cTz86r-GMISqI5eXh_M-XCua_uW"
// ).then((r) => console.log("YouTube playlist:", JSON.stringify(r, null, 2)));
