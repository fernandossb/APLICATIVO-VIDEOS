const state = {
  config: null,
  fichas: [],
  filteredFichas: [],
  selectedId: null,
  currentFicha: null,
  currentOperations: [],
};

const els = {
  fileSearch: document.querySelector("#fileSearch"),
  operationSearch: document.querySelector("#operationSearch"),
  fileResults: document.querySelector("#fileResults"),
  fileList: document.querySelector("#fileList"),
  fileCount: document.querySelector("#fileCount"),
  folderStatus: document.querySelector("#folderStatus"),
  refreshButton: document.querySelector("#refreshButton"),
  statFiles: document.querySelector("#statFiles"),
  statOps: document.querySelector("#statOps"),
  statVideos: document.querySelector("#statVideos"),
  contentPanel: document.querySelector("#contentPanel"),
  sheetPath: document.querySelector("#sheetPath"),
  sheetTitle: document.querySelector("#sheetTitle"),
  sheetReference: document.querySelector("#sheetReference"),
  sheetName: document.querySelector("#sheetName"),
  sheetUpdated: document.querySelector("#sheetUpdated"),
  techSheet: document.querySelector("#techSheet"),
  flowName: document.querySelector("#flowName"),
  visibleOps: document.querySelector("#visibleOps"),
  matchedVideos: document.querySelector("#matchedVideos"),
  operationsBody: document.querySelector("#operationsBody"),
  videoModal: document.querySelector("#videoModal"),
  videoPlayer: document.querySelector("#videoPlayer"),
  videoTitle: document.querySelector("#videoTitle"),
  videoCode: document.querySelector("#videoCode"),
  videoFileName: document.querySelector("#videoFileName"),
};

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function api(path) {
  const response = await fetch(path, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || "Falha ao carregar dados.");
  }
  return data;
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 6200);
}

function setLoading(message, detail = "Selecione uma ficha técnica para exibir o roteiro de produção.") {
  state.currentFicha = null;
  state.currentOperations = [];
  els.contentPanel.hidden = false;
  els.sheetPath.textContent = "";
  els.sheetTitle.textContent = message;
  els.sheetReference.textContent = detail;
  els.sheetName.textContent = "";
  els.sheetUpdated.textContent = "";
  els.techSheet.innerHTML = "";
  els.flowName.textContent = "ROTEIRO DE PRODUÇÃO";
  els.operationSearch.value = "";
  els.operationsBody.innerHTML = `
    <tr class="loading-row">
      <td colspan="7">${escapeHtml(detail)}</td>
    </tr>
  `;
  updateStats();
}

function isStageOperation(op) {
  return normalize(op.group).trim() === "estagio";
}

function showFichaLoading(file) {
  els.contentPanel.hidden = false;
  els.sheetPath.textContent = file?.relativePath || "";
  els.sheetTitle.textContent = file?.name || "Lendo ficha técnica";
  els.sheetReference.textContent = "Abrindo roteiro";
  els.sheetName.textContent = "ROTEIRO DE PRODUÇÃO";
  els.sheetUpdated.textContent = file?.modifiedAt ? `Atualizado em ${file.modifiedAt}` : "";
  els.techSheet.innerHTML = "";
  els.flowName.textContent = "Carregando operações";
  els.operationSearch.value = "";
  els.operationsBody.innerHTML = `
    <tr class="loading-row">
      <td colspan="7">Carregando operações desta ficha...</td>
    </tr>
  `;
}

function updateStats() {
  const ops = state.currentOperations.length;
  const videos = state.currentOperations.filter((op) => op.video && !isStageOperation(op)).length;
  els.statFiles.textContent = state.fichas.length;
  els.statOps.textContent = ops;
  els.statVideos.textContent = state.config?.videoCount ?? videos;
  els.visibleOps.textContent = String(getFilteredOperations().length);
  els.matchedVideos.textContent = String(videos);
}

function renderFiles() {
  const query = normalize(els.fileSearch.value).trim();
  if (!query) {
    state.filteredFichas = [];
    els.fileCount.textContent = "0";
    els.fileList.innerHTML = "";
    els.fileResults.hidden = true;
    els.fileSearch.setAttribute("aria-expanded", "false");
    return;
  }

  state.filteredFichas = state.fichas.filter((file) => {
    const haystack = normalize(`${file.name} ${file.relativePath} ${file.folder}`);
    return haystack.includes(query);
  });

  els.fileCount.textContent = state.filteredFichas.length;
  els.fileResults.hidden = false;
  els.fileSearch.setAttribute("aria-expanded", "true");

  const visibleFiles = state.filteredFichas.slice(0, 40);
  els.fileList.innerHTML = visibleFiles
    .map((file) => {
      const active = file.id === state.selectedId ? " active" : "";
      return `
        <button class="file-card${active}" type="button" data-id="${escapeHtml(file.id)}" title="${escapeHtml(file.relativePath)}">
          <span class="file-icon">X</span>
          <span>
            <span class="file-title">${escapeHtml(file.name)}</span>
            <span class="file-meta">${escapeHtml(file.modifiedAt)} · ${escapeHtml(file.folder || "Raiz")}</span>
          </span>
        </button>
      `;
    })
    .join("");

  if (!visibleFiles.length) {
    els.fileList.innerHTML = `<p class="no-results">Nenhuma ficha encontrada.</p>`;
  }
}

function getFilteredOperations() {
  const query = normalize(els.operationSearch.value);
  if (!query) return state.currentOperations;
  return state.currentOperations.filter((op) => {
    const haystack = normalize(`${op.number} ${op.code} ${op.group} ${op.description} ${op.observation} ${op.time}`);
    return haystack.includes(query);
  });
}

function asArray(value) {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function colorSwatchStyle(color) {
  const text = normalize(`${color?.code || ""} ${color?.name || ""}`);
  const palette = [
    ["preto", "#151719"],
    ["branco", "#f7f7f2"],
    ["off", "#f2eadb"],
    ["chumbo", "#5d6368"],
    ["cinza", "#9ea4a8"],
    ["mescla", "#b4b7b5"],
    ["marinho", "#1f3048"],
    ["azul", "#316a9f"],
    ["vermelho", "#a53434"],
    ["vinho", "#6e2636"],
    ["rosa", "#d88ca4"],
    ["verde", "#4f7c59"],
    ["bege", "#c5aa7d"],
    ["natural", "#d8c9ad"],
    ["prata", "#c7c9cc"],
    ["amarelo", "#d7ad35"],
  ];
  const match = palette.find(([name]) => text.includes(name));
  const background = match ? match[1] : "#dfe7e6";
  const border = background === "#f7f7f2" ? "#c7cfce" : background;
  return `background:${background};border-color:${border}`;
}

function getContentImages(images) {
  const list = asArray(images);
  const withoutRepeatedLogos = list.filter((image) => !String(image?.name || "").toLowerCase().endsWith(".gif"));
  return withoutRepeatedLogos.length ? withoutRepeatedLogos : list;
}

function renderImages(images, kind = "technical") {
  const list = getContentImages(images);
  if (!list.length) return "";
  return `
    <div class="image-gallery ${escapeHtml(kind)}-gallery">
      ${list
        .map(
          (image, index) => `
            <figure>
              <img src="${escapeHtml(image.url)}" alt="${escapeHtml(`Imagem ${index + 1} de ${image.sheet || "ficha técnica"}`)}" loading="lazy" />
            </figure>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderFormattedSheet(images, sectionName) {
  const list = asArray(images);
  if (!list.length) return "";
  return `
    <div class="formatted-sheet-gallery">
      ${list
        .map(
          (image, index) => `
            <div class="formatted-sheet-scroll">
              <a href="${escapeHtml(image.url)}" target="_blank" rel="noopener" title="Abrir em tamanho completo">
                <img src="${escapeHtml(image.url)}" alt="${escapeHtml(`${sectionName}, bloco ${index + 1}`)}" loading="lazy" />
              </a>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderFields(fields, excludedKeys = []) {
  const excluded = new Set(excludedKeys.map((key) => normalize(key).toUpperCase()));
  const seen = new Set();
  const list = asArray(fields).filter((field) => {
    const key = normalize(field?.key || field?.label).toUpperCase();
    if (!field?.value || excluded.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!list.length) return "";
  return `
    <dl class="field-grid">
      ${list
        .map(
          (field) => `
            <div>
              <dt>${escapeHtml(field.label || field.key)}</dt>
              <dd>${escapeHtml(field.value)}</dd>
            </div>
          `,
        )
        .join("")}
    </dl>
  `;
}

function renderStatusItems(items) {
  const list = asArray(items)
    .map((item) => {
      const itemName = String(item?.item || "").trim();
      const seen = new Set();
      const values = [item?.size, item?.quantity, item?.delivery]
        .map((value) => String(value || "").trim())
        .filter((value) => {
          const key = normalize(value);
          if (!key || key === "-" || key === normalize(itemName) || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      return { itemName, values };
    })
    .filter((item) => item.itemName && item.values.length);
  if (!list.length) return "";
  return `
    <div class="status-list">
      ${list
        .map(
          (item) => `
            <div>
              <span>${escapeHtml(item.itemName)}</span>
              <strong>${item.values.map(escapeHtml).join(" · ")}</strong>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderColors(colors) {
  const list = asArray(colors);
  if (!list.length) return "";
  return `
    <div class="color-grid">
      ${list
        .map(
          (color) => `
            <span class="color-chip">
              <span class="swatch" style="${escapeHtml(colorSwatchStyle(color))}"></span>
              <span><strong>${escapeHtml(color.code)}</strong>${escapeHtml(color.name)}</span>
            </span>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderMeasurements(measurements) {
  const rows = asArray(measurements?.rows);
  const sizes = asArray(measurements?.sizes);
  if (!rows.length || !sizes.length) return "";
  return `
    <div class="table-wrap compact-table">
      <table>
        <thead>
          <tr>
            <th>Medida</th>
            ${sizes.map((size) => `<th>${escapeHtml(size)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  <td><strong>${escapeHtml(row.measure)}</strong></td>
                  ${asArray(row.values)
                    .map((item) => `<td>${escapeHtml(item.value) || '<span class="muted">-</span>'}</td>`)
                    .join("")}
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderSheetRows(rows, title = "Dados da planilha", minimumRow = 1) {
  const list = asArray(rows).filter((row) => Number(row?.row || 0) >= minimumRow);
  if (!list.length) return "";
  return `
    <details class="sheet-lines">
      <summary>${escapeHtml(title)}</summary>
      <div class="line-list">
        ${list
          .map(
            (row) => `
              <div class="line-row">
                <span class="line-number">${escapeHtml(row.row)}</span>
                <div>
                  ${asArray(row.cells)
                    .map((cell) => `<span><b>${escapeHtml(cell.columnName)}</b> ${escapeHtml(cell.text)}</span>`)
                    .join("")}
                </div>
              </div>
            `,
          )
          .join("")}
      </div>
    </details>
  `;
}

function renderTechnicalSection(id, title, content) {
  if (!content) return "";
  return `
    <section id="${id}" class="tech-section">
      <div class="section-title">
        <h2>${escapeHtml(title)}</h2>
      </div>
      ${content}
    </section>
  `;
}

function renderTechnicalSheet(ficha) {
  const tech = ficha.technical || {};
  const cover = tech.cover || {};
  const variants = tech.variants || {};
  const modeling = tech.modeling || {};
  const supplies = tech.supplies || {};
  const comments = tech.comments || {};
  const coverContent = [
    renderImages(cover.images, "cover"),
    renderFields(cover.fields, ["REFERENCIA", "DESCRICAO", "LOCAL DO ARQUIVO"]),
    renderStatusItems(cover.statusItems),
  ]
    .filter(Boolean)
    .join("");
  const variantContent = renderImages(variants.images, "variant");
  const modelingContent = [renderImages(modeling.images, "modeling"), renderMeasurements(modeling.measurements)]
    .filter(Boolean)
    .join("");
  const suppliesContent =
    renderFormattedSheet(supplies.formattedImages, "Insumos") ||
    [renderColors(supplies.colors), renderSheetRows(supplies.rows, "Ver informações completas dos insumos", 13)]
      .filter(Boolean)
      .join("");
  const commentsContent =
    renderFormattedSheet(comments.formattedImages, "Comentários") ||
    renderSheetRows(comments.rows, "Ver comentários completos", 13);

  const sections = `
    <nav class="tech-nav" aria-label="Seções da ficha técnica">
      <a href="#capa">Capa</a>
      <a href="#variantes">Variantes</a>
      <a href="#modelagem">Modelagem</a>
      <a href="#insumos">Insumos</a>
      <a href="#comentarios">Comentários</a>
      <a href="#roteiro">Roteiro</a>
    </nav>

    ${renderTechnicalSection("capa", "Capa", coverContent)}
    ${renderTechnicalSection("variantes", "Variantes", variantContent)}
    ${renderTechnicalSection("modelagem", "Modelagem e medidas", modelingContent)}
    ${renderTechnicalSection("insumos", "Insumos", suppliesContent)}
    ${renderTechnicalSection("comentarios", "Comentários", commentsContent)}
  `;

  els.techSheet.innerHTML = sections;
}

function renderOperations() {
  const operations = getFilteredOperations();
  els.operationsBody.innerHTML = operations
    .map((op, index) => {
      const isStage = isStageOperation(op);
      const hasVideo = Boolean(op.video) && !isStage;
      const rowClass = [hasVideo ? "has-video" : "", isStage ? "stage-row" : ""].filter(Boolean).join(" ");
      const number = op.number || index + 1;
      const play = isStage
        ? ""
        : hasVideo
        ? `<button class="play-button" type="button" data-video-id="${escapeHtml(op.video.id)}" data-code="${escapeHtml(op.code)}" data-title="${escapeHtml(op.description)}" data-file="${escapeHtml(op.video.name)}" aria-label="Assistir vídeo da operação ${escapeHtml(op.code)}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 7 8 5-8 5V7Z" /></svg>
          </button>`
        : `<button class="play-button" type="button" disabled aria-label="Vídeo não encontrado">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 7 8 5-8 5V7Z" /></svg>
          </button>`;

      return `
        <tr${rowClass ? ` class="${rowClass}"` : ""}>
          <td>${escapeHtml(number)}</td>
          <td><span class="code-chip">${escapeHtml(op.code)}</span></td>
          <td>${escapeHtml(op.group) || '<span class="muted">-</span>'}</td>
          <td><strong>${escapeHtml(op.description)}</strong></td>
          <td>${escapeHtml(op.observation) || '<span class="muted">Sem observação</span>'}</td>
          <td>${escapeHtml(op.time) || '<span class="muted">-</span>'}</td>
          <td class="col-video">${play}</td>
        </tr>
      `;
    })
    .join("");

  if (!operations.length) {
    els.operationsBody.innerHTML = `
      <tr>
        <td colspan="7" class="muted">Nenhuma operação encontrada para essa busca.</td>
      </tr>
    `;
  }
  updateStats();
}

async function loadFicha(id) {
  state.selectedId = id;
  if (window.location.search !== `?ficha=${encodeURIComponent(id)}`) {
    window.history.replaceState(null, "", `?ficha=${encodeURIComponent(id)}`);
  }
  renderFiles();
  const selectedFile = state.fichas.find((file) => file.id === id);
  showFichaLoading(selectedFile);

  try {
    const data = await api(`/api/ficha?id=${encodeURIComponent(id)}`);
    state.currentFicha = data.ficha;
    state.currentOperations = data.ficha.operations || [];

    els.contentPanel.hidden = false;
    els.sheetPath.textContent = data.ficha.relativePath;
    els.sheetTitle.textContent = data.ficha.product || data.ficha.name;
    els.sheetReference.textContent = data.ficha.reference ? `Ref. ${data.ficha.reference}` : data.ficha.name;
    els.sheetName.textContent = data.ficha.sheetName;
    els.sheetUpdated.textContent = `Atualizado em ${data.ficha.modifiedAt}`;
    els.flowName.textContent = data.ficha.sheetName || "ROTEIRO DE PRODUÇÃO";
    els.operationSearch.value = "";
    renderTechnicalSheet(data.ficha);
    renderOperations();
  } catch (error) {
    state.currentFicha = null;
    state.currentOperations = [];
    updateStats();
    setLoading("Não foi possível abrir essa ficha", error.message);
    showToast(error.message);
  }
}

function openVideo(button) {
  const id = button.dataset.videoId;
  const title = button.dataset.title;
  const code = button.dataset.code;
  const file = button.dataset.file;
  els.videoTitle.textContent = title || "Vídeo da operação";
  els.videoCode.textContent = code ? `Código ${code}` : "";
  els.videoFileName.textContent = file || "";
  els.videoPlayer.src = `/video?id=${encodeURIComponent(id)}`;
  els.videoModal.hidden = false;
  els.videoPlayer.focus();
}

function closeVideo() {
  els.videoPlayer.pause();
  els.videoPlayer.removeAttribute("src");
  els.videoPlayer.load();
  els.videoModal.hidden = true;
}

async function loadInitialData() {
  els.contentPanel.hidden = true;
  els.folderStatus.textContent = "Carregando...";
  try {
    const [config, fichasData] = await Promise.all([api("/api/config"), api("/api/fichas")]);
    state.config = config;
    state.fichas = fichasData.fichas || [];
    els.folderStatus.textContent = config.fichaRoot;
    renderFiles();
    updateStats();

    if (state.fichas.length) {
      const initialFicha = new URLSearchParams(window.location.search).get("ficha");
      if (initialFicha && state.fichas.some((file) => file.id === initialFicha)) {
        await loadFicha(initialFicha);
      } else {
        els.contentPanel.hidden = true;
      }
    } else {
      els.contentPanel.hidden = true;
      showToast("Nenhuma ficha técnica com roteiro de produção foi encontrada.");
    }
  } catch (error) {
    setLoading("Falha ao carregar o aplicativo", error.message);
    showToast(error.message);
  }
}

async function refreshData() {
  els.refreshButton.disabled = true;
  try {
    const data = await api("/api/refresh");
    state.config = {
      ...(state.config || {}),
      videoCount: data.videoCount,
    };
    state.fichas = data.fichas || [];
    renderFiles();
    updateStats();
    if (state.selectedId && state.fichas.some((file) => file.id === state.selectedId)) {
      await loadFicha(state.selectedId);
    } else if (state.fichas.length) {
      state.selectedId = null;
      state.currentFicha = null;
      state.currentOperations = [];
      window.history.replaceState(null, "", window.location.pathname);
      els.contentPanel.hidden = true;
      updateStats();
    }
  } catch (error) {
    showToast(error.message);
  } finally {
    els.refreshButton.disabled = false;
  }
}

els.fileSearch.addEventListener("input", renderFiles);
els.fileSearch.addEventListener("focus", renderFiles);
els.operationSearch.addEventListener("input", renderOperations);
els.refreshButton.addEventListener("click", refreshData);

els.fileList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-id]");
  if (button) {
    els.fileSearch.value = "";
    els.fileResults.hidden = true;
    els.fileSearch.setAttribute("aria-expanded", "false");
    loadFicha(button.dataset.id);
  }
});

els.operationsBody.addEventListener("click", (event) => {
  const button = event.target.closest("[data-video-id]");
  if (button) openVideo(button);
});

document.querySelectorAll("[data-close-modal]").forEach((node) => {
  node.addEventListener("click", closeVideo);
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!els.fileResults.hidden) {
    els.fileResults.hidden = true;
    els.fileSearch.setAttribute("aria-expanded", "false");
  } else if (!els.videoModal.hidden) {
    closeVideo();
  }
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".file-search-control")) {
    els.fileResults.hidden = true;
    els.fileSearch.setAttribute("aria-expanded", "false");
  }
});

loadInitialData();
