/* ==================================
   1. KONFIGURASI & STATE
================================== */

const STORAGE_DB = "caseConferenceDatabase";
const STORAGE_STORE = "reports";
const STORAGE_ID = "currentReport";

const LOGO_PRIMARY_URL = "https://grizzlybrew.github.io/laporan-hasil-CC/logo-kemensos.png";
const LOGO_FALLBACK_URL = "./logo%20kemensos.svg";

let db = null;
let signatureData = "";
let photoData = [];
let saveTimer = null;
let cachedLogoDataUrl = null;

const dom = {};

function cacheDOM() {
  const ids = [
    "name", "birth", "address", "case", "referral", "entry",
    "assessment", "intervention", "recommendation",
    "city", "meetingDate", "officer",
    "signatureInput", "clearSignatureBtn",
    "photoInput", "photoCount", "photoThumbList",
    "saveStatus", "pageSummary", "previewArea",
    "reportPages", "photoPages"
  ];

  ids.forEach(id => {
    dom[id] = document.getElementById(id);
  });
  dom.exportBtn = document.querySelector(".export");
}

/* ==================================
   2. FORMAT TANGGAL & DATA LOGO
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

function loadLogoAsDataURL(url) {
  return new Promise(resolve => {
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
    img.src = url;
  });
}

async function ensureSafeLogo() {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;
  cachedLogoDataUrl = await loadLogoAsDataURL(LOGO_PRIMARY_URL);
  if (!cachedLogoDataUrl) {
    cachedLogoDataUrl = await loadLogoAsDataURL(LOGO_FALLBACK_URL);
  }
  return cachedLogoDataUrl;
}

/* ==================================
   3. MESIN PAGINASI A4 REAL-TIME (PARAGRAF UTUH & ANTI-ORPHAN TTD)
================================== */

function createA4Page(container) {
  const page = document.createElement("div");
  page.className = "page";

  const content = document.createElement("div");
  content.className = "page-content";

  page.appendChild(content);
  container.appendChild(page);
  return content;
}

function isOverflowing(pageContent) {
  return pageContent.scrollHeight > pageContent.clientHeight + 1;
}

function buildParagraphElements(text) {
  const normalized = (text || "").trim();
  if (!normalized) return [];

  const rawParagraphs = normalized.split(/\n+/);
  return rawParagraphs.map(pText => {
    const p = document.createElement("p");
    p.className = "doc-paragraph";
    p.textContent = pText.trim();
    return p;
  });
}

function splitParagraphToFit(paragraphEl, valueContainer, pageContent) {
  const fullText = paragraphEl.textContent;
  const words = fullText.split(/\s+/);

  if (words.length <= 1) return null;

  let low = 1;
  let high = words.length - 1;
  let bestFit = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    paragraphEl.textContent = words.slice(0, mid).join(" ");

    if (!isOverflowing(pageContent)) {
      bestFit = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (bestFit === 0) {
    paragraphEl.textContent = fullText;
    return null;
  }

  paragraphEl.textContent = words.slice(0, bestFit).join(" ");
  const remainingText = words.slice(bestFit).join(" ");

  const nextP = document.createElement("p");
  nextP.className = "doc-paragraph";
  nextP.textContent = remainingText;
  return nextP;
}

function appendFlowRow(container, currentPageContent, rowConfig) {
  let activeContent = currentPageContent;

  const createRowShell = (showHeader) => {
    const row = document.createElement("div");
    row.className = rowConfig.isIdentity ? "document-row" : "document-row section-row";
    if (rowConfig.noTopMargin) row.style.marginTop = "0";

    const colNum = document.createElement("div");
    colNum.textContent = showHeader ? rowConfig.num : "";

    const colLabel = document.createElement("div");
    colLabel.textContent = showHeader ? rowConfig.label : "";

    const colColon = document.createElement("div");
    colColon.textContent = showHeader ? ":" : "";

    const colVal = document.createElement("div");
    colVal.className = "value";

    row.append(colNum, colLabel, colColon, colVal);
    return { row, colVal };
  };

  const paragraphs = buildParagraphElements(rowConfig.value);

  if (paragraphs.length === 0) {
    const { row } = createRowShell(true);
    activeContent.appendChild(row);
    if (isOverflowing(activeContent)) {
      activeContent.removeChild(row);
      activeContent = createA4Page(container);
      activeContent.appendChild(row);
    }
    return activeContent;
  }

  let isFirstChunkOfRow = true;
  let shell = createRowShell(true);
  activeContent.appendChild(shell.row);

  if (isOverflowing(activeContent)) {
    activeContent.removeChild(shell.row);
    activeContent = createA4Page(container);
    activeContent.appendChild(shell.row);
  }

  let queue = [...paragraphs];

  while (queue.length > 0) {
    const p = queue.shift();
    shell.colVal.appendChild(p);

    if (isOverflowing(activeContent)) {
      const overflowParagraph = splitParagraphToFit(p, shell.colVal, activeContent);

      if (overflowParagraph) {
        activeContent = createA4Page(container);
        shell = createRowShell(false);
        shell.row.style.marginTop = "0";
        activeContent.appendChild(shell.row);
        queue.unshift(overflowParagraph);
      } else {
        shell.colVal.removeChild(p);

        if (isFirstChunkOfRow && shell.colVal.childNodes.length === 0) {
          activeContent.removeChild(shell.row);
          activeContent = createA4Page(container);
          shell = createRowShell(true);
          activeContent.appendChild(shell.row);
        } else {
          activeContent = createA4Page(container);
          shell = createRowShell(false);
          shell.row.style.marginTop = "0";
          activeContent.appendChild(shell.row);
        }
        queue.unshift(p);
      }
    }

    isFirstChunkOfRow = false;
  }

  return activeContent;
}

function renderReportPages() {
  const container = dom.reportPages;
  container.innerHTML = "";

  let activeContent = createA4Page(container);

  // 1. Logo Kemensos
  const logoArea = document.createElement("div");
  logoArea.className = "logo-area";
  const logoImg = document.createElement("img");
  logoImg.id = "kemensosLogo";
  logoImg.alt = "Logo Kementerian Sosial Republik Indonesia";
  logoImg.src = cachedLogoDataUrl || LOGO_PRIMARY_URL;
  logoImg.onerror = function() {
    this.onerror = null;
    this.src = LOGO_FALLBACK_URL;
  };
  logoArea.appendChild(logoImg);
  activeContent.appendChild(logoArea);

  // 2. Judul Dokumen
  const titleEl = document.createElement("div");
  titleEl.className = "document-title";
  titleEl.textContent = "LAPORAN HASIL CASE CONFERENCE";
  activeContent.appendChild(titleEl);

  // 3. Header Poin 1
  const row1Header = document.createElement("div");
  row1Header.className = "document-row";
  row1Header.innerHTML = `
    <div>1.</div>
    <div>Pembahasan Kasus PM atas nama</div>
    <div></div>
    <div></div>
  `;
  activeContent.appendChild(row1Header);

  // 4. Sub-poin Identitas (a - f)
  const identityWrap = document.createElement("div");
  identityWrap.className = "identity";
  activeContent.appendChild(identityWrap);

  const identityItems = [
    { num: "a.", label: "Nama", value: dom.name.value },
    { num: "b.", label: "Tempat, Tanggal Lahir", value: dom.birth.value },
    { num: "c.", label: "Alamat", value: dom.address.value },
    { num: "d.", label: "Kasus", value: dom.case.value },
    { num: "e.", label: "Rujukan", value: dom.referral.value },
    { num: "f.", label: "Tanggal Masuk", value: formatDate(dom.entry.value) }
  ];

  identityItems.forEach(item => {
    const row = document.createElement("div");
    row.className = "document-row";
    row.innerHTML = `
      <div>${item.num}</div>
      <div>${item.label}</div>
      <div>:</div>
      <div class="value"></div>
    `;
    row.querySelector(".value").textContent = (item.value || "").trim();
    identityWrap.appendChild(row);
  });

  // 5. Poin Utama 2, 3, 4 (Paragraf utuh yang mengalir otomatis antarhalaman A4)
  const mainSections = [
    { num: "2.", label: "Pembahasan Hasil Asesmen", value: dom.assessment.value },
    { num: "3.", label: "Rencana Intervensi", value: dom.intervention.value },
    { num: "4.", label: "Rekomendasi Hasil Kesepakatan", value: dom.recommendation.value }
  ];

  mainSections.forEach(sec => {
    activeContent = appendFlowRow(container, activeContent, sec);
  });

  // 6. Blok Tanda Tangan (Anti-Orphan: tidak akan pernah sendirian di halaman baru)
  const sigBlock = document.createElement("div");
  sigBlock.className = "signature";
  sigBlock.style.marginTop = "10mm";

  const cityText = (dom.city.value || "").trim() || "Jakarta";
  const meetingText = formatDate(dom.meetingDate.value);
  const officerText = (dom.officer.value || "").trim();

  sigBlock.innerHTML = `
    <div class="signature-date">${cityText}, ${meetingText}</div>
    <div>Petugas Pelaksana,</div>
    <div class="signature-space" style="height:${signatureData ? "4mm" : "18mm"}"></div>
    ${signatureData ? `<img src="${signatureData}" alt="Tanda Tangan Petugas">` : ""}
    <div><b></b></div>
  `;
  sigBlock.querySelector("b").textContent = officerText;

  activeContent.appendChild(sigBlock);

  // Jika TTD tidak muat di halaman terakhir, pindahkan TTD beserta penutup teks sebelumnya
  if (isOverflowing(activeContent)) {
    activeContent.removeChild(sigBlock);

    const lastRow = activeContent.lastElementChild;
    let companionRow = null;

    if (lastRow && lastRow.classList.contains("document-row")) {
      const valContainer = lastRow.querySelector(".value");
      const paragraphs = valContainer ? Array.from(valContainer.querySelectorAll(".doc-paragraph")) : [];

      if (paragraphs.length > 1) {
        const lastParagraph = paragraphs[paragraphs.length - 1];
        valContainer.removeChild(lastParagraph);

        companionRow = document.createElement("div");
        companionRow.className = "document-row section-row";
        companionRow.style.marginTop = "0";
        companionRow.innerHTML = `<div></div><div></div><div></div><div class="value"></div>`;
        companionRow.querySelector(".value").appendChild(lastParagraph);
      } else if (paragraphs.length === 1) {
        const p = paragraphs[0];
        const words = p.textContent.trim().split(/\s+/);
        if (words.length > 25) {
          const splitIndex = words.length - 18;
          p.textContent = words.slice(0, splitIndex).join(" ");

          const tailP = document.createElement("p");
          tailP.className = "doc-paragraph";
          tailP.textContent = words.slice(splitIndex).join(" ");

          companionRow = document.createElement("div");
          companionRow.className = "document-row section-row";
          companionRow.style.marginTop = "0";
          companionRow.innerHTML = `<div></div><div></div><div></div><div class="value"></div>`;
          companionRow.querySelector(".value").appendChild(tailP);
        } else {
          activeContent.removeChild(lastRow);
          companionRow = lastRow;
        }
      }
    }

    activeContent = createA4Page(container);
    if (companionRow) {
      activeContent.appendChild(companionRow);
    }
    sigBlock.style.marginTop = "10mm";
    activeContent.appendChild(sigBlock);
  }

  updatePageCounter();
}

function updatePageCounter() {
  const reportCount = dom.reportPages.querySelectorAll(".page").length;
  const docCount = photoData.length > 0 ? Math.ceil(photoData.length / 2) : 1;
  dom.pageSummary.textContent = `Format A4 | ${reportCount} Halaman Laporan + ${docCount} Halaman Dokumentasi`;
}

/* ==================================
   4. HANDLER & PREVIEW DOKUMENTASI
================================== */

function removeSignature() {
  signatureData = "";
  dom.signatureInput.value = "";
  dom.clearSignatureBtn.style.display = "none";
  renderReportPages();
  saveForm();
}

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
        <div class="page-content">
          <div class="page-two-title">DOKUMENTASI</div>
          <div class="photo-grid">
            <p style="color:#999;text-align:center">
              Dokumentasi akan muncul setelah foto diunggah.
            </p>
          </div>
        </div>
      </div>
    `;
    updatePageCounter();
    return;
  }

  for (let i = 0; i < photoData.length; i += 2) {
    const page = document.createElement("div");
    page.className = "page";

    const content = document.createElement("div");
    content.className = "page-content";

    const title = document.createElement("div");
    title.className = "page-two-title";
    title.textContent = "DOKUMENTASI";
    content.appendChild(title);

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

    content.appendChild(grid);
    page.appendChild(content);
    dom.photoPages.appendChild(page);
  }

  updatePageCounter();
}

function updateAllPreviews() {
  dom.clearSignatureBtn.style.display = signatureData ? "inline-block" : "none";
  renderReportPages();
  renderPhotos();
}

/* ==================================
   5. PENYIMPANAN DATABASE (INDEXEDDB)
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

      updateAllPreviews();
      dom.saveStatus.textContent =
        "✓ Data terakhir, tanda tangan, dan foto berhasil dipulihkan.";
    } else {
      updateAllPreviews();
      dom.saveStatus.textContent =
        "Data akan tersimpan otomatis saat kamu mengisi formulir.";
    }
  } catch (error) {
    console.error(error);
    updateAllPreviews();
    dom.saveStatus.textContent =
      "Data tersimpan tidak dapat dimuat. Coba buka kembali halaman.";
  }
}

/* ==================================
   6. KONVERSI & KOMPRESI GAMBAR
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
   7. EKSPOR PDF A4 (1 HALAMAN PRATINJAU = 1 HALAMAN PDF)
================================== */

function getPdfFilename() {
  const rawName = (dom.name.value || "").trim();
  if (!rawName) return "Laporan_Hasil_Case_Conference.pdf";

  const safeName = rawName
    .replace(/[^a-zA-Z0-9\s-_]/g, "")
    .trim()
    .replace(/\s+/g, "_");

  return `Laporan_CC_${safeName}.pdf`;
}

async function exportPDF() {
  const button = dom.exportBtn;
  const originalText = button.textContent;
  const headerEl = document.querySelector("header");
  const mainEl = document.querySelector("main");
  const scrollY = window.scrollY;

  let exportStage = null;

  button.disabled = true;
  button.textContent = "Membuat PDF...";

  try {
    if (typeof html2pdf === "undefined") {
      throw new Error("Library html2pdf belum termuat. Periksa koneksi internet Anda.");
    }

    clearTimeout(saveTimer);
    await ensureSafeLogo();
    updateAllPreviews();
    if (db) await saveToDatabase(collectFormData());

    const reportPageNodes = Array.from(dom.reportPages.querySelectorAll(".page"));
    const photoPageNodes = photoData.length > 0
      ? Array.from(dom.photoPages.querySelectorAll(".page"))
      : [];

    const allPages = [...reportPageNodes, ...photoPageNodes];
    if (!allPages.length) throw new Error("Halaman laporan tidak ditemukan.");

    headerEl.style.display = "none";
    mainEl.style.display = "none";
    window.scrollTo(0, 0);

    exportStage = document.createElement("div");
    exportStage.id = "pdf-export-stage";
    Object.assign(exportStage.style, {
      position: "static",
      width: "210mm",
      margin: "0",
      padding: "0",
      background: "#ffffff"
    });

    allPages.forEach((pageNode, index) => {
      const clonedPage = pageNode.cloneNode(true);
      Object.assign(clonedPage.style, {
        width: "210mm",
        height: "296.8mm",
        minHeight: "296.8mm",
        margin: "0",
        padding: "18mm 25mm 20mm",
        boxShadow: "none",
        background: "#ffffff",
        overflow: "hidden",
        pageBreakAfter: index < allPages.length - 1 ? "always" : "auto",
        breakAfter: index < allPages.length - 1 ? "page" : "auto"
      });

      const logo = clonedPage.querySelector("#kemensosLogo");
      if (logo) {
        if (cachedLogoDataUrl) {
          logo.removeAttribute("crossorigin");
          logo.src = cachedLogoDataUrl;
        } else {
          logo.style.display = "none";
        }
      }

      exportStage.appendChild(clonedPage);
    });

    document.body.appendChild(exportStage);

    const images = Array.from(exportStage.querySelectorAll("img"));
    await Promise.all(
      images.map(img => {
        if (!img.getAttribute("src") || img.style.display === "none") return Promise.resolve();
        if (typeof img.decode === "function") return img.decode().catch(() => {});
        return Promise.resolve();
      })
    );

    await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));

    const options = {
      margin: 0,
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
        mode: ["css", "legacy"]
      }
    };

    await html2pdf().set(options).from(exportStage).save();

  } catch (error) {
    console.error("Gagal mengekspor PDF:", error);
    alert("PDF gagal dibuat: " + (error && error.message ? error.message : "Kesalahan tidak diketahui"));
  } finally {
    if (exportStage && exportStage.parentNode) {
      exportStage.parentNode.removeChild(exportStage);
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

  dom.city.value = "Jakarta";
  dom.signatureInput.value = "";
  dom.photoInput.value = "";

  signatureData = "";
  photoData = [];

  try {
    if (db) await deleteFromDatabase();
    updateAllPreviews();
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
      renderReportPages();
      saveForm();
    });
    input.addEventListener("change", () => {
      renderReportPages();
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
      dom.clearSignatureBtn.style.display = "inline-block";
      renderReportPages();
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
  ensureSafeLogo().then(() => renderReportPages());

  try {
    await openDatabase();
    await loadForm();
  } catch (error) {
    console.error(error);
    updateAllPreviews();
    dom.saveStatus.textContent =
      "Browser tidak dapat mengaktifkan penyimpanan otomatis.";
  }
}

document.addEventListener("DOMContentLoaded", initialize);
