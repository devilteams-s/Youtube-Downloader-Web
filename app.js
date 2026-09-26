/**
 * YouTube Video Downloader Pro - İstemci Mantığı
 */

// Uygulama Durumu
const state = {
  currentUrl: "",
  videoData: null,
  activeTab: "video", // "video" veya "audio"
  selectedFormatId: "best",
  activeTaskId: null,
  pollInterval: null
};

// DOM Elemanları
const el = {
  urlForm: document.getElementById("url-form"),
  videoUrlInput: document.getElementById("video-url"),
  btnPaste: document.getElementById("btn-paste"),
  btnFetch: document.getElementById("btn-fetch"),
  btnFetchText: document.getElementById("btn-fetch-text"),
  btnFetchSpinner: document.getElementById("btn-fetch-spinner"),

  videoCard: document.getElementById("video-card"),
  videoThumb: document.getElementById("video-thumb"),
  videoDuration: document.getElementById("video-duration"),
  videoTitle: document.getElementById("video-title"),
  videoAuthor: document.getElementById("video-author"),
  videoViews: document.getElementById("video-views"),
  formatsGrid: document.getElementById("formats-grid"),

  tabVideo: document.getElementById("tab-content-video"),
  tabAudio: document.getElementById("tab-content-audio"),
  tabBtns: document.querySelectorAll(".tab-btn"),

  btnStartDownload: document.getElementById("btn-start-download"),
  btnDownloadLabel: document.getElementById("btn-download-label"),

  progressCard: document.getElementById("progress-card"),
  progressVideoTitle: document.getElementById("progress-video-title"),
  progressPercentLabel: document.getElementById("progress-percent-label"),
  progressBarFill: document.getElementById("progress-bar-fill"),
  pStatBytes: document.getElementById("p-stat-bytes"),
  pStatSpeed: document.getElementById("p-stat-speed"),
  pStatEta: document.getElementById("p-stat-eta"),
  downloadSuccessCta: document.getElementById("download-success-cta"),
  btnDirectSave: document.getElementById("btn-direct-save"),

  downloadsList: document.getElementById("downloads-list"),
  btnRefreshLibrary: document.getElementById("btn-refresh-library"),

  playerModal: document.getElementById("player-modal"),
  modalTitle: document.getElementById("modal-title"),
  modalBody: document.getElementById("modal-body"),
  btnCloseModal: document.getElementById("btn-close-modal"),

  toastContainer: document.getElementById("toast-container")
};

// Toast Bildirimi
function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  el.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(100%)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Timeout özellikli Fetch yardımcısı
async function fetchWithTimeout(resource, options = {}) {
  const { timeout = 25000 } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    if (error.name === "AbortError") {
      throw new Error("İstek zaman aşımına uğradı (Sunucu yanıt vermedi).");
    }
    throw error;
  }
}

// Panodan Yapıştır Butonu
el.btnPaste.addEventListener("click", async () => {
  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      const text = await navigator.clipboard.readText();
      if (text) {
        el.videoUrlInput.value = text.trim();
        showToast("Link panodan yapıştırıldı", "info");
        handleFetchVideo();
      } else {
        showToast("Pano boş.", "info");
      }
    } else {
      showToast("Lütfen linki giriş kutusuna elle yapıştırın.", "info");
    }
  } catch (err) {
    showToast("Panoya erişilemedi. Lütfen elle yapıştırın.", "info");
  }
});

// Format Sekmeleri Geçişi
el.tabBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    el.tabBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.activeTab = btn.dataset.tab;

    if (state.activeTab === "video") {
      el.tabVideo.classList.remove("hidden");
      el.tabAudio.classList.add("hidden");
      el.btnDownloadLabel.textContent = "MP4 Videoyu İndir";
    } else {
      el.tabVideo.classList.add("hidden");
      el.tabAudio.classList.remove("hidden");
      el.btnDownloadLabel.textContent = "MP3 Sesi İndir (320kbps)";
    }
  });
});

function cleanYouTubeUrl(rawUrl) {
  try {
    const urlObj = new URL(rawUrl.trim());
    if (urlObj.hostname.includes("youtube.com") && urlObj.pathname.includes("/watch")) {
      const v = urlObj.searchParams.get("v");
      if (v) return `https://www.youtube.com/watch?v=${v}`;
    }
  } catch (e) {}
  return rawUrl.trim();
}

// Video Bilgisini Sunucudan Getirme Fonksiyonu
async function handleFetchVideo() {
  let url = el.videoUrlInput.value.trim();
  if (!url) {
    showToast("Lütfen bir YouTube video bağlantısı girin.", "error");
    return;
  }

  // Temel YouTube URL doğrulama
  if (!url.includes("youtube.com") && !url.includes("youtu.be")) {
    showToast("Lütfen geçerli bir YouTube URL'si girin (youtube.com veya youtu.be).", "error");
    return;
  }

  // Playlist/Mix parametrelerini temizleyip doğrudan videoya odaklan
  url = cleanYouTubeUrl(url);
  el.videoUrlInput.value = url;
  state.currentUrl = url;

  // Yükleniyor durumunu aç
  el.btnFetch.disabled = true;
  el.btnFetchText.textContent = "Analiz Ediliyor...";
  el.btnFetchSpinner.classList.remove("hidden");
  el.videoCard.classList.add("hidden");

  try {
    const res = await fetchWithTimeout("/api/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      timeout: 25000
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Video bilgisi alınamadı.");
    }

    state.videoData = data;
    renderVideoInfo(data);
    showToast("Video bilgileri başarıyla getirildi!", "success");
  } catch (err) {
    console.error("Fetch error:", err);
    showToast(err.message || "Bağlantı hatası oluştu.", "error");
  } finally {
    el.btnFetch.disabled = false;
    el.btnFetchText.textContent = "Videoyu Getir";
    el.btnFetchSpinner.classList.add("hidden");
  }
}

el.urlForm.addEventListener("submit", (e) => {
  e.preventDefault();
  handleFetchVideo();
});

// Video Bilgisini Arayüze Yazdırma
function renderVideoInfo(data) {
  el.videoThumb.src = data.thumbnail || "";
  el.videoDuration.textContent = data.duration_str || "00:00";
  el.videoTitle.textContent = data.title || "YouTube Videosu";
  el.videoAuthor.textContent = data.uploader || "YouTube Kanalı";

  const views = Number(data.view_count || 0).toLocaleString("tr-TR");
  el.videoViews.textContent = `${views} görüntülenme`;

  // Format seçeneklerini listele
  el.formatsGrid.innerHTML = "";

  // En yüksek kalite seçeneği ekle
  const bestChip = document.createElement("div");
  bestChip.className = "format-chip active";
  bestChip.dataset.formatId = "best";
  bestChip.innerHTML = `
    <span class="chip-res">✨ En Yüksek</span>
    <span class="chip-size">Otomatik En İyi</span>
  `;
  bestChip.addEventListener("click", () => selectFormatChip(bestChip, "best"));
  el.formatsGrid.appendChild(bestChip);
  state.selectedFormatId = "best";

  if (data.formats && data.formats.length > 0) {
    data.formats.slice(0, 6).forEach((f) => {
      const chip = document.createElement("div");
      chip.className = "format-chip";
      chip.dataset.formatId = f.format_id;
      chip.innerHTML = `
        <span class="chip-res">${f.resolution}</span>
        <span class="chip-size">${f.fps}fps • ${f.filesize_str}</span>
      `;
      chip.addEventListener("click", () => selectFormatChip(chip, f.format_id));
      el.formatsGrid.appendChild(chip);
    });
  }

  el.videoCard.classList.remove("hidden");
  el.videoCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function selectFormatChip(targetChip, formatId) {
  document.querySelectorAll(".format-chip").forEach((c) => c.classList.remove("active"));
  targetChip.classList.add("active");
  state.selectedFormatId = formatId;
}

// İndirmeyi Başlatma
el.btnStartDownload.addEventListener("click", async () => {
  if (!state.currentUrl) return;

  el.btnStartDownload.disabled = true;
  el.btnDownloadLabel.textContent = "İndirme Başlatılıyor...";

  try {
    const res = await fetchWithTimeout("/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: state.currentUrl,
        type: state.activeTab,
        format_id: state.selectedFormatId
      }),
      timeout: 15000
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "İndirme başlatılamadı.");

    state.activeTaskId = data.task_id;
    startProgressPolling(data.task_id);
    showToast("İndirme görevi arka planda başlatıldı!", "success");
  } catch (err) {
    showToast(err.message, "error");
    el.btnStartDownload.disabled = false;
    el.btnDownloadLabel.textContent = state.activeTab === "video" ? "MP4 Videoyu İndir" : "MP3 Sesi İndir (320kbps)";
  }
});

// İndirme İlerlemesini Takip Etme (Polling)
function startProgressPolling(taskId) {
  if (state.pollInterval) clearInterval(state.pollInterval);

  el.progressCard.classList.remove("hidden");
  el.downloadSuccessCta.classList.add("hidden");
  el.progressVideoTitle.textContent = state.videoData ? state.videoData.title : "Medya Dosyası";
  el.progressCard.scrollIntoView({ behavior: "smooth", block: "nearest" });

  state.pollInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/progress?id=${taskId}`);
      const task = await res.json();

      if (task.status === "downloading" || task.status === "queued" || task.status === "processing") {
        const percent = task.percent || 0;
        el.progressBarFill.style.width = `${percent}%`;
        el.progressPercentLabel.textContent = `${percent.toFixed(0)}%`;
        el.pStatBytes.textContent = `${task.downloaded_str || "0 MB"} / ${task.total_str || "--"}`;
        el.pStatSpeed.textContent = task.speed_str || "--";
        el.pStatEta.textContent = task.eta_str || "--";

        if (task.status === "processing") {
          el.progressPercentLabel.textContent = "99%";
        }
      } else if (task.status === "completed") {
        clearInterval(state.pollInterval);
        state.pollInterval = null;

        el.progressBarFill.style.width = "100%";
        el.progressPercentLabel.textContent = "100%";
        el.pStatSpeed.textContent = "Tamamlandı";
        el.pStatEta.textContent = "0 sn";

        // Doğrudan indirme bağlantısını hazırla
        el.btnDirectSave.href = `/api/get-file?filename=${encodeURIComponent(task.filename)}`;
        el.downloadSuccessCta.classList.remove("hidden");

        showToast("Tebrikler! Dosya başarıyla indirildi.", "success");
        el.btnStartDownload.disabled = false;
        el.btnDownloadLabel.textContent = state.activeTab === "video" ? "MP4 Videoyu İndir" : "MP3 Sesi İndir (320kbps)";

        // Kütüphaneyi yenile
        loadDownloadsLibrary();
      } else if (task.status === "error") {
        clearInterval(state.pollInterval);
        state.pollInterval = null;
        showToast(`İndirme hatası: ${task.error}`, "error");
        el.btnStartDownload.disabled = false;
        el.btnDownloadLabel.textContent = "Tekrar Dene";
      }
    } catch (err) {
      console.error("Progress polling error:", err);
    }
  }, 600);
}

// İndirilen Dosyalar Kütüphanesini Yükleme
async function loadDownloadsLibrary() {
  try {
    const res = await fetch("/api/downloads");
    const data = await res.json();

    if (!data.files || data.files.length === 0) {
      el.downloadsList.innerHTML = `
        <div class="empty-state">
          Henüz indirilmiş dosya bulunmuyor. Yukarıdan bir YouTube bağlantısı girerek indirmeye başlayın.
        </div>
      `;
      return;
    }

    el.downloadsList.innerHTML = "";
    data.files.forEach((file) => {
      const row = document.createElement("div");
      row.className = "file-row";

      const badgeClass = file.is_audio ? "audio" : "video";
      const badgeText = file.is_audio ? "MP3" : "MP4";

      row.innerHTML = `
        <div class="file-info">
          <span class="file-badge ${badgeClass}">${badgeText}</span>
          <div class="file-name-meta">
            <span class="file-name" title="${file.filename}">${file.filename}</span>
            <span class="file-meta">${file.size_str} • ${file.date_str}</span>
          </div>
        </div>
        <div class="file-actions">
          <button class="btn-file-action btn-action-play" data-file="${file.filename}" data-type="${badgeClass}">
            ▶ Oynat
          </button>
          <a class="btn-file-action btn-action-download" href="/api/get-file?filename=${encodeURIComponent(file.filename)}" download>
            📥 İndir
          </a>
          <button class="btn-file-action btn-action-delete" data-file="${file.filename}">
            🗑 Sil
          </button>
        </div>
      `;

      // Oynat
      row.querySelector(".btn-action-play").addEventListener("click", () => {
        openPlayerModal(file.filename, file.is_audio);
      });

      // Sil
      row.querySelector(".btn-action-delete").addEventListener("click", async () => {
        if (confirm(`'${file.filename}' dosyasını silmek istediğinize emin misiniz?`)) {
          await deleteFile(file.filename);
        }
      });

      el.downloadsList.appendChild(row);
    });
  } catch (err) {
    console.error("Library load error:", err);
  }
}

// Dosya Silme
async function deleteFile(filename) {
  try {
    const res = await fetch(`/api/delete?filename=${encodeURIComponent(filename)}`, {
      method: "DELETE"
    });
    if (res.ok) {
      showToast("Dosya başarıyla silindi.", "info");
      loadDownloadsLibrary();
    } else {
      showToast("Dosya silinemedi.", "error");
    }
  } catch (err) {
    showToast(err.message, "error");
  }
}

// Medya Oynatıcı Modalını Açma
function openPlayerModal(filename, isAudio) {
  el.modalTitle.textContent = filename;
  const fileUrl = `/api/get-file?filename=${encodeURIComponent(filename)}`;

  if (isAudio) {
    el.modalBody.innerHTML = `
      <audio controls autoplay style="width: 100%; margin-top: 10px;">
        <source src="${fileUrl}" type="audio/mpeg">
        Tarayıcınız ses etiketini desteklemiyor.
      </audio>
    `;
  } else {
    el.modalBody.innerHTML = `
      <video controls autoplay style="width: 100%; max-height: 480px; border-radius: 8px;">
        <source src="${fileUrl}" type="video/mp4">
        Tarayıcınız video etiketini desteklemiyor.
      </video>
    `;
  }

  el.playerModal.classList.remove("hidden");
}

// Modal Kapatma
function closeModal() {
  el.modalBody.innerHTML = "";
  el.playerModal.classList.add("hidden");
}

el.btnCloseModal.addEventListener("click", closeModal);
el.playerModal.addEventListener("click", (e) => {
  if (e.target === el.playerModal) closeModal();
});

// Kütüphane Yenile Butonu
el.btnRefreshLibrary.addEventListener("click", () => {
  loadDownloadsLibrary();
  showToast("Dosya listesi güncellendi.", "info");
});

// Sayfa Başlangıcı
window.addEventListener("DOMContentLoaded", () => {
  loadDownloadsLibrary();
});
