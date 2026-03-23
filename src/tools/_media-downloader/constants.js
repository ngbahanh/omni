// src/tools/_media-downloader/constants.js
// Shared constants, default config, and yt-dlp flag presets

export const TOOL_NAME = 'media-downloader';

export const DEFAULT_CONFIG = {
  outputDir: 'downloads',
  defaultQuality: 'best',
  defaultAudioFormat: 'mp3',
  defaultSubLangs: ['vi', 'en'],
  sleepInterval: [1, 3],
  maxRetries: 3,
  cookiesPaths: {
    youtube: null,
    instagram: null,
    tiktok: null,
    facebook: null,
    x: null,
  },
  fileTemplate: '%(upload_date)s - %(title)s [%(id)s].%(ext)s',
  history: [],
};

// yt-dlp flag presets
export const YT_DLP_FLAGS = {
  bestVideo: [
    '--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best',
    '--merge-output-format', 'mp4',
  ],
  audioOnly: [
    '--format', 'bestaudio/best',
    '--extract-audio',
    '--audio-format', 'mp3',
    '--audio-quality', '0',
  ],
  subtitles: [
    '--write-subs',
    '--write-auto-subs',
    '--sub-langs', 'vi,en',
    '--embed-subs',
  ],
  thumbnail: [
    '--write-thumbnail',
    '--convert-thumbnails', 'jpg',
  ],
  metadata: [
    '--write-info-json',
    '--add-metadata',
  ],
  antiBlock: [
    '--sleep-interval', '1',
    '--max-sleep-interval', '3',
    '--sleep-requests', '1',
  ],
  resume: [
    '--no-overwrites',
    '--continue',
  ],
};

// Platform identifiers
export const PLATFORMS = {
  YOUTUBE: 'youtube',
  TIKTOK: 'tiktok',
  INSTAGRAM: 'instagram',
  FACEBOOK: 'facebook',
  X: 'x',
};

// URL types
export const URL_TYPES = {
  CHANNEL: 'channel',
  PROFILE: 'profile',
  SINGLE_VIDEO: 'single_video',
  SINGLE_POST: 'single_post',
  SINGLE_REEL: 'single_reel',
  SINGLE_STORY: 'single_story',
  HIGHLIGHTS: 'highlights',
  PLAYLIST: 'playlist',
  SHORTS_TAB: 'shorts_tab',
  VIDEOS_TAB: 'videos_tab',
  PLAYLISTS_TAB: 'playlists_tab',
  ALBUM: 'album',
  SINGLE_PHOTO: 'single_photo',
  PAGE: 'page',
  TWEET: 'tweet',
  SHORT_LINK: 'short_link',
  GROUP_POST: 'group_post',
};

// Content download types
export const CONTENT_TYPES = {
  VIDEOS: 'videos',
  SHORTS: 'shorts',
  LIVE: 'live',
  PLAYLISTS: 'playlists',
  AUDIO: 'audio',
  THUMBNAILS: 'thumbnails',
  SUBTITLES: 'subtitles',
  PHOTOS: 'photos',
  REELS: 'reels',
  STORIES: 'stories',
  HIGHLIGHTS: 'highlights',
  TAGGED: 'tagged',
  METADATA: 'metadata',
  ALL: 'all',
};

// Required and optional dependencies
export const DEPENDENCIES = [
  { name: 'yt-dlp', required: true },
  { name: 'gallery-dl', required: false },
  { name: 'ffmpeg', required: true },
];

// Install commands per OS
export const INSTALL_COMMANDS = {
  darwin: {
    'yt-dlp': 'brew install yt-dlp',
    'gallery-dl': 'brew install gallery-dl',
    'ffmpeg': 'brew install ffmpeg',
  },
  win32: {
    'yt-dlp': 'winget install yt-dlp',
    'gallery-dl': 'pip install gallery-dl',
    'ffmpeg': 'winget install ffmpeg',
  },
  linux: {
    'yt-dlp': 'pip install yt-dlp',
    'gallery-dl': 'pip install gallery-dl',
    'ffmpeg': 'sudo apt install ffmpeg',
  },
};

// Max history entries to keep
export const MAX_HISTORY = 10;

// Rate limit wait times (seconds)
export const RATE_LIMIT_WAIT = {
  default: 30,
  x: 900, // 15 minutes for X/Twitter
};
