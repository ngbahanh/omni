# Prompt — Tool: media-downloader

```
Đọc .agents/rules/CONTEXT.md, TOOLS_REGISTRY.md, và GUIDELINES.md trước khi làm bất cứ điều gì.

---

Tạo tool tên là "media-downloader" cho project omni.
Đây là tool phức tạp — hãy đọc kỹ toàn bộ spec trước khi bắt đầu code.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 1. TỔNG QUAN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Tool nhận URL của kênh/profile/user/post từ YouTube, TikTok, Instagram, Facebook, hoặc X (Twitter).
Tự động nhận diện platform và loại URL (channel, profile, single post, playlist...).
Hiển thị menu chọn nội dung, sau đó tải ở chất lượng cao nhất.

External binary dependencies:
- yt-dlp     → dùng cho YouTube, TikTok, Instagram (video/reels), Facebook (video), X (video)
- gallery-dl → dùng cho Instagram (ảnh/stories/highlights), X (ảnh/threads), Facebook (ảnh/albums)
- ffmpeg     → required bởi yt-dlp để merge video+audio

Lưu ý quan trọng về giới hạn platform:
- Facebook: hầu hết nội dung yêu cầu đăng nhập. Public page thì video tải được, ảnh cần gallery-dl + cookies.
- X (Twitter): video và ảnh tải được qua yt-dlp/gallery-dl. Từ 2023 X giới hạn nặng — cookies gần như bắt buộc để tránh rate limit. Không hỗ trợ tải toàn bộ timeline trừ khi dùng cookies hợp lệ.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 2. KIỂM TRA DEPENDENCIES KHI KHỞI ĐỘNG
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Khi tool khởi động, kiểm tra tất cả binary trước khi làm bất cứ điều gì:

Kiểm tra: yt-dlp, gallery-dl, ffmpeg
Dùng child_process để chạy `which <binary>` (macOS/Linux) hoặc `where <binary>` (Windows).
Detect OS bằng process.platform.

Nếu thiếu binary nào, hiển thị bảng tổng hợp:

  ┌─────────────────────────────────────────────────┐
  │  Missing dependencies                           │
  ├──────────────┬──────────┬────────────────────── │
  │  Binary      │  Status  │  Install command      │
  ├──────────────┼──────────┼────────────────────── │
  │  yt-dlp      │  ✖ Missing│  brew install yt-dlp │
  │  gallery-dl  │  ✔ OK    │  -                    │
  │  ffmpeg      │  ✖ Missing│  brew install ffmpeg  │
  └─────────────────────────────────────────────────┘

  Windows install commands:
    yt-dlp   → winget install yt-dlp
    ffmpeg   → winget install ffmpeg
    gallery-dl → pip install gallery-dl

  Linux install commands:
    yt-dlp   → pip install yt-dlp  hoặc  sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && sudo chmod a+rx /usr/local/bin/yt-dlp
    ffmpeg   → sudo apt install ffmpeg
    gallery-dl → pip install gallery-dl

Nếu thiếu yt-dlp hoặc ffmpeg → thoát tool ngay (không thể hoạt động).
Nếu thiếu gallery-dl → cảnh báo nhưng vẫn chạy, chỉ disable các tính năng Instagram cần gallery-dl.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 3. NHẬN DIỆN URL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Hỗ trợ nhận diện đầy đủ các dạng URL sau:

### YouTube
- Channel handle:   https://www.youtube.com/@mkbhd
- Channel ID:       https://www.youtube.com/channel/UCBcRF18a7Qf58cCRy5xuWwQ
- User URL:         https://www.youtube.com/user/mkbhd
- Videos tab:       https://www.youtube.com/@mkbhd/videos
- Shorts tab:       https://www.youtube.com/@mkbhd/shorts
- Playlists tab:    https://www.youtube.com/@mkbhd/playlists
- Single video:     https://www.youtube.com/watch?v=XXXXXXXXXXX
- Short video:      https://youtube.com/shorts/XXXXXXXXXXX
- Single playlist:  https://www.youtube.com/playlist?list=XXXXXXXXXX
- youtu.be short:   https://youtu.be/XXXXXXXXXXX

### TikTok
- Profile:          https://www.tiktok.com/@khaby.lame
- Single video:     https://www.tiktok.com/@user/video/1234567890
- Short link:       https://vm.tiktok.com/XXXXXX/
- With query params: https://www.tiktok.com/@user?lang=en (strip params, parse username)

### Instagram
- Profile:          https://www.instagram.com/natgeo/
- Profile alt:      https://instagram.com/natgeo
- Single post:      https://www.instagram.com/p/XXXXXXXXXX/
- Single reel:      https://www.instagram.com/reel/XXXXXXXXXX/
- Single story:     https://www.instagram.com/stories/username/1234567890/
- Highlights:       https://www.instagram.com/stories/highlights/XXXXXXXXXX/
- With trailing slash hoặc không đều OK

### Facebook
- Public Page:      https://www.facebook.com/NatGeo
- Public Page alt:  https://facebook.com/NatGeo
- Page ID:          https://www.facebook.com/profile.php?id=123456789
- Single video:     https://www.facebook.com/watch?v=1234567890
- Single video alt: https://www.facebook.com/NatGeo/videos/1234567890
- Video post:       https://www.facebook.com/permalink.php?story_fbid=XX&id=XX
- Photo album:      https://www.facebook.com/media/set/?set=a.XXXXXXXXXX
- Single photo:     https://www.facebook.com/photo?fbid=XXXXXXXXXX
- Short link:       https://fb.watch/XXXXXXX/
- Reel:             https://www.facebook.com/reel/XXXXXXXXXX
- Group video:      https://www.facebook.com/groups/GROUPID/posts/POSTID (cần login + thành viên)

### X (Twitter)
- Profile:          https://twitter.com/NASA
- Profile (new):    https://x.com/NASA
- Single tweet:     https://twitter.com/NASA/status/1234567890
- Single tweet new: https://x.com/NASA/status/1234567890
- With media:       https://twitter.com/user/status/ID (tự detect có media không)
- t.co short link:  https://t.co/XXXXXXXX (resolve redirect rồi detect)
- With query params: ?s=20, ?t=xxx... → strip params trước khi parse

Khi nhận diện thất bại:
- Hiển thị lỗi màu đỏ: "Không nhận diện được URL. Hỗ trợ: YouTube / TikTok / Instagram / Facebook / X (Twitter)"
- Hỏi lại user nhập URL mới — không thoát tool

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 4. INPUT MODE — ĐƠN LẺ HOẶC BATCH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Khi tool mở, hỏi user chọn chế độ nhập:

  ❯ Nhập một URL
    Nhập nhiều URL (batch)
    Xem lịch sử tải gần đây

### Chế độ một URL
Hỏi paste URL → xử lý bình thường theo luồng ở mục 5.

### Chế độ batch
Hiển thị textarea-style prompt (inquirer editor hoặc multi-line input):
"Nhập nhiều URL, mỗi URL một dòng. Nhấn Enter 2 lần hoặc gõ DONE khi xong:"

Sau khi nhận danh sách URL:
- Parse và validate từng URL
- Hiển thị bảng preview:

  #   Platform    Type          Username/ID
  1   YouTube     Channel       @mkbhd
  2   TikTok      Profile       @khaby.lame
  3   Instagram   Profile       natgeo
  4   Facebook    Page          NatGeo
  5   X           Profile       @NASA
  ✖   Unknown     -             https://bad-url.com  (sẽ bị bỏ qua)

- Hỏi confirm trước khi bắt đầu batch
- Chạy lần lượt từng URL, hiển thị progress từng cái
- Tổng kết batch ở cuối: X/Y thành công

### Lịch sử tải
Load từ config, hiển thị 10 URL gần nhất dưới dạng checkbox để chọn tải lại.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 5. MENU LỰA CHỌN NỘI DUNG (PER PLATFORM)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Sau khi nhận diện URL, hiển thị menu phù hợp với platform.
Dùng inquirer checkbox (multi-select) để user có thể chọn nhiều loại cùng lúc.

### 5A. YouTube — URL loại Channel/Profile

  Chọn nội dung muốn tải từ @mkbhd:
  ❯ ◉ Tải toàn bộ (tất cả bên dưới)
    ○ Videos (các video thông thường)
    ○ Shorts
    ○ Live streams đã kết thúc
    ○ Playlists (tất cả playlist public)
    ○ Chọn playlist cụ thể...
    ○ Chỉ tải audio (MP3)
    ○ Chỉ tải thumbnail
    ○ Chỉ tải subtitles/captions

  Nếu chọn "Chọn playlist cụ thể" → dùng yt-dlp để list tất cả playlist của channel
  rồi hiển thị thêm checkbox để user chọn playlist nào.

### 5B. YouTube — URL loại Single video
  Không cần menu chọn loại nội dung.
  Chỉ hỏi:
  - Tải video (mặc định)
  - Tải audio only (MP3)
  - Tải cả video + subtitles
  - Tải thumbnail

### 5C. YouTube — URL loại Playlist
  Hiển thị số lượng video trong playlist (dùng yt-dlp --flat-playlist để count nhanh).
  Hỏi:
  - Tải tất cả video trong playlist
  - Chọn từng video (hiển thị danh sách checkbox với tên từng video)

### 5D. TikTok — URL loại Profile

  Chọn nội dung muốn tải từ @khaby.lame:
  ❯ ◉ Tải toàn bộ
    ○ Videos (video thông thường)
    ○ Ảnh / Slideshow posts
    ○ Pinned videos
    ○ Chỉ tải audio
    ○ Chỉ tải thumbnail/cover

### 5E. TikTok — URL loại Single video
  Tải thẳng, không có menu. Hỏi:
  - Tải video (mặc định)
  - Tải audio only
  - Tải không có watermark (yt-dlp mặc định đã no-watermark)

### 5F. Instagram — URL loại Profile

  Chọn nội dung muốn tải từ natgeo:
  ❯ ◉ Tải toàn bộ
    ○ Posts — ảnh
    ○ Posts — video
    ○ Reels
    ○ Stories (chỉ khả dụng nếu đã đăng nhập)
    ○ Highlights (chỉ khả dụng nếu đã đăng nhập)
    ○ Tagged posts
    ○ Chỉ tải metadata (JSON)

  Nếu chưa đăng nhập → Stories và Highlights hiển thị với note "(yêu cầu đăng nhập)"
  Nếu user chọn Stories/Highlights mà chưa login → chuyển sang luồng đăng nhập (mục 7)

### 5G. Instagram — URL loại Single post/reel
  Tải thẳng. Nếu là carousel (nhiều ảnh) → tải tất cả ảnh trong carousel.

### 5H. Instagram — URL loại Single story hoặc Highlight
  Tải thẳng. Nếu là highlight → tải tất cả story trong highlight đó.

### 5I. Facebook — URL loại Public Page

  Chọn nội dung muốn tải từ NatGeo:
  ❯ ◉ Tải toàn bộ
    ○ Videos (video đăng trên Page)
    ○ Reels
    ○ Ảnh (Albums) — dùng gallery-dl
    ○ Chọn album cụ thể...
    ○ Chỉ tải audio
    ○ Chỉ tải thumbnail/cover

  Lưu ý hiển thị cho user:
  "Facebook giới hạn nội dung với tài khoản chưa đăng nhập.
   Để tải đầy đủ, hãy cấu hình cookies Facebook trong mục Quản lý đăng nhập."

  Nếu chưa có cookies Facebook → tất cả option vẫn hiển thị nhưng thêm note "(có thể cần đăng nhập)"
  Nếu đã có cookies → hiển thị bình thường

  Nếu chọn "Chọn album cụ thể" → dùng gallery-dl để list albums của Page,
  hiển thị checkbox để user chọn album nào.

### 5J. Facebook — URL loại Single video / Reel
  Tải thẳng không cần menu. Hỏi:
  - Tải video (mặc định)
  - Tải audio only
  Dùng yt-dlp. Nếu lỗi "login required" → thông báo và offer đăng nhập.

### 5K. Facebook — URL loại Single photo hoặc Album
  - Single photo → tải thẳng bằng gallery-dl
  - Album → tải tất cả ảnh trong album bằng gallery-dl
  Nếu album private hoặc cần login → thông báo, offer đăng nhập.

### 5L. X (Twitter) — URL loại Profile

  Chọn nội dung muốn tải từ @NASA:
  ❯ ◉ Tải toàn bộ media (ảnh + video)
    ○ Chỉ ảnh (Photos tab)
    ○ Chỉ video
    ○ Tweets kèm media (theo dòng thời gian)
    ○ Chỉ tải audio từ video

  Cảnh báo hiển thị rõ:
  "X (Twitter) giới hạn nặng từ 2023. Cookies gần như bắt buộc để tải đủ.
   Không có cookies → chỉ tải được vài chục tweet gần nhất."

  Nếu chưa có cookies X → hiển thị warning màu vàng, vẫn cho tiếp tục nhưng báo trước giới hạn.
  Nếu đã có cookies X → tải bình thường.

### 5M. X (Twitter) — URL loại Single tweet
  Kiểm tra tweet có media không:
  - Có video → hỏi: Tải video / Tải audio only / Tải cả ảnh thumbnail
  - Có ảnh (1 hoặc nhiều) → tải tất cả ảnh trong tweet
  - Không có media → thông báo "Tweet này không có media để tải" và quay lại menu
  Dùng yt-dlp cho video, gallery-dl cho ảnh.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 6. TÙY CHỌN NÂNG CAO (sau khi chọn nội dung)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Sau khi user chọn loại nội dung, hiển thị thêm:

  Tùy chọn nâng cao: (có thể bỏ qua, nhấn Enter)
  ❯ Không (dùng mặc định)
    Giới hạn số lượng (chỉ tải N video đầu tiên)
    Lọc theo ngày (từ ngày ... đến ngày ...)
    Lọc theo keyword trong tên
    Đặt tên file theo template tùy chỉnh

### Giới hạn số lượng
Hỏi: "Tải tối đa bao nhiêu video? (bỏ trống = không giới hạn)"
Map sang yt-dlp flag: --playlist-end N

### Lọc theo ngày
Hỏi ngày bắt đầu và ngày kết thúc (format YYYYMMDD)
Map sang yt-dlp flag: --dateafter YYYYMMDD --datebefore YYYYMMDD

### Lọc theo keyword
Hỏi keyword → map sang yt-dlp --match-filter "title~=keyword"

### Template tên file
Hiển thị các preset:
- Mặc định: %(title)s [%(id)s].%(ext)s
- Ngày + tiêu đề: %(upload_date)s - %(title)s.%(ext)s
- Số thứ tự: %(playlist_index)s - %(title)s.%(ext)s
- Tùy chỉnh (nhập tay)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 7. XÁC THỰC / ĐĂNG NHẬP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Một số nội dung yêu cầu đăng nhập: Instagram Stories, Highlights, TikTok private...

### 7A. Lưu session bằng cookies (ưu tiên — cách an toàn nhất)

Config lưu đường dẫn tới file cookies per platform:
- instagramCookiesPath
- tiktokCookiesPath
- youtubeCookiesPath

Nếu user chọn nội dung cần đăng nhập và chưa có cookies:

  Nội dung này yêu cầu đăng nhập Instagram.
  Chọn cách xác thực:
  ❯ Dùng file cookies (khuyến nghị)
    Đăng nhập bằng username/password
    Bỏ qua (chỉ tải nội dung public)

#### Dùng file cookies
Hỏi đường dẫn tới file cookies.txt (export từ browser bằng extension "Get cookies.txt LOCALLY")
Validate file tồn tại → lưu path vào config → dùng yt-dlp flag: --cookies <path>
Lần sau không hỏi lại nếu path đã lưu trong config.

#### Đăng nhập username/password
Hỏi username và password (dùng inquirer type: 'password' cho password field).
KHÔNG lưu password vào config hay bất kỳ file nào.
Dùng yt-dlp flag: --username <u> --password <p> chỉ cho session hiện tại.
Sau khi login thành công, hỏi: "Lưu session cookies để dùng lần sau không?"
Nếu có → export cookies và lưu path vào config.

### 7B. Kiểm tra cookies còn hạn không
Khi load cookies từ config, chạy yt-dlp --cookies <path> --simulate trên 1 URL test.
Nếu lỗi authentication → thông báo "Cookies đã hết hạn" → hỏi cập nhật lại.

### 7C. Quản lý session
Thêm sub-menu "Quản lý đăng nhập" trong tool:
- Xem session hiện tại (platform nào đã có cookies)
- Cập nhật cookies cho platform
- Xóa session một platform
- Xóa tất cả session

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 8. XÁC NHẬN TRƯỚC KHI TẢI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Luôn hiển thị summary và xác nhận trước khi bắt đầu tải:

  ┌─────────────────────────────────────────┐
  │  Xác nhận tải xuống                     │
  ├─────────────────────────────────────────┤
  │  Platform   : YouTube                   │
  │  Kênh       : @mkbhd                    │
  │  Nội dung   : Videos, Shorts            │
  │  Giới hạn   : 50 video đầu tiên         │
  │  Chất lượng : Cao nhất (4K nếu có)      │
  │  Subtitles  : Không                     │
  │  Output     : downloads/youtube/@mkbhd/ │
  │  Xác thực   : Không cần                 │
  └─────────────────────────────────────────┘

  ❯ Bắt đầu tải
    Thay đổi tùy chọn
    Hủy

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 9. THỰC HIỆN TẢI VÀ PROGRESS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### 9A. Spawn yt-dlp / gallery-dl

Dùng Node.js child_process.spawn (KHÔNG dùng exec) để stream output realtime.
Parse stdout từng dòng để extract progress.

yt-dlp output patterns cần parse:
- "[download] Downloading video X of Y" → cập nhật counter
- "[download]  45.3% of 234.56MiB at 3.20MiB/s ETA 00:45" → cập nhật progress bar
- "[download] Destination: filepath" → hiển thị tên file đang tải
- "ERROR:" → capture và log vào logger.error

gallery-dl output patterns:
- "# gallery_dl/extractor" lines → bắt đầu item mới
- Progress từng file

### 9B. Hiển thị progress realtime

  Đang tải: @mkbhd — Videos
  ─────────────────────────────────────────
  Video 12/47: The best phones of 2024...
  [████████████░░░░░░░░] 62% — 145MB/234MB — 3.2MB/s — ETA 00:28

  ✔ Hoàn thành: 11 videos
  ✖ Lỗi: 0

Dùng process.stdout.write và ANSI escape codes để update dòng in-place thay vì scroll.

### 9C. Resume downloads

Luôn truyền flag --continue cho yt-dlp (tải tiếp nếu file bị gián đoạn).
Nếu file đã tồn tại và có kích thước đúng → skip, không overwrite.
yt-dlp flag: --no-overwrites --continue

### 9D. Concurrent downloads

Không tải parallel nhiều file cùng lúc để tránh rate limit.
Tải tuần tự từng file một.
Giữa mỗi file: random delay 1-3 giây (tránh bị block).

### 9E. Rate limit handling

Nếu yt-dlp báo lỗi 429 (Too Many Requests) hoặc rate limit:
- Tự động wait 30 giây rồi retry (tối đa 3 lần)
- Hiển thị countdown: "Rate limited. Thử lại sau 30s... (Ctrl+C để hủy)"
- Nếu vẫn lỗi sau 3 lần → skip file đó, log lại, tiếp tục file tiếp theo

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 10. CHẤT LƯỢNG VÀ FLAGS yt-dlp
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### Video quality (mặc định — luôn cao nhất)
--format "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best"
--merge-output-format mp4

### Nếu muốn audio only
--format "bestaudio/best"
--extract-audio
--audio-format mp3
--audio-quality 0  (0 = highest VBR)

### Subtitles (khi user chọn)
--write-subs
--write-auto-subs  (YouTube auto-generated captions)
--sub-langs "vi,en"  (ưu tiên tiếng Việt, fallback tiếng Anh)
--embed-subs  (nhúng sub vào file mp4)

### Thumbnail
--write-thumbnail
--convert-thumbnails jpg

### Metadata
--write-info-json  (lưu metadata dạng JSON)
--add-metadata  (nhúng metadata vào file)

### Tránh bị block
--sleep-interval 1
--max-sleep-interval 3
--sleep-requests 1

### Archive file (tránh tải lại video đã tải)
--download-archive downloads/<platform>/<username>/downloaded.txt
File này ghi lại ID các video đã tải. Lần sau chỉ tải những video mới.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 11. CẤU TRÚC THƯ MỤC OUTPUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

downloads/
├── youtube/
│   └── @mkbhd/
│       ├── videos/
│       │   ├── 2024-01-15 - Why I love this phone [abc123].mp4
│       │   └── ...
│       ├── shorts/
│       ├── live/
│       ├── audio/
│       ├── thumbnails/
│       ├── subtitles/
│       ├── playlists/
│       │   └── Best Tech 2024/
│       │       ├── 001 - Video title [id].mp4
│       │       └── ...
│       └── downloaded.txt    ← archive file
│
├── tiktok/
│   └── @khaby.lame/
│       ├── videos/
│       │   └── 2024-01-15 - video title [id].mp4
│       ├── photos/
│       │   └── 2024-01-15 - post title [id]/
│       │       ├── 1.jpg
│       │       ├── 2.jpg
│       │       └── ...
│       ├── audio/
│       ├── thumbnails/
│       └── downloaded.txt
│
├── instagram/
│   └── natgeo/
│       ├── posts/
│       │   ├── photos/
│       │   │   └── 2024-01-15 [shortcode]/
│       │   │       ├── 1.jpg
│       │   │       └── 2.jpg
│       │   └── videos/
│       │       └── 2024-01-15 - caption [shortcode].mp4
│       ├── reels/
│       │   └── 2024-01-15 - caption [shortcode].mp4
│       ├── stories/
│       │   └── 2024-01-15/
│       │       ├── story_1.jpg
│       │       └── story_2.mp4
│       ├── highlights/
│       │   └── Highlight Name [id]/
│       │       ├── 1.jpg
│       │       └── 2.mp4
│       ├── tagged/
│       └── downloaded.txt
│
├── facebook/
│   └── NatGeo/                        ← tên Page (slug từ URL)
│       ├── videos/
│       │   └── 2024-01-15 - video title [id].mp4
│       ├── reels/
│       │   └── 2024-01-15 - reel title [id].mp4
│       ├── photos/
│       │   ├── album-name [album_id]/
│       │   │   ├── 1.jpg
│       │   │   └── 2.jpg
│       │   └── single/
│       │       └── photo_[fbid].jpg
│       ├── audio/
│       └── downloaded.txt
│
└── x/
    └── @NASA/                         ← username từ URL
        ├── videos/
        │   └── 2024-01-15 - tweet text snippet [tweet_id].mp4
        ├── photos/
        │   └── 2024-01-15 [tweet_id]/
        │       ├── photo_1.jpg        ← tối đa 4 ảnh/tweet
        │       └── photo_2.jpg
        ├── audio/
        └── downloaded.txt

Tất cả thư mục tạo tự động bằng mkdirSync({ recursive: true }) trước khi tải.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 12. TẢI XONG — SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Sau khi tất cả hoàn tất, hiển thị:

  ┌─────────────────────────────────────────────┐
  │  Hoàn thành tải xuống                       │
  ├─────────────────────────────────────────────┤
  │  ✔ Thành công  : 45 files                   │
  │  ↷ Đã tồn tại  : 12 files (skipped)         │
  │  ✖ Lỗi         : 2 files                    │
  │  ⏱ Thời gian   : 4 phút 32 giây             │
  │  📁 Lưu tại    : downloads/youtube/@mkbhd/  │
  ├─────────────────────────────────────────────┤
  │  Files bị lỗi:                              │
  │  - Video title 1 [id] → Rate limited        │
  │  - Video title 2 [id] → Private video       │
  └─────────────────────────────────────────────┘

  ❯ Mở thư mục output
    Retry các file bị lỗi
    Tải kênh/URL khác
    Quay lại menu chính

"Mở thư mục output" → dùng child_process để mở Finder/Explorer/Nautilus tùy OS:
- macOS: open <path>
- Windows: explorer <path>
- Linux: xdg-open <path>

"Retry các file bị lỗi" → tải lại chỉ các file bị lỗi (không tải lại file đã thành công).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 13. ERROR HANDLING ĐẦY ĐỦ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Xử lý từng loại lỗi cụ thể:

| Lỗi | Xử lý |
|-----|-------|
| URL không hợp lệ | Thông báo, hỏi nhập lại |
| Platform không hỗ trợ | Thông báo danh sách platform hỗ trợ |
| Binary không tìm thấy | Bảng hướng dẫn cài, thoát gracefully |
| Cookies hết hạn | Thông báo, offer re-login |
| Private account (không login) | Thông báo, offer đăng nhập |
| Private account (đã login nhưng không follow) | Thông báo rõ lý do |
| Video bị xóa / không tồn tại | Skip, log, tiếp tục |
| Rate limit 429 | Auto retry với countdown |
| Network timeout | Retry 3 lần với exponential backoff |
| Disk full | Dừng ngay, thông báo rõ |
| Permission denied trên output folder | Thông báo, hỏi đường dẫn khác |
| yt-dlp crash (exit code != 0) | Log stderr, hiển thị lỗi, tiếp tục file tiếp theo |
| ffmpeg không merge được | Thử fallback format, log lỗi |
| Ctrl+C giữa chừng | Bắt SIGINT, hỏi "Tiếp tục lần sau không?" nếu có → lưu state |
| Facebook: "You must log in" | Thông báo rõ, offer cấu hình cookies Facebook |
| Facebook: nội dung chỉ dành cho bạn bè | Thông báo rõ lý do, skip |
| Facebook: Group cần thành viên | Thông báo, không thể tải nếu chưa là thành viên |
| X: "Could not authenticate you" | Cookies hết hạn hoặc không hợp lệ → offer re-login |
| X: Tweet không có media | Thông báo "Tweet này không có ảnh/video", quay menu |
| X: Rate limit của X API (429) | Wait 15 phút (đây là window reset của X), hiển thị countdown |
| X: Tweet bị xóa hoặc account bị suspend | Skip, log, tiếp tục |
| X: Account protected (tweets riêng tư) | Thông báo, chỉ tải được nếu đang follow + có cookies |

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 14. CONFIG LƯU LẠI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

File: .agents/config/media-downloader.json

Lưu các trường sau:

{
  "outputDir": "downloads",              // thư mục output gốc
  "defaultQuality": "best",
  "defaultAudioFormat": "mp3",
  "defaultSubLangs": ["vi", "en"],
  "sleepInterval": [1, 3],               // [min, max] giây giữa các file
  "maxRetries": 3,
  "cookiesPaths": {
    "youtube": null,                     // đường dẫn file cookies.txt
    "instagram": null,
    "tiktok": null,
    "facebook": null,                    // gần như bắt buộc để tải đầy đủ
    "x": null                            // gần như bắt buộc từ 2023
  },
  "fileTemplate": "%(upload_date)s - %(title)s [%(id)s].%(ext)s",
  "history": []                          // 10 URL gần nhất
}

Thêm sub-menu "Cài đặt" trong tool cho phép user thay đổi các config này.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 15. SUB-MENU CỦA TOOL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Khi tool khởi động, hiển thị menu chính của tool (trước khi hỏi URL):

  📥 Media Downloader
  ─────────────────────────────────
  ❯ Tải từ URL mới
    Tải nhiều URL (batch)
    Xem lịch sử tải
    Quản lý đăng nhập
    Cài đặt
    Quay lại menu omni

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 16. LOGGING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Dùng logger đã có trong project (src/logger.js).

Log các sự kiện:
- Tool started / exited
- URL received + platform detected
- Download started: { platform, username, types, outputDir }
- Each file downloaded: { file, size, duration }
- Each file skipped: { file, reason }
- Each file errored: { file, error, retries }
- Rate limit hit + retry attempt
- Session/cookies loaded or failed
- Download session summary: { total, success, skipped, errors, duration }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 17. YÊU CẦU KỸ THUẬT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Toàn bộ async/await, không dùng callback
- Dùng child_process.spawn (không phải exec) để stream output
- Dùng import/export (ESM) nhất quán với project
- Không import chalk trực tiếp — dùng ui.* helpers
- Tất cả đường dẫn dùng path.resolve() — không hardcode slash
- Bắt Ctrl+C bằng process.on('SIGINT') để thoát gracefully
- Tất cả inquirer prompts có thể thoát bằng Ctrl+C không crash

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 18. SAU KHI XONG
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Cập nhật .agents/rules/TOOLS_REGISTRY.md — thêm media-downloader
2. Cập nhật .agents/rules/CONTEXT.md — ghi nhận tool mới, dependencies mới (yt-dlp, gallery-dl, ffmpeg)
3. Ghi vào .agents/rules/LESSONS.md:
   - Tại sao dùng spawn thay vì exec
   - Cách parse progress từ yt-dlp stdout
   - Lý do dùng gallery-dl cho Instagram ảnh thay vì yt-dlp
   - Lý do dùng gallery-dl cho Facebook ảnh/albums (yt-dlp không support album)
   - Tại sao X (Twitter) rate limit window là 15 phút (không phải 30 giây như các platform khác)
   - Tại sao cookies gần như bắt buộc cho Facebook và X
   - Cách resolve t.co short link trước khi detect platform X
   - Cách handle SIGINT gracefully
   - Bất kỳ gotcha nào gặp phải trong quá trình build
```
