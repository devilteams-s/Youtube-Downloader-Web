#!/usr/bin/env python3
"""
YouTube Video Downloader - Çok İş Parçacıklı (Multi-threaded) Yerel Sunucu ve API
yt-dlp ve ffmpeg entegrasyonu ile tam donanımlı video/ses indirme motoru.
"""

import http.server
import socketserver
import json
import os
import sys
import threading
import time
import urllib.parse
import webbrowser
import uuid

try:
    import yt_dlp
except ImportError:
    print("[HATA] yt-dlp kütüphanesi bulunamadı! Lütfen 'pip install yt-dlp' komutunu çalıştırın.")
    sys.exit(1)

PORT = 5180
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOADS_DIR = os.path.join(BASE_DIR, "downloads")
os.makedirs(DOWNLOADS_DIR, exist_ok=True)

# İndirme görevleri takip sözlüğü
tasks = {}

def format_bytes(size):
    if not size:
        return "Bilinmiyor"
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size < 1024.0:
            return f"{size:.1f} {unit}"
        size /= 1024.0
    return f"{size:.1f} TB"

def format_speed(speed):
    if not speed:
        return "0 KB/s"
    return f"{format_bytes(speed)}/s"

def format_eta(seconds):
    if not seconds:
        return "--"
    seconds = int(seconds)
    m, s = divmod(seconds, 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h}s {m}d {s}sn"
    return f"{m}d {s}sn"

def clean_youtube_url(url):
    try:
        parsed = urllib.parse.urlparse(url.strip())
        if "youtube.com" in parsed.netloc and "/watch" in parsed.path:
            qs = urllib.parse.parse_qs(parsed.query)
            if "v" in qs:
                return f"https://www.youtube.com/watch?v={qs['v'][0]}"
    except Exception:
        pass
    return url.strip()

def run_download_thread(task_id, url, download_type, format_id):
    url = clean_youtube_url(url)
    task = tasks[task_id]
    task["status"] = "downloading"
    task["start_time"] = time.time()

    def progress_hook(d):
        if d['status'] == 'downloading':
            total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
            downloaded = d.get('downloaded_bytes') or 0
            speed = d.get('speed') or 0
            eta = d.get('eta') or 0
            percent = (downloaded / total * 100) if total > 0 else 0

            task["percent"] = round(percent, 1)
            task["downloaded_str"] = format_bytes(downloaded)
            task["total_str"] = format_bytes(total)
            task["speed_str"] = format_speed(speed)
            task["eta_str"] = format_eta(eta)
        elif d['status'] == 'finished':
            task["status"] = "processing"
            task["percent"] = 99.0
            task["speed_str"] = "İşleniyor..."
            task["eta_str"] = "FFmpeg dönüştürme"

    out_tmpl = os.path.join(DOWNLOADS_DIR, '%(title).100s-%(id)s.%(ext)s')

    ydl_opts = {
        'outtmpl': out_tmpl,
        'progress_hooks': [progress_hook],
        'quiet': True,
        'no_warnings': True,
        'socket_timeout': 30,
        'retries': 5,
        'noplaylist': True
    }

    if download_type == "audio":
        ydl_opts.update({
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '320',
            }],
        })
    else:
        # Video
        if format_id and format_id != "best":
            ydl_opts['format'] = f"{format_id}+bestaudio/best"
        else:
            ydl_opts['format'] = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'
        ydl_opts['merge_output_format'] = 'mp4'

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            saved_filename = ydl.prepare_filename(info)
            if download_type == "audio":
                base, _ = os.path.splitext(saved_filename)
                saved_filename = base + ".mp3"
            
            task["status"] = "completed"
            task["percent"] = 100
            task["filename"] = os.path.basename(saved_filename)
            task["filepath"] = saved_filename
            task["title"] = info.get("title", "Video")
            print(f"[\033[92mBAŞARILI\033[0m] İndirme tamamlandı: {task['filename']}")
    except Exception as e:
        task["status"] = "error"
        task["error"] = str(e)
        print(f"[\033[91mHATA\033[0m] İndirme başarısız: {e}")


class DownloaderHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def log_message(self, format, *args):
        # Temiz ve renkli loglama
        status_color = "\033[92m" if "200" in str(args[1]) else "\033[93m"
        sys.stdout.write(f"[{status_color}YT-Downloader\033[0m] {args[0]} -> {args[1]}\n")

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path == '/api/info':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            try:
                data = json.loads(body.decode('utf-8'))
                raw_url = data.get('url', '').strip()
                if not raw_url:
                    self.send_json({'error': 'Lütfen geçerli bir YouTube linki girin.'}, 400)
                    return

                url = clean_youtube_url(raw_url)
                print(f"[\033[96mANALİZ\033[0m] Video inceleniyor: {url}")

                ydl_opts = {
                    'skip_download': True,
                    'no_warnings': True,
                    'quiet': True,
                    'socket_timeout': 15,
                    'noplaylist': True
                }
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(url, download=False)
                    
                    formats = []
                    seen_res = set()
                    
                    for f in info.get('formats', []):
                        vcodec = f.get('vcodec', 'none')
                        height = f.get('height')
                        filesize = f.get('filesize') or f.get('filesize_approx')
                        
                        if vcodec != 'none' and height and height >= 144:
                            res_label = f"{height}p"
                            if res_label not in seen_res:
                                seen_res.add(res_label)
                                formats.append({
                                    'format_id': f.get('format_id'),
                                    'resolution': res_label,
                                    'height': height,
                                    'ext': f.get('ext', 'mp4'),
                                    'filesize_str': format_bytes(filesize) if filesize else "Değişken",
                                    'fps': f.get('fps', 30)
                                })

                    formats.sort(key=lambda x: x['height'], reverse=True)

                    duration_sec = info.get('duration', 0)
                    m, s = divmod(duration_sec, 60)
                    h, m = divmod(m, 60)
                    duration_str = f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"

                    response_data = {
                        'title': info.get('title', 'YouTube Videosu'),
                        'uploader': info.get('uploader') or info.get('channel', 'Bilinmeyen Kanal'),
                        'thumbnail': info.get('thumbnail'),
                        'duration_str': duration_str,
                        'view_count': info.get('view_count', 0),
                        'formats': formats,
                        'url': url
                    }
                    print(f"[\033[92mHAZIR\033[0m] {response_data['title']} ({duration_str})")
                    self.send_json(response_data)
            except Exception as e:
                err_msg = str(e)
                print(f"[\033[91mHATA\033[0m] Analiz hatası: {err_msg}")
                self.send_json({'error': f"Video bilgisi alınamadı: {err_msg}"}, 500)
            return

        elif parsed.path == '/api/download':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            try:
                data = json.loads(body.decode('utf-8'))
                url = data.get('url', '').strip()
                download_type = data.get('type', 'video')
                format_id = data.get('format_id', 'best')

                task_id = str(uuid.uuid4())
                tasks[task_id] = {
                    'id': task_id,
                    'url': url,
                    'type': download_type,
                    'status': 'queued',
                    'percent': 0,
                    'downloaded_str': '0 MB',
                    'total_str': '--',
                    'speed_str': '--',
                    'eta_str': '--',
                    'filename': None,
                    'filepath': None,
                    'title': 'Hazırlanıyor...',
                    'error': None
                }

                thread = threading.Thread(
                    target=run_download_thread,
                    args=(task_id, url, download_type, format_id),
                    daemon=True
                )
                thread.start()

                print(f"[\033[95mİNDİRME BAŞLADI\033[0m] Tür: {download_type} | Task ID: {task_id[:8]}")
                self.send_json({'task_id': task_id, 'status': 'queued'})
            except Exception as e:
                self.send_json({'error': str(e)}, 500)
            return

        super().do_POST()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path == '/favicon.ico':
            self.send_response(204)
            self.end_headers()
            return

        elif parsed.path == '/api/progress':
            query = urllib.parse.parse_qs(parsed.query)
            task_id = query.get('id', [None])[0]
            if not task_id or task_id not in tasks:
                self.send_json({'error': 'Geçersiz görev ID'}, 404)
                return
            self.send_json(tasks[task_id])
            return

        elif parsed.path == '/api/downloads':
            file_list = []
            if os.path.exists(DOWNLOADS_DIR):
                for f in sorted(os.listdir(DOWNLOADS_DIR), key=lambda x: os.path.getmtime(os.path.join(DOWNLOADS_DIR, x)), reverse=True):
                    full_p = os.path.join(DOWNLOADS_DIR, f)
                    if os.path.isfile(full_p):
                        size = os.path.getsize(full_p)
                        mtime = os.path.getmtime(full_p)
                        file_list.append({
                            'filename': f,
                            'size_str': format_bytes(size),
                            'date_str': time.strftime('%d.%m.%Y %H:%M', time.localtime(mtime)),
                            'is_audio': f.endswith('.mp3') or f.endswith('.m4a')
                        })
            self.send_json({'files': file_list})
            return

        elif parsed.path == '/api/get-file':
            query = urllib.parse.parse_qs(parsed.query)
            filename = query.get('filename', [None])[0]
            if not filename:
                self.send_error(400, "Dosya adı belirtilmedi")
                return

            safe_name = os.path.basename(filename)
            filepath = os.path.join(DOWNLOADS_DIR, safe_name)
            if not os.path.exists(filepath):
                self.send_error(404, "Dosya bulunamadı")
                return

            size = os.path.getsize(filepath)
            self.send_response(200)
            mime = 'audio/mpeg' if safe_name.endswith('.mp3') else 'video/mp4'
            self.send_header('Content-Type', mime)
            encoded_name = urllib.parse.quote(safe_name)
            self.send_header('Content-Disposition', f"attachment; filename*=UTF-8''{encoded_name}")
            self.send_header('Content-Length', str(size))
            self.send_header('Accept-Ranges', 'bytes')
            self.end_headers()

            with open(filepath, 'rb') as f:
                while chunk := f.read(64 * 1024):
                    self.wfile.write(chunk)
            return

        super().do_GET()

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/delete':
            query = urllib.parse.parse_qs(parsed.query)
            filename = query.get('filename', [None])[0]
            if not filename:
                self.send_json({'error': 'Dosya adı eksik'}, 400)
                return
            safe_name = os.path.basename(filename)
            filepath = os.path.join(DOWNLOADS_DIR, safe_name)
            if os.path.exists(filepath):
                os.remove(filepath)
                print(f"[\033[93mSİLİNDİ\033[0m] {safe_name}")
                self.send_json({'success': True})
            else:
                self.send_json({'error': 'Dosya bulunamadı'}, 404)
            return

        self.send_error(405)


class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def open_browser(url):
    time.sleep(0.8)
    webbrowser.open(url)

def main():
    os.chdir(BASE_DIR)
    url = f"http://localhost:{PORT}"

    print("=" * 65)
    print("▶️  \033[1;31mYouTube Video Downloader Pro (Multi-Threaded)\033[0m")
    print("=" * 65)
    print(f"📂 Dizin:          {BASE_DIR}")
    print(f"📥 İndirmeler:     {DOWNLOADS_DIR}")
    print(f"🌐 Web Arayüzü:    \033[94m{url}\033[0m")
    print(f"👤 Geliştirici:    \033[95m@devilteams-s\033[0m")
    print(f"🛑 Sunucuyu Durdur: Kapatmak için \033[91mCtrl + C\033[0m")
    print("=" * 65 + "\n")

    threading.Thread(target=open_browser, args=(url,), daemon=True).start()

    try:
        with ThreadedHTTPServer(("", PORT), DownloaderHandler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n\n👋 Sunucu başarıyla kapatıldı!")
        sys.exit(0)

if __name__ == '__main__':
    main()
