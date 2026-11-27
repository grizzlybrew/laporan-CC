/* ==================================
   1. PREVIEW DOKUMEN
================================== */

const fields = [
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

let db = null;
let signatureData = "";
let photoData = [];
let saveTimer = null;

function formatDate(value) {
  if (!value) return "";

  const parts = value.split("-");

  return new Date(
    Number(parts[0]),
    Number(parts[1]) - 1,
    Number(parts[2])
  ).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function updatePreview() {
  fields.forEach(id => {
    const preview = document.getElementById("p-" + id);
    const input = document.getElementById(id);

    if (preview && input) {
      preview.textContent = input.value.trim();
    }
  });

  document.getElementById("p-entry").textContent =
    formatDate(document.getElementById("entry").value);

  document.getElementById("p-meetingDate").textContent =
    formatDate(document.getElementById("meetingDate").value);

  const signature = document.getElementById("p-signature");
  const signatureSpace = document.getElementById("signatureSpace");

  if (signatureData) {
    signature.src = signatureData;
    signature.style.display = "block";
    signatureSpace.style.height = "5mm";
  } else {
    signature.removeAttribute("src");
    signature.style.display = "none";
    signatureSpace.style.height = "20mm";
  }

  renderPhotos();
}


/* ==================================
   2. PENYIMPANAN DATABASE
================================== */

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(STORAGE_DB, 1);

    request.onupgradeneeded = function(event) {
      const database = event.target.result;

      if (!database.objectStoreNames.contains(STORAGE_STORE)) {
        database.createObjectStore(STORAGE_STORE, {
          keyPath: "id"
        });
      }
    };

    request.onsuccess = function(event) {
      db = event.target.result;
      resolve(db);
    };

    request.onerror = function() {
      reject(request.error);
    };
  });
}

function saveToDatabase(data) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORAGE_STORE, "readwrite");
    const store = transaction.objectStore(STORAGE_STORE);

    store.put({
      id: STORAGE_ID,
      data: data
    });

    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function readFromDatabase() {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORAGE_STORE, "readonly");
    const request = transaction.objectStore(STORAGE_STORE).get(STORAGE_ID);

    request.onsuccess = () => {
      resolve(request.result ? request.result.data : null);
    };

    request.onerror = () => reject(request.error);
  });
}

function deleteFromDatabase() {
  return new Promise((resolve, reject) => {
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

  const status = document.getElementById("saveStatus");
  status.textContent = "Menyimpan perubahan...";

  saveTimer = setTimeout(async () => {
    if (!db) {
      status.textContent = "Penyimpanan otomatis belum tersedia.";
      return;
    }

    try {
      await saveToDatabase(collectFormData());

      status.textContent =
        "✓ Semua data, tanda tangan, dan foto tersimpan otomatis.";
    } catch (error) {
      console.error(error);

      status.textContent =
        "Penyimpanan gagal. Ruang penyimpanan browser mungkin penuh.";
    }
  }, 500);
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

      document.getElementById("photoCount").textContent =
        photoData.length
          ? photoData.length + " foto tersimpan."
          : "Belum ada foto yang diunggah.";

      updatePreview();

      document.getElementById("saveStatus").textContent =
        "✓ Data terakhir, tanda tangan, dan foto berhasil dipulihkan.";

    } else {
      updatePreview();

      document.getElementById("saveStatus").textContent =
        "Data akan tersimpan otomatis saat kamu mengisi formulir.";
    }

  } catch (error) {
    console.error(error);

    document.getElementById("saveStatus").textContent =
      "Data tersimpan tidak dapat dimuat. Coba buka kembali halaman.";
  }
}


/* ==================================
   3. AUTOSAVE SEMUA ISIAN
================================== */

const formInputs = document.querySelectorAll(
  ".form-panel input:not([type=file]), .form-panel textarea"
);

formInputs.forEach(input => {
  input.addEventListener("input", function() {
    updatePreview();
    saveForm();
  });

  input.addEventListener("change", function() {
    updatePreview();
    saveForm();
  });
});


/* ==================================
   4. FILE KE DATA URL
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
        const ratio = Math.min(
          maxDimension / width,
          maxDimension / height
        );

        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, width, height);

      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };

    image.onerror = reject;
    image.src = originalData;
  });
}


/* ==================================
   5. UPLOAD TANDA TANGAN
================================== */

document.getElementById("signatureInput")
.addEventListener("change", async function() {
  const file = this.files[0];

  if (!file) return;

  if (!file.type.startsWith("image/")) {
    alert("Silakan pilih file gambar.");
    this.value = "";
    return;
  }

  try {
    signatureData = await fileToDataURL(file);

    updatePreview();
    saveForm();

  } catch (error) {
    console.error(error);
    alert("Tanda tangan gagal dibaca. Silakan coba kembali.");
  }
});


/* ==================================
   6. UPLOAD DAN PREVIEW DOKUMENTASI
================================== */

function renderPhotos() {
  const container = document.getElementById("photoPages");
  container.innerHTML = "";

  if (!photoData.length) {
    container.innerHTML = `
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

  // Dua foto per halaman dokumentasi.
  for (let i = 0; i < photoData.length; i += 2) {
    const page = document.createElement("div");
    page.className = "page";

    const title = document.createElement("div");
    title.className = "page-two-title";
    title.textContent = "DOKUMENTASI";
    page.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "photo-grid";
    grid.style.gridTemplateRows = "1fr 1fr";

    photoData.slice(i, i + 2).forEach(photo => {
      const item = document.createElement("div");
      item.className = "photo-item";
      item.style.height = "82mm";

      const img = document.createElement("img");
      img.alt = "Dokumentasi Case Conference";
      img.src = photo;

      item.appendChild(img);
      grid.appendChild(item);
    });

    page.appendChild(grid);
    container.appendChild(page);
  }
}

document.getElementById("photoInput")
.addEventListener("change", async function() {
  const files = Array.from(this.files || []);
  const validFiles = files.filter(file => file.type.startsWith("image/"));

  if (!validFiles.length) return;

  try {
    document.getElementById("photoCount").textContent =
      "Memproses " + validFiles.length + " foto...";

    const newPhotos = await Promise.all(
      validFiles.map(file => compressPhoto(file))
    );

    // Foto baru ditambahkan ke dokumentasi yang sudah ada.
    photoData = photoData.concat(newPhotos);

    document.getElementById("photoCount").textContent =
      photoData.length + " foto tersimpan.";

    updatePreview();
    saveForm();

    this.value = "";

  } catch (error) {
    console.error(error);
    alert("Ada foto yang gagal diproses. Silakan coba kembali.");
  }
});

/* ==================================
   7. EKSPOR PDF LANGSUNG KE LAPTOP
================================== */

async function exportPDF() {
  const button = document.querySelector(".export");
  const originalText = button.textContent;
  const previewArea = document.querySelector(".preview-area");
  const originalStyle = previewArea.getAttribute("style");
  let temporaryStyle = null;

  button.disabled = true;
  button.textContent = "Membuat PDF...";

  try {
    if (typeof html2pdf === "undefined") {
      throw new Error("Komponen ekspor PDF belum berhasil dimuat. Periksa koneksi internet.");
    }

    clearTimeout(saveTimer);
    updatePreview();
    if (db) await saveToDatabase(collectFormData());

    // Render area pratinjau yang asli. Tidak membuat cloneNode atau
    // memindahkan konten ke elemen tersembunyi yang berisiko menjadi blank.
    const report = previewArea.querySelector(":scope > .page");
    if (!report || !report.querySelector(".document-title")) {
      throw new Error("Isi laporan tidak ditemukan. Muat ulang halaman lalu coba lagi.");
    }

    const visibleText = report.innerText.trim();
    if (!visibleText) {
      throw new Error("Pratinjau laporan masih kosong. Isi formulir terlebih dahulu.");
    }

    // Paksa area pratinjau menjadi bidang A4 yang dapat dibaca html2canvas.
    previewArea.style.width = "794px";
    previewArea.style.maxWidth = "none";
    previewArea.style.margin = "0";
    previewArea.style.padding = "0";
    previewArea.style.overflow = "visible";
    previewArea.style.background = "#ffffff";
    previewArea.style.position = "absolute";
    previewArea.style.left = "0";
    previewArea.style.top = "0";
    previewArea.style.zIndex = "999999";

    temporaryStyle = document.createElement("style");
    temporaryStyle.textContent = `
      .preview-area > .page,
      .preview-area #photoPages .page {
        width: 210mm !important;
        max-width: 210mm !important;
        margin: 0 !important;
        box-shadow: none !important;
        background: #fff !important;
        color: #111 !important;
        box-sizing: border-box !important;
      }
      .preview-area > .page {
        min-height: 0 !important;
        height: auto !important;
        padding: 18mm 25mm 20mm !important;
        overflow: visible !important;
      }
      .preview-area #photoPages {
        display: block !important;
        width: 210mm !important;
        break-before: page !important;
        page-break-before: always !important;
      }
      .preview-area #photoPages .page {
        height: 297mm !important;
        min-height: 297mm !important;
        padding: 18mm 25mm 20mm !important;
        overflow: hidden !important;
        break-after: page !important;
        page-break-after: always !important;
      }
      .preview-area #photoPages .page:last-child {
        break-after: auto !important;
        page-break-after: auto !important;
      }
      .preview-area #photoPages .photo-grid {
        display: grid !important;
        grid-template-columns: 1fr !important;
        grid-template-rows: 1fr 1fr !important;
        gap: 8mm !important;
      }
      .preview-area #photoPages .photo-item {
        height: 82mm !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        break-inside: avoid !important;
      }
      .preview-area #photoPages img {
        max-width: 100% !important;
        max-height: 82mm !important;
        object-fit: contain !important;
      }
      .preview-area .document-row .value {
        white-space: pre-wrap !important;
        overflow-wrap: anywhere !important;
      }
      .preview-area .signature { break-inside: avoid !important; }
    `;
    document.head.appendChild(temporaryStyle);

    // Tunggu gambar yang sudah tersedia selesai didekode. Gambar logo eksternal
    // yang gagal dimuat tidak akan menggagalkan seluruh proses PDF.
    const images = Array.from(previewArea.querySelectorAll("img"));
    await Promise.all(images.map(img => {
      if (typeof img.decode === "function") return img.decode().catch(() => {});
      if (img.complete) return Promise.resolve();
      return new Promise(resolve => {
        img.onload = resolve;
        img.onerror = resolve;
      });
    }));

    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const options = {
      margin: 0,
      filename: "Laporan_Hasil_Case_Conference.pdf",
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
        logging: true,
        scrollX: 0,
        scrollY: 0,
        windowWidth: 1200
      },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait", compress: true },
      pagebreak: { mode: ["css", "legacy"], avoid: [".signature", ".photo-item"] }
    };

    await html2pdf().set(options).from(previewArea).save();

  } catch (error) {
    console.error("Gagal mengekspor PDF:", error);
    alert("PDF gagal dibuat: " + (error && error.message ? error.message : "Kesalahan tidak diketahui"));
  } finally {
    if (temporaryStyle) temporaryStyle.remove();
    if (originalStyle === null) previewArea.removeAttribute("style");
    else previewArea.setAttribute("style", originalStyle);
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

  document.getElementById("city").value = "Jakarta";

  document.getElementById("signatureInput").value = "";
  document.getElementById("photoInput").value = "";

  signatureData = "";
  photoData = [];

  document.getElementById("photoCount").textContent =
    "Belum ada foto yang diunggah.";

  try {
    if (db) {
      await deleteFromDatabase();
    }

    updatePreview();

    document.getElementById("saveStatus").textContent =
      "Formulir telah direset.";

  } catch (error) {
    console.error(error);
    alert("Data gagal dihapus dari penyimpanan browser.");
  }
}


/* ==================================
   9. INISIALISASI
================================== */

async function initialize() {
  try {
    await openDatabase();
    await loadForm();

  } catch (error) {
    console.error(error);

    document.getElementById("saveStatus").textContent =
      "Browser tidak dapat mengaktifkan penyimpanan otomatis.";
  }
}

initialize();
