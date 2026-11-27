/* ==================================
   1. KONFIGURASI & STATE
================================== */

const TEXT_FIELDS = [
  "name",
  "birth",
  "address",
  "case",
  "referral",
  "assessment",
  "intervention",
  "recommendation",
  "city",
  "officer"
];

const STORAGE_DB = "caseConferenceDatabase";
const STORAGE_STORE = "reports";
const STORAGE_ID = "currentReport";

// Standar Margin A4 (mm): Atas 18, Kanan 25, Bawah 20, Kiri 25
// Lebar area konten = 210 - (25 + 25) = 160mm
const PDF_MARGIN = [18, 25, 20, 25];
const CONTENT_WIDTH_MM = 160;

let db = null;
let signatureData = "";
let photoData = [];
let saveTimer = null;

const dom = {};

function cacheDOM() {
  TEXT_FIELDS.forEach(id => {
    dom["in_" + id] = document.getElementById(id);
    dom["out_" + id] = document.getElementById("p-" + id);
  });

  dom.in_entry = document.getElementById("entry");
  dom.out_entry = document.getElementById("p-entry");
  dom.in_meetingDate = document.getElementById("meetingDate");
  dom.out_meetingDate = document.getElementById("p-meetingDate");

  dom.signatureImg = document.getElementById("p-signature");
  dom.signatureSpace = document.getElementById("signatureSpace");
  dom.signatureInput = document.getElementById("signatureInput");
  dom.clearSignatureBtn = document.getElementById("clearSignatureBtn");

  dom.photoInput = document.getElementById("photoInput");
  dom.photoCount = document.getElementById("photoCount");
  dom.photoThumbList = document.getElementById("photoThumbList");
  dom.photoPages = document.getElementById("photoPages");

  dom.saveStatus = document.getElementById("saveStatus");
  dom.previewArea = document.querySelector(".preview-area");
  dom.exportBtn = document.querySelector(".export");
}

/* ==================================
   2. FORMAT & PREVIEW DOKUMEN
================================== */

function formatDate(value) {
  if (!value) return "";
  const parts = value.split("-");
  if (parts.length !== 3) return value;

  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (isNaN(date.getTime())) return value;

  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function updateTextPreview() {
  TEXT_FIELDS.forEach(id => {
    const input = dom["in_" + id];
    const preview = dom["out_" + id];
    if (preview && input) {
      preview.textContent = input.value.trim();
    }
  });

  dom.out_entry.textContent = formatDate(dom.in_entry.value);
  dom.out_meetingDate.textContent = formatDate(dom.in_meetingDate.value);
}

function updateSignaturePreview() {
  if (signatureData) {
    dom.signatureImg.src = signatureData;
    dom.signatureImg.style.display = "block";
    dom.signatureSpace.style.height = "5mm";
    dom.clearSignatureBtn.style.display = "inline-block";
  } else {
    dom.signatureImg.removeAttribute("src");
    dom.signatureImg.style.display = "none";
    dom.signatureSpace.style.height = "20mm";
    dom.clearSignatureBtn.style.display = "none";
  }
}

function updatePreview() {
  updateTextPreview();
  updateSignaturePreview();
  renderPhotos();
}

/* ==================================
   3. PENYIMPANAN DATABASE (INDEXEDDB)
================================== */

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("Browser tidak mendukung IndexedDB."));
      return;
    }

    const request = indexedDB.open(STORAGE_DB, 1);

    request.onupgradeneeded = function(event) {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(STORAGE_STORE)) {
        database.createObjectStore(STORAGE_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = function(event) {
      db = event.target.result;
      resolve(db);
    };

    request.onerror = () => reject(request.error);
  });
}

function saveToDatabase(data) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("Database belum siap."));
    const transaction = db.transaction(STORAGE_STORE, "readwrite");
    const store = transaction.objectStore(STORAGE_STORE);

    store.put({ id: STORAGE_ID, data });

    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function readFromDatabase() {
  return new Promise((resolve, reject) => {
    if (!db) return resolve(null);
    const transaction = db.transaction(STORAGE_STORE, "readonly");
    const request = transaction.objectStore(STORAGE_STORE).get(STORAGE_ID);

    request.onsuccess = () => resolve(request.result ? request.result.data : null);
    request.onerror = () => reject(request.error);
  });
}

function deleteFromDatabase() {
  return new Promise((resolve, reject) => {
    if (!db) return resolve();
    const transaction = db.transaction(STORAGE_STORE, "readwrite");
    transaction.objectStore(STORAGE_STORE).delete(STORAGE_ID);

    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

function collectFormData() {
  const data = {};
  const formInputs = document.querySelectorAll(
    ".form-panel input:not([type=file]), .form-panel textarea"
  );

  formInputs.forEach(input => {
    data[input.id] = input.value;
  });

  data.signature = signatureData;
  data.photos = photoData;
  return data;
}

function saveForm() {
  clearTimeout(saveTimer);
  dom.saveStatus.textContent = "Menyimpan perubahan...";

  saveTimer = setTimeout(async () => {
    if (!db) {
      dom.saveStatus.textContent = "Penyimpanan otomatis belum tersedia.";
      return;
    }

    try {
      await saveToDatabase(collectFormData());
      dom.saveStatus.textContent =
        "✓ Semua data, tanda tangan, dan foto tersimpan otomatis.";
    } catch (error) {
      console.error(error);
      dom.saveStatus.textContent =
        "Penyimpanan gagal. Ruang penyimpanan browser mungkin penuh.";
    }
  }, 400);
}

async function loadForm() {
  try {
    const data = await readFromDatabase();

    if (data) {
      const formInputs = document.querySelectorAll(
        ".form-panel input:not([type=file]), .form-panel textarea"
      );

      formInputs.forEach(input => {
        if (Object.prototype.hasOwnProperty.call(data, input.id)) {
          input.value = data[input.id];
        }
      });

      signatureData = data.signature || "";
      photoData = Array.isArray(data.photos) ? data.photos : [];

      updatePreview();
      dom.saveStatus.textContent =
        "✓ Data terakhir, tanda tangan, dan foto berhasil dipulihkan.";
    } else {
      updatePreview();
      dom.saveStatus.textContent =
        "Data akan tersimpan otomatis saat kamu mengisi formulir.";
    }
  } catch (error) {
    console.error(error);
    updatePreview();
    dom.saveStatus.textContent =
      "Data tersimpan tidak dapat dimuat. Coba buka kembali halaman.";
  }
}

/* ==================================
   4. KONVERSI & KOMPRESI GAMBAR
================================== */

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function compressPhoto(file) {
  const originalData = await fileToDataURL(file);

  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = function() {
      const maxDimension = 1600;
      let width = image.width;
      let height = image.height;

      if (width > maxDimension || height > maxDimension) {
        const ratio = Math.min(maxDimension / width, maxDimension / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);

      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };

    image.onerror = reject;
    image.src = originalData;
  });
}

/* ==================================
   5. HANDLER TANDA TANGAN
================================== */

function removeSignature() {
  signatureData = "";
  dom.signatureInput.value = "";
  updateSignaturePreview();
  saveForm();
}

/* ==================================
   6. HANDLER & PREVIEW DOKUMENTASI
================================== */

function removePhoto(index) {
  photoData.splice(index, 1);
  renderPhotos();
  saveForm();
}

function renderPhotoThumbnails() {
  dom.photoThumbList.innerHTML = "";
  dom.photoCount.textContent = photoData.length
    ? `${photoData.length} foto tersimpan.`
    : "Belum ada foto yang diunggah.";

  photoData.forEach((src, index) => {
    const wrap = document.createElement("div");
    wrap.className = "thumb-item";

    const img = document.createElement("img");
    img.src = src;
    img.alt = `Foto ${index + 1}`;

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "thumb-del";
    delBtn.title = "Hapus foto ini";
    delBtn.textContent = "×";
    delBtn.onclick = () => removePhoto(index);

    wrap.appendChild(img);
    wrap.appendChild(delBtn);
    dom.photoThumbList.appendChild(wrap);
  });
}

function renderPhotos() {
  renderPhotoThumbnails();
  dom.photoPages.innerHTML = "";

  if (!photoData.length) {
    dom.photoPages.innerHTML = `
      <div class="page">
        <div class="page-two-title">DOKUMENTASI</div>
        <div class="photo-grid">
          <p style="color:#999;text-align:center">
            Dokumentasi akan muncul setelah foto diunggah.
          </p>
        </div>
      </div>
    `;
    return;
  }

  for (let i = 0; i < photoData.length; i += 2) {
    const page = document.createElement("div");
    page.className = "page";

    const title = document.createElement("div");
    title.className = "page-two-title";
    title.textContent = "DOKUMENTASI";
    page.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "photo-grid";

    photoData.slice(i, i + 2).forEach((photo, idx) => {
      const item = document.createElement("div");
      item.className = "photo-item";

      const img = document.createElement("img");
      img.alt = `Dokumentasi Case Conference ${i + idx + 1}`;
      img.src = photo;

      item.appendChild(img);
      grid.appendChild(item);
    });

    page.appendChild(grid);
    dom.photoPages.appendChild(page);
  }
}

/* ==================================
   7. EKSPOR PDF A4 ANTI-BLANK & MARGIN RAPI
================================== */

function getPdfFilename() {
  const rawName = (dom.in_name.value || "").trim();
  if (!rawName) return "Laporan_Hasil_Case_Conference.pdf";

  const safeName = rawName
    .replace(/[^a-zA-Z0-9\s-_]/g, "")
    .trim()
    .replace(/\s+/g, "_");

  return `Laporan_CC_${safeName}.pdf`;
}

// Konversi gambar logo eksternal ke Base64 aman agar tidak memicu taint/blank pada canvas
function logoToBase64(imgEl) {
  return new Promise(resolve => {
    if (!imgEl || !imgEl.getAttribute("src")) return resolve(null);
    if (imgEl.src.startsWith("data:")) return resolve(imgEl.src);

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || 200;
        canvas.height = img.naturalHeight || 200;
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      } catch (e) {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = imgEl.src;
  });
}

async function exportPDF() {
  const button = dom.exportBtn;
  const originalText = button.textContent;
  const mainEl = document.querySelector("main");
  const headerEl = document.querySelector("header");
  const scrollY = window.scrollY;

  let printStage = null;

  button.disabled = true;
  button.textContent = "Membuat PDF...";

  try {
    if (typeof html2pdf === "undefined") {
      throw new Error("Library html2pdf belum termuat. Periksa koneksi internet Anda.");
    }

    clearTimeout(saveTimer);
    updatePreview();
    if (db) await saveToDatabase(collectFormData());

    const sourceReport = dom.previewArea.querySelector(":scope > .page");
    if (!sourceReport) throw new Error("Isi laporan tidak ditemukan.");

    // 1. Amankan logo menjadi Base64
    const safeLogo = await logoToBase64(document.getElementById("kemensosLogo"));

    // 2. Sembunyikan sementara UI utama & tempatkan panggung cetak di aliran dokumen normal (static)
    headerEl.style.display = "none";
    mainEl.style.display = "none";
    window.scrollTo(0, 0);

    printStage = document.createElement("div");
    printStage.id = "pdf-print-stage";
    Object.assign(printStage.style, {
      position: "static",
      width: `${CONTENT_WIDTH_MM}mm`, // 210mm (A4) dikurangi margin kiri 25mm & kanan 25mm
      margin: "0 auto",
      padding: "0",
      background: "#ffffff",
      color: "#111111",
      fontFamily: "Calibri, Arial, sans-serif",
      fontSize: "11pt",
      lineHeight: "1.4"
    });

    // 3. Kloning laporan utama tanpa padding (margin ditangani html2pdf di setiap halaman)
    const clonedReport = sourceReport.cloneNode(true);
    Object.assign(clonedReport.style, {
      display: "block",
      width: "100%",
      minHeight: "0",
      height: "auto",
      margin: "0",
      padding: "0",
      boxShadow: "none",
      background: "#ffffff"
    });

    const clonedLogo = clonedReport.querySelector("#kemensosLogo");
    if (clonedLogo) {
      if (safeLogo) {
        clonedLogo.removeAttribute("crossorigin");
        clonedLogo.src = safeLogo;
      } else {
        clonedLogo.style.display = "none";
      }
    }

    printStage.appendChild(clonedReport);

    // 4. Kloning halaman dokumentasi jika ada foto (mulai di halaman baru)
    if (photoData.length > 0) {
      const photoPageNodes = dom.photoPages.querySelectorAll(".page");
      photoPageNodes.forEach(pageNode => {
        const clonedPhotoPage = pageNode.cloneNode(true);
        Object.assign(clonedPhotoPage.style, {
          display: "block",
          width: "100%",
          minHeight: "0",
          height: "auto",
          margin: "0",
          padding: "0",
          boxShadow: "none",
          background: "#ffffff",
          pageBreakBefore: "always",
          breakBefore: "page"
        });
        printStage.appendChild(clonedPhotoPage);
      });
    }

    document.body.appendChild(printStage);

    // 5. Tunggu semua gambar (logo, TTD, foto) selesai di-decode
    const images = Array.from(printStage.querySelectorAll("img"));
    await Promise.all(
      images.map(img => {
        if (!img.getAttribute("src") || img.style.display === "none") return Promise.resolve();
        if (typeof img.decode === "function") return img.decode().catch(() => {});
        return Promise.resolve();
      })
    );

    await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));

    // 6. Render PDF dengan margin A4 resmi di setiap halaman [Atas, Kanan, Bawah, Kiri]
    const options = {
      margin: PDF_MARGIN,
      filename: getPdfFilename(),
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: false,
        allowTaint: false,
        backgroundColor: "#ffffff",
        scrollX: 0,
        scrollY: 0
      },
      jsPDF: {
        unit: "mm",
        format: "a4",
        orientation: "portrait",
        compress: true
      },
      pagebreak: {
        mode: ["css", "legacy"],
        avoid: [".signature", ".photo-item", ".logo-area", ".document-title"]
      }
    };

    await html2pdf().set(options).from(printStage).save();

  } catch (error) {
    console.error("Gagal mengekspor PDF:", error);
    alert("PDF gagal dibuat: " + (error && error.message ? error.message : "Kesalahan tidak diketahui"));
  } finally {
    // 7. Hapus panggung cetak & kembalikan tampilan layar seperti semula
    if (printStage && printStage.parentNode) {
      printStage.parentNode.removeChild(printStage);
    }
    headerEl.style.display = "";
    mainEl.style.display = "";
    window.scrollTo(0, scrollY);
    button.disabled = false;
    button.textContent = originalText;
  }
}

/* ==================================
   8. RESET FORMULIR
================================== */

async function resetForm() {
  if (!confirm(
    "Yakin ingin menghapus seluruh isian, tanda tangan, dan foto dokumentasi?"
  )) return;

  clearTimeout(saveTimer);

  const formInputs = document.querySelectorAll(
    ".form-panel input:not([type=file]), .form-panel textarea"
  );

  formInputs.forEach(input => {
    input.value = "";
  });

  dom.in_city.value = "Jakarta";
  dom.signatureInput.value = "";
  dom.photoInput.value = "";

  signatureData = "";
  photoData = [];

  try {
    if (db) await deleteFromDatabase();
    updatePreview();
    dom.saveStatus.textContent = "Formulir telah direset.";
  } catch (error) {
    console.error(error);
    alert("Data gagal dihapus dari penyimpanan browser.");
  }
}

/* ==================================
   9. EVENT LISTENERS & INISIALISASI
================================== */

function bindEvents() {
  const formInputs = document.querySelectorAll(
    ".form-panel input:not([type=file]), .form-panel textarea"
  );

  formInputs.forEach(input => {
    input.addEventListener("input", () => {
      updateTextPreview();
      saveForm();
    });
    input.addEventListener("change", () => {
      updateTextPreview();
      saveForm();
    });
  });

  dom.signatureInput.addEventListener("change", async function() {
    const file = this.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Silakan pilih file gambar.");
      this.value = "";
      return;
    }

    try {
      signatureData = await fileToDataURL(file);
      updateSignaturePreview();
      saveForm();
    } catch (error) {
      console.error(error);
      alert("Tanda tangan gagal dibaca. Silakan coba kembali.");
    }
  });

  dom.photoInput.addEventListener("change", async function() {
    const files = Array.from(this.files || []);
    const validFiles = files.filter(file => file.type.startsWith("image/"));

    if (!validFiles.length) return;

    try {
      dom.photoCount.textContent = `Memproses ${validFiles.length} foto...`;

      const newPhotos = await Promise.all(
        validFiles.map(file => compressPhoto(file))
      );

      photoData = photoData.concat(newPhotos);
      renderPhotos();
      saveForm();
      this.value = "";
    } catch (error) {
      console.error(error);
      alert("Ada foto yang gagal diproses. Silakan coba kembali.");
    }
  });
}

async function initialize() {
  cacheDOM();
  bindEvents();

  try {
    await openDatabase();
    await loadForm();
  } catch (error) {
    console.error(error);
    updatePreview();
    dom.saveStatus.textContent =
      "Browser tidak dapat mengaktifkan penyimpanan otomatis.";
  }
}

document.addEventListener("DOMContentLoaded", initialize);
