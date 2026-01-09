import axios from "axios";
// import { HttpsProxyAgent } from "https-proxy-agent";

// axios.defaults.httpsAgent = new HttpsProxyAgent("http://127.0.0.1:10809");

function formatMusicItem(item) {
  return {
    id: item.videoId,
    title: item.title.runs?.[0]?.text,
    artist: item.ownerText.runs?.[0]?.text,
    artwork: item?.thumbnail?.thumbnails?.[0]?.url,
  };
}

// ============================================================================
// URL Detection and Resolution
// ============================================================================

// URL patterns for YouTube
const URL_PATTERNS = {
  // Match: https://www.youtube.com/watch?v=VIDEO_ID or https://youtu.be/VIDEO_ID
  video: /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/i,
  // Match: https://www.youtube.com/watch?v=VIDEO_ID&list=PLAYLIST_ID
  playlist: /(?:youtube\.com\/.*[?&]list=|youtube\.com\/playlist\?list=)([\w-]+)/i,
  // Match pure video ID (11 characters, alphanumeric with - and _)
  videoId: /^[\w-]{11}$/,
};

/**
 * Check if input is a YouTube URL or video ID
 */
function isYoutubeUrl(input: string): boolean {
  const trimmed = input.trim();
  return (
    URL_PATTERNS.video.test(trimmed) ||
    URL_PATTERNS.playlist.test(trimmed) ||
    URL_PATTERNS.videoId.test(trimmed)
  );
}

/**
 * Parse YouTube URL to extract video ID and playlist ID
 */
function parseYoutubeUrl(input: string): {
  videoId: string | null;
  playlistId: string | null;
} {
  const trimmed = input.trim();

  // Check for video URL
  const videoMatch = trimmed.match(URL_PATTERNS.video);
  const playlistMatch = trimmed.match(URL_PATTERNS.playlist);

  // Check for pure video ID
  if (URL_PATTERNS.videoId.test(trimmed)) {
    return { videoId: trimmed, playlistId: null };
  }

  return {
    videoId: videoMatch?.[1] || null,
    playlistId: playlistMatch?.[1] || null,
  };
}

/**
 * Get video info by video ID
 */
async function getVideoInfo(videoId: string) {
  const data = {
    context: {
      client: {
        hl: "zh-CN",
        gl: "US",
        clientName: "WEB",
        clientVersion: "2.20231121.08.00",
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
      },
      user: { lockedSafetyMode: false },
      request: { useSsl: true },
    },
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
 * Get playlist items
 */
async function getPlaylistItems(playlistId: string) {
  const items: any[] = [];
  const clientContext = {
    client: {
      hl: "zh-CN",
      gl: "US",
      clientName: "WEB",
      clientVersion: "2.20231121.08.00",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    },
    user: { lockedSafetyMode: false },
    request: { useSsl: true },
  };

  try {
    const res = await axios.post(
      "https://www.youtube.com/youtubei/v1/browse?prettyPrint=false",
      JSON.stringify({
        context: clientContext,
        browseId: `VL${playlistId}`,
      }),
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
        });
      }
    }
  } catch (error) {
    console.warn("Failed to fetch YouTube playlist:", error);
  }

  return items;
}

/**
 * Resolve YouTube URL to video/playlist info
 */
async function resolveYoutubeUrl(input: string) {
  const { videoId, playlistId } = parseYoutubeUrl(input);

  // Handle playlist
  if (playlistId) {
    try {
      const items = await getPlaylistItems(playlistId);
      if (items.length > 0) {
        return {
          type: "playlist" as const,
          data: items,
        };
      }
    } catch (error) {
      console.warn("Failed to resolve YouTube playlist:", error);
    }
  }

  // Handle single video
  if (videoId) {
    try {
      const info = await getVideoInfo(videoId);
      const details = info.videoDetails;

      if (details) {
        return {
          type: "single" as const,
          data: [
            {
              id: details.videoId,
              title: details.title,
              artist: details.author,
              artwork: details.thumbnail?.thumbnails?.[0]?.url,
            },
          ],
        };
      }
    } catch (error) {
      console.warn("Failed to resolve YouTube video:", error);
    }
  }

  return null;
}

let lastQuery;
let musicContinToken;

async function searchMusic(query, page) {
  // 新的搜索
  if (query !== lastQuery || page === 1) {
    musicContinToken = undefined;
  }
  lastQuery = query;

  let data = JSON.stringify({
    context: {
      client: {
        hl: "zh-CN",
        gl: "US",
        deviceMake: "",
        deviceModel: "",
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0,gzip(gfe)",
        clientName: "WEB",
        clientVersion: "2.20231121.08.00",
        osName: "Windows",
        osVersion: "10.0",
        platform: "DESKTOP",
        userInterfaceTheme: "USER_INTERFACE_THEME_LIGHT",
        browserName: "Edge Chromium",
        browserVersion: "119.0.0.0",
        acceptHeader:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        screenWidthPoints: 1358,
        screenHeightPoints: 1012,
        screenPixelDensity: 1,
        screenDensityFloat: 1.2395833730697632,
        utcOffsetMinutes: 480,
        memoryTotalKbytes: "8000000",
        mainAppWebInfo: {
          pwaInstallabilityStatus: "PWA_INSTALLABILITY_STATUS_UNKNOWN",
          webDisplayMode: "WEB_DISPLAY_MODE_BROWSER",
          isWebNativeShareAvailable: true,
        },
        timeZone: "Asia/Shanghai",
      },
      user: {
        lockedSafetyMode: false,
      },
      request: {
        useSsl: true,
        internalExperimentFlags: [],
      },
    },
    query: musicContinToken ? undefined : query,
    continuation: musicContinToken || undefined,
  });

  var config = {
    method: "post",
    url: "https://www.youtube.com/youtubei/v1/search?prettyPrint=false",
    headers: {
      "Content-Type": "text/plain",
    },
    data: data,
  };

  const response = (await axios(config)).data;

  const contents =
    response.contents.twoColumnSearchResultsRenderer.primaryContents
      .sectionListRenderer.contents;

  const isEndItem = contents.find(
    (it) =>
      it.continuationItemRenderer?.continuationEndpoint?.continuationCommand
        ?.request === "CONTINUATION_REQUEST_TYPE_SEARCH"
  );
  if (isEndItem) {
    musicContinToken =
      isEndItem.continuationItemRenderer.continuationEndpoint
        .continuationCommand.token;
  }

  const musicData = contents.find((it) => it.itemSectionRenderer)
    .itemSectionRenderer.contents;

  let resultMusicData = [];
  for (let i = 0; i < musicData.length; ++i) {
    if (musicData[i].videoRenderer) {
      resultMusicData.push(formatMusicItem(musicData[i].videoRenderer));
    }
  }

  return {
    isEnd: !isEndItem,
    data: resultMusicData,
  };
}

async function search(query, page, type) {
  if (type === "music") {
    // Check if input is a YouTube URL or video ID
    if (page === 1 && isYoutubeUrl(query)) {
      const resolved = await resolveYoutubeUrl(query);
      if (resolved) {
        return {
          isEnd: true,
          data: resolved.data,
        };
      }
    }

    // Fall back to normal search
    return await searchMusic(query, page);
  }
}

let cacheMediaSource = {
  id: null,
  urls: {},
};

function getQuality(label) {
  if (label === "small") {
    return "standard";
  } else if (label === "tiny") {
    return "low";
  } else if (label === "medium") {
    return "high";
  } else if (label === "large") {
    return "super";
  } else {
    return "standard";
  }
}

async function getMediaSource(musicItem, quality) {
  if (musicItem.id === cacheMediaSource.id) {
    return {
      url: cacheMediaSource.urls[quality],
    };
  }

  cacheMediaSource = {
    id: null,
    urls: {},
  };

  const data = {
    context: {
      client: {
        screenWidthPoints: 689,
        screenHeightPoints: 963,
        screenPixelDensity: 1,
        utcOffsetMinutes: 120,
        hl: "en",
        gl: "GB",
        remoteHost: "1.1.1.1",
        deviceMake: "",
        deviceModel: "",
        userAgent:
          "com.google.android.apps.youtube.music/6.14.50 (Linux; U; Android 13; GB) gzip",
        clientName: "ANDROID_MUSIC",
        clientVersion: "6.14.50",
        osName: "Android",
        osVersion: "13",
        originalUrl:
          "https://www.youtube.com/tv?is_account_switch=1&hrld=1&fltor=1",
        theme: "CLASSIC",
        platform: "MOBILE",
        clientFormFactor: "UNKNOWN_FORM_FACTOR",
        webpSupport: false,
        timeZone: "Europe/Amsterdam",
        acceptHeader:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      },
      user: { enableSafetyMode: false },
      request: {
        internalExperimentFlags: [],
        consistencyTokenJars: [],
      },
    },
    contentCheckOk: true,
    racyCheckOk: true,
    video_id: musicItem.id,
  };

  var config = {
    method: "post",
    url: "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
    headers: {
      "Content-Type": "application/json",
    },
    data: JSON.stringify(data),
  };

  const result = (await axios(config)).data;
  const formats = result.streamingData.formats ?? [];
  const adaptiveFormats = result.streamingData.adaptiveFormats ?? [];

  [...formats, ...adaptiveFormats].forEach((it) => {
    const q = getQuality(it.quality);
    if (q && it.url && !cacheMediaSource.urls[q]) {
      cacheMediaSource.urls[q] = it.url;
    }
  });

  return {
    url: cacheMediaSource.urls[quality],
  };
}

module.exports = {
  platform: "Youtube",
  author: '猫头猫',
  version: "0.0.1",
  supportedSearchType: ["music"],
  srcUrl:
    "https://gitee.com/maotoumao/MusicFreePlugins/raw/v0.1/dist/youtube/index.js",
  cacheControl: "no-cache",
  search,
  getMediaSource,
};

