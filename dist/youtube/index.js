"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = require("axios");
function formatMusicItem(item) {
    var _a, _b, _c, _d, _e, _f, _g;
    return {
        id: item.videoId,
        title: (_b = (_a = item.title.runs) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.text,
        artist: (_d = (_c = item.ownerText.runs) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.text,
        artwork: (_g = (_f = (_e = item === null || item === void 0 ? void 0 : item.thumbnail) === null || _e === void 0 ? void 0 : _e.thumbnails) === null || _f === void 0 ? void 0 : _f[0]) === null || _g === void 0 ? void 0 : _g.url,
    };
}
const URL_PATTERNS = {
    video: /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/i,
    playlist: /(?:youtube\.com\/.*[?&]list=|youtube\.com\/playlist\?list=)([\w-]+)/i,
    videoId: /^[\w-]{11}$/,
};
function isYoutubeUrl(input) {
    const trimmed = input.trim();
    return (URL_PATTERNS.video.test(trimmed) ||
        URL_PATTERNS.playlist.test(trimmed) ||
        URL_PATTERNS.videoId.test(trimmed));
}
function parseYoutubeUrl(input) {
    const trimmed = input.trim();
    const videoMatch = trimmed.match(URL_PATTERNS.video);
    const playlistMatch = trimmed.match(URL_PATTERNS.playlist);
    if (URL_PATTERNS.videoId.test(trimmed)) {
        return { videoId: trimmed, playlistId: null };
    }
    return {
        videoId: (videoMatch === null || videoMatch === void 0 ? void 0 : videoMatch[1]) || null,
        playlistId: (playlistMatch === null || playlistMatch === void 0 ? void 0 : playlistMatch[1]) || null,
    };
}
async function getVideoInfo(videoId) {
    const data = {
        context: {
            client: {
                hl: "zh-CN",
                gl: "US",
                clientName: "WEB",
                clientVersion: "2.20231121.08.00",
                userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
            },
            user: { lockedSafetyMode: false },
            request: { useSsl: true },
        },
        videoId,
    };
    const res = await axios_1.default.post("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
    });
    return res.data;
}
async function getPlaylistItems(playlistId) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z;
    const items = [];
    const clientContext = {
        client: {
            hl: "zh-CN",
            gl: "US",
            clientName: "WEB",
            clientVersion: "2.20231121.08.00",
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
        },
        user: { lockedSafetyMode: false },
        request: { useSsl: true },
    };
    try {
        const res = await axios_1.default.post("https://www.youtube.com/youtubei/v1/browse?prettyPrint=false", JSON.stringify({
            context: clientContext,
            browseId: `VL${playlistId}`,
        }), {
            headers: { "Content-Type": "application/json" },
        });
        const contents = ((_p = (_o = (_m = (_l = (_k = (_j = (_h = (_g = (_f = (_e = (_d = (_c = (_b = (_a = res.data) === null || _a === void 0 ? void 0 : _a.contents) === null || _b === void 0 ? void 0 : _b.twoColumnBrowseResultsRenderer) === null || _c === void 0 ? void 0 : _c.tabs) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.tabRenderer) === null || _f === void 0 ? void 0 : _f.content) === null || _g === void 0 ? void 0 : _g.sectionListRenderer) === null || _h === void 0 ? void 0 : _h.contents) === null || _j === void 0 ? void 0 : _j[0]) === null || _k === void 0 ? void 0 : _k.itemSectionRenderer) === null || _l === void 0 ? void 0 : _l.contents) === null || _m === void 0 ? void 0 : _m[0]) === null || _o === void 0 ? void 0 : _o.playlistVideoListRenderer) === null || _p === void 0 ? void 0 : _p.contents) || [];
        for (const content of contents) {
            if (content.playlistVideoRenderer) {
                const video = content.playlistVideoRenderer;
                items.push({
                    id: video.videoId,
                    title: ((_s = (_r = (_q = video.title) === null || _q === void 0 ? void 0 : _q.runs) === null || _r === void 0 ? void 0 : _r[0]) === null || _s === void 0 ? void 0 : _s.text) || ((_t = video.title) === null || _t === void 0 ? void 0 : _t.simpleText),
                    artist: ((_w = (_v = (_u = video.shortBylineText) === null || _u === void 0 ? void 0 : _u.runs) === null || _v === void 0 ? void 0 : _v[0]) === null || _w === void 0 ? void 0 : _w.text) || "Unknown",
                    artwork: (_z = (_y = (_x = video.thumbnail) === null || _x === void 0 ? void 0 : _x.thumbnails) === null || _y === void 0 ? void 0 : _y[0]) === null || _z === void 0 ? void 0 : _z.url,
                });
            }
        }
    }
    catch (error) {
        console.warn("Failed to fetch YouTube playlist:", error);
    }
    return items;
}
async function resolveYoutubeUrl(input) {
    var _a, _b, _c;
    const { videoId, playlistId } = parseYoutubeUrl(input);
    if (playlistId) {
        try {
            const items = await getPlaylistItems(playlistId);
            if (items.length > 0) {
                return {
                    type: "playlist",
                    data: items,
                };
            }
        }
        catch (error) {
            console.warn("Failed to resolve YouTube playlist:", error);
        }
    }
    if (videoId) {
        try {
            const info = await getVideoInfo(videoId);
            const details = info.videoDetails;
            if (details) {
                return {
                    type: "single",
                    data: [
                        {
                            id: details.videoId,
                            title: details.title,
                            artist: details.author,
                            artwork: (_c = (_b = (_a = details.thumbnail) === null || _a === void 0 ? void 0 : _a.thumbnails) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.url,
                        },
                    ],
                };
            }
        }
        catch (error) {
            console.warn("Failed to resolve YouTube video:", error);
        }
    }
    return null;
}
let lastQuery;
let musicContinToken;
async function searchMusic(query, page) {
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
                userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0,gzip(gfe)",
                clientName: "WEB",
                clientVersion: "2.20231121.08.00",
                osName: "Windows",
                osVersion: "10.0",
                platform: "DESKTOP",
                userInterfaceTheme: "USER_INTERFACE_THEME_LIGHT",
                browserName: "Edge Chromium",
                browserVersion: "119.0.0.0",
                acceptHeader: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
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
    const response = (await (0, axios_1.default)(config)).data;
    const contents = response.contents.twoColumnSearchResultsRenderer.primaryContents
        .sectionListRenderer.contents;
    const isEndItem = contents.find((it) => {
        var _a, _b, _c;
        return ((_c = (_b = (_a = it.continuationItemRenderer) === null || _a === void 0 ? void 0 : _a.continuationEndpoint) === null || _b === void 0 ? void 0 : _b.continuationCommand) === null || _c === void 0 ? void 0 : _c.request) === "CONTINUATION_REQUEST_TYPE_SEARCH";
    });
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
        if (page === 1 && isYoutubeUrl(query)) {
            const resolved = await resolveYoutubeUrl(query);
            if (resolved) {
                return {
                    isEnd: true,
                    data: resolved.data,
                };
            }
        }
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
    }
    else if (label === "tiny") {
        return "low";
    }
    else if (label === "medium") {
        return "high";
    }
    else if (label === "large") {
        return "super";
    }
    else {
        return "standard";
    }
}
async function getMediaSource(musicItem, quality) {
    var _a, _b;
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
                userAgent: "com.google.android.apps.youtube.music/6.14.50 (Linux; U; Android 13; GB) gzip",
                clientName: "ANDROID_MUSIC",
                clientVersion: "6.14.50",
                osName: "Android",
                osVersion: "13",
                originalUrl: "https://www.youtube.com/tv?is_account_switch=1&hrld=1&fltor=1",
                theme: "CLASSIC",
                platform: "MOBILE",
                clientFormFactor: "UNKNOWN_FORM_FACTOR",
                webpSupport: false,
                timeZone: "Europe/Amsterdam",
                acceptHeader: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
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
    const result = (await (0, axios_1.default)(config)).data;
    const formats = (_a = result.streamingData.formats) !== null && _a !== void 0 ? _a : [];
    const adaptiveFormats = (_b = result.streamingData.adaptiveFormats) !== null && _b !== void 0 ? _b : [];
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
    srcUrl: "https://gitee.com/maotoumao/MusicFreePlugins/raw/v0.1/dist/youtube/index.js",
    cacheControl: "no-cache",
    search,
    getMediaSource,
};
