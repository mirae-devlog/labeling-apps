/* ═══════════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════════ */
const state = {
  currentTool: 'box',
  classes: [
    { name: 'hub',                color: '#00e5ff' },
    { name: 'rivet_big',          color: '#ff6b35' },
    { name: 'rivet_small',        color: '#39ff14' },
    { name: 'stopper_pin',        color: '#ff3d5a' },
    { name: 'damper_red_long',    color: '#ff1744' },
    { name: 'damper_red_short',   color: '#ff6d75' },
    { name: 'damper_blue_long',   color: '#2979ff' },
    { name: 'damper_blue_short',  color: '#82b1ff' },
    { name: 'damper_green_long',  color: '#00e676' },
    { name: 'damper_green_short', color: '#69f0ae' },
    { name: 'damper_white_long',  color: '#eceff1' },
    { name: 'damper_white_short', color: '#cfd8dc' },
    { name: 'damper_black_long',  color: '#546e7a' },
    { name: 'damper_black_short', color: '#78909c' },
    { name: 'damper_yellow_long', color: '#ffd600' },
    { name: 'damper_yellow_short',color: '#ffff8d' },
    { name: 'damper_grey_long',   color: '#90a4ae' },
    { name: 'damper_grey_short',  color: '#b0bec5' },
    { name: 'cushion_yellow',     color: '#ffab40' },
    { name: 'cushion_green',      color: '#b9f6ca' },
    { name: 'cushion_white',      color: '#f5f5f5' },
    { name: 'cushion_black',      color: '#424242' },
    { name: 'cushion_grey',       color: '#9e9e9e' },
    { name: 'damper_sky_blue_long',color: '#40c4ff' },
    { name: 'plate_nail_black',   color: '#ff80ab' },
    { name: 'plate_nail_white',   color: '#ea80fc' },
    { name: 'plate_nail_pink',    color: '#f48fb1' },
    { name: 'damper_orange_short',color: '#ff9100' },
  ],
  activeClass: 0,
  annotations: [],
  selectedAnnos: new Set(),
  clipboard: [],
  images: [],
  activeImg: null,

  zoom: 1,
  panX: 0,
  panY: 0,

  drawing: false,
  dragging: false,
  resizing: false,
  resizeHandle: null,
  startX: 0, startY: 0,
  dragOffsets: [],
  resizeStart: {},

  imgNatW: 0, imgNatH: 0,
  imgEl: null,

  trainingRunning: false,
  trainingInterval: null,
  trainingEpoch: 0,
  trainingTotal: 100,

  marquee: false,
  marqueeX: 0, marqueeY: 0,
  marqueeCurX: 0, marqueeCurY: 0,
};

/* ═══════════════════════════════════════════════════════════
   VERSION SAVE SYSTEM (max 5 versions per image)
═══════════════════════════════════════════════════════════ */
const MAX_VERSIONS = 5;
let autosaveEnabled = true;
let _autosaveTimer = null;

// ── Version key helpers ──
function verKey(imgName) { return 'vlv2_versions_' + imgName; }
function quickKey(imgName) { return 'vlv2_quick_' + imgName; }

// ── Load versions for current image ──
function loadVersions(imgName) {
  try {
    const raw = localStorage.getItem(verKey(imgName));
    return raw ? JSON.parse(raw) : [];
  } catch(e) { return []; }
}

// ── Save versions array ──
function saveVersionsArr(imgName, versions) {
  try { localStorage.setItem(verKey(imgName), JSON.stringify(versions)); } catch(e) {}
}

// ── Quick Save (overwrite current state only) ──
function quickSave() {
  if (state.activeImg === null) { notify('Pilih gambar terlebih dahulu', 'warn'); return; }
  persistCurrentAnnotations(); // writes vl_ key only
  showAutosavePill('⚡ Quick Saved');
  notify(`⚡ Quick Save: ${state.annotations.length} box`);
}

// ── Version Save (create snapshot, max 5) ──
function versionSave() {
  if (state.activeImg === null) { notify('Pilih gambar terlebih dahulu', 'warn'); return; }
  const img = state.images[state.activeImg];
  persistCurrentAnnotations();

  const versions = loadVersions(img.name);
  const now = new Date();
  const snapshot = {
    id: Date.now(),
    savedAt: now.toISOString(),
    label: now.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', second:'2-digit' }),
    dateLabel: now.toLocaleDateString('id-ID', { day:'2-digit', month:'short' }),
    count: state.annotations.length,
    natW: state.imgNatW,
    natH: state.imgNatH,
    annotations: state.annotations.map(a=>({...a})),
  };

  // Prepend (newest first), trim to MAX_VERSIONS
  versions.unshift(snapshot);
  if (versions.length > MAX_VERSIONS) versions.splice(MAX_VERSIONS);
  saveVersionsArr(img.name, versions);

  renderVersionList();
  showAutosavePill('📌 Ver Saved');
  notify(`📌 Versi disimpan: ${snapshot.count} box · v${versions.length}/${MAX_VERSIONS}`);
}

// ── Restore version ──
function restoreVersion(imgName, versionId) {
  const versions = loadVersions(imgName);
  const ver = versions.find(v => v.id === versionId);
  if (!ver) { notify('Versi tidak ditemukan', 'warn'); return; }
  pushHistory();
  state.annotations = ver.annotations.map(a=>({...a}));
  state.selectedAnnos.clear();
  redrawCanvas();
  renderAnnotations();
  renderClasses();
  persistCurrentAnnotations();
  notify(`↩ Restored: ver ${ver.dateLabel} ${ver.label} (${ver.count} box)`);
  renderVersionList();
}

// ── Delete single version ──
function deleteVersion(imgName, versionId) {
  const versions = loadVersions(imgName);
  const idx = versions.findIndex(v => v.id === versionId);
  if (idx === -1) return;
  versions.splice(idx, 1);
  saveVersionsArr(imgName, versions);
  renderVersionList();
  notify('Versi dihapus');
}

// ── Clear all versions for current image ──
function clearAllVersions() {
  if (state.activeImg === null) return;
  const img = state.images[state.activeImg];
  showModal('Hapus Semua Versi', `Hapus semua ${loadVersions(img.name).length} versi tersimpan untuk "${img.name}"?`, () => {
    saveVersionsArr(img.name, []);
    renderVersionList();
    closeModal();
    notify('Semua versi dihapus');
  });
}

// ── Render version history UI ──
function renderVersionList() {
  if (state.activeImg === null) return;
  const img = state.images[state.activeImg];
  const versions = loadVersions(img.name);

  const wrap = document.getElementById('versionHistoryWrap');
  const listEl = document.getElementById('versionList');
  const badge = document.getElementById('verCountBadge');

  if (!wrap || !listEl) return;

  if (versions.length === 0) {
    wrap.style.display = 'none';
    if (badge) badge.style.display = 'none';
    return;
  }

  wrap.style.display = 'block';
  if (badge) { badge.textContent = `${versions.length}/${MAX_VERSIONS} ver`; badge.style.display = 'inline-block'; }

  listEl.innerHTML = versions.map((ver, idx) => `
    <div class="version-item ${idx === 0 ? 'current' : ''}">
      <span class="ver-num ${idx === 0 ? 'current' : ''}">v${versions.length - idx}</span>
      <div class="ver-info">
        <div class="ver-count">${ver.count} box</div>
        <div class="ver-time">${ver.dateLabel} ${ver.label}</div>
      </div>
      <button class="ver-restore-btn" onclick="restoreVersion('${img.name}', ${ver.id})" title="Restore versi ini">↩ Restore</button>
      <button class="ver-del-btn" onclick="deleteVersion('${img.name}', ${ver.id})" title="Hapus versi ini">✕</button>
    </div>
  `).join('');
}

// ── Toggle save panel ──
let savePanelOpen = true;
function toggleSavePanel() {
  savePanelOpen = !savePanelOpen;
  const body = document.getElementById('savePanelBody');
  const toggle = document.getElementById('savePanelToggle');
  if (body) body.style.display = savePanelOpen ? 'flex' : 'none';
  if (toggle) toggle.classList.toggle('open', savePanelOpen);
}

// ── Autosave toggle ──
function onAutosaveToggle() {
  autosaveEnabled = document.getElementById('autosaveToggle')?.checked ?? true;
  const dot = document.getElementById('autosaveStatusDot');
  if (dot) dot.style.background = autosaveEnabled ? 'var(--accent3)' : 'var(--muted)';
  notify(autosaveEnabled ? '✓ Auto Save aktif' : '⚠ Auto Save dimatikan', autosaveEnabled ? 'ok' : 'warn');
}

// ── Trigger autosave after annotation change ──
function triggerAutosave() {
  if (!autosaveEnabled) return;
  clearTimeout(_autosaveTimer);
  _autosaveTimer = setTimeout(() => {
    // Skip if image is still loading (imgNatW===0) or pending switch
    if (state.activeImg !== null && state.imgNatW && state.imgNatH
        && state._pendingImgIdx === undefined) {
      persistCurrentAnnotations();
      updateStorageBar();
    }
  }, 1500); // 1.5s debounce — gives image load time to complete
}

/* ═══════════════════════════════════════════════════════════
   FILE SYSTEM ACCESS API — Write TXT directly to source folder
═══════════════════════════════════════════════════════════ */
let _folderHandle = null; // DirectoryFileSystemHandle

function checkFSAPI() {
  const supported = 'showDirectoryPicker' in window;
  if (!supported) {
    document.getElementById('fsApiWarn').classList.add('show');
  }
  return supported;
}

async function pickFolder() {
  if (!checkFSAPI()) return;
  try {
    _folderHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    const folderName = _folderHandle.name;
    const pathEl = document.getElementById('folderPathDisplay');
    if (pathEl) {
      pathEl.textContent = `📁 ${folderName}`;
      pathEl.classList.remove('no-folder');
    }
    document.getElementById('btnWriteCurrent').disabled = false;
    document.getElementById('btnWriteAll').disabled = false;
    updateFolderCount();
    notify(`📁 Folder dipilih: ${folderName}`);

    // Write classes.txt immediately so folder always has the current class list
    await writeClassesTxtToFolder();

    // Scan folder for .txt files and mark images that have a matching label file
    await _scanFolderForTxtFiles();
  } catch(err) {
    if (err.name !== 'AbortError') {
      notify('⚠ Gagal membuka folder: ' + err.message, 'warn');
    }
  }
}

/**
 * Scan _folderHandle for .txt files and mark state.images entries
 * that have a matching label file available (img._hasTxtFile = true).
 * This enables the badge in renderImgList without reading file contents yet.
 */
async function _scanFolderForTxtFiles() {
  if (!_folderHandle || !state.images.length) return;
  let found = 0;
  for (const img of state.images) {
    const txtName = img.name.replace(/\.[^.]+$/, '') + '.txt';
    try {
      await _folderHandle.getFileHandle(txtName, { create: false });
      img._hasTxtFile = true;
      found++;
    } catch(e) {
      img._hasTxtFile = false;
    }
  }
  if (found > 0) notify(`📄 Ditemukan ${found} file label .txt di folder`);
  renderImgList();
}

function updateFolderCount() {
  const el = document.getElementById('fsFolderCount');
  if (!el) return;
  const labeled = state.images.filter(im => im.annotations && im.annotations.length > 0).length;
  el.textContent = `${labeled} file siap`;
}

// ── Write single TXT to folder ──
/* ═══════════════════════════════════════════════════════════
   EXPORT CONFLICT DETECTION & MODAL
═══════════════════════════════════════════════════════════ */

// Pending export context (set before showing modal)
let _exportConflictCtx = null;

/**
 * Check which .txt files already exist in the folder.
 * Returns { existing: [{img, txtName}], newFiles: [{img, txtName}] }
 */
async function checkExistingTxt(imgList) {
  const existing  = [];
  const newFiles  = [];
  for (const img of imgList) {
    const txtName = img.name.replace(/\.[^.]+$/, '') + '.txt';
    try {
      await _folderHandle.getFileHandle(txtName, { create: false });
      existing.push({ img, txtName });
    } catch(e) {
      // NotFoundError = file doesn't exist
      newFiles.push({ img, txtName });
    }
  }
  return { existing, newFiles };
}

/**
 * Show the conflict modal.
 * ctx = { existing, newFiles, mode: 'all'|'current'|'single', singleIdx }
 */
function showExportConflictModal(ctx) {
  _exportConflictCtx = ctx;
  const { existing, newFiles } = ctx;

  // Summary text
  const summaryEl = document.getElementById('exportConflictSummary');
  summaryEl.textContent =
    `Ditemukan ${existing.length} file TXT yang sudah ada di folder. ` +
    `Pilih tindakan yang diinginkan:`;

  // Existing file list
  const listEl = document.getElementById('exportConflictList');
  listEl.innerHTML = existing.map((item, i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:4px 4px;
                border-bottom:${i < existing.length-1 ? '1px solid var(--border)' : 'none'}">
      <span style="font-size:11px">📄</span>
      <span style="font-family:var(--mono);font-size:10px;color:var(--warn);flex:1">${item.txtName}</span>
      <span style="font-family:var(--mono);font-size:9px;color:var(--muted)">
        ${item.img.annotations?.length || 0} box
      </span>
      <span style="font-family:var(--mono);font-size:8px;color:var(--danger);
                   background:rgba(255,61,90,0.1);border:1px solid rgba(255,61,90,0.3);
                   padding:1px 5px;border-radius:2px">AKAN DITIMPA</span>
    </div>`).join('');

  // New files section
  const newWrap = document.getElementById('exportNewFilesWrap');
  const newList = document.getElementById('exportNewFilesList');
  const newLabel = document.getElementById('exportConflictNewLabel');

  if (newFiles.length > 0) {
    newWrap.style.display = 'block';
    newLabel.textContent = `+ ${newFiles.length} file baru`;
    newList.innerHTML = newFiles.map((item, i) => `
      <div style="display:flex;align-items:center;gap:8px;padding:4px 4px;
                  border-bottom:${i < newFiles.length-1 ? '1px solid rgba(57,255,20,0.1)' : 'none'}">
        <span style="font-size:11px">✨</span>
        <span style="font-family:var(--mono);font-size:10px;color:var(--accent3);flex:1">${item.txtName}</span>
        <span style="font-family:var(--mono);font-size:9px;color:var(--muted)">
          ${item.img.annotations?.length || 0} box
        </span>
        <span style="font-family:var(--mono);font-size:8px;color:var(--accent3);
                     background:rgba(57,255,20,0.1);border:1px solid rgba(57,255,20,0.3);
                     padding:1px 5px;border-radius:2px">BARU</span>
      </div>`).join('');
  } else {
    newWrap.style.display = 'none';
    newLabel.textContent = '';
  }

  // Button descriptions
  const totalAll = existing.length + newFiles.length;
  document.getElementById('exportBtnOverwriteAllDesc').textContent =
    `Tulis ${totalAll} file total (${existing.length} ditimpa + ${newFiles.length} baru)`;

  const newOnlyBtn = document.getElementById('exportBtnNewOnly');
  const newOnlyDesc = document.getElementById('exportBtnNewOnlyDesc');
  if (newFiles.length === 0) {
    newOnlyBtn.disabled = true;
    newOnlyBtn.style.opacity = '0.35';
    newOnlyBtn.style.cursor = 'not-allowed';
    newOnlyDesc.textContent = 'Tidak ada file baru — semua sudah ada';
  } else {
    newOnlyBtn.disabled = false;
    newOnlyBtn.style.opacity = '1';
    newOnlyBtn.style.cursor = 'pointer';
    newOnlyDesc.textContent = `Hanya tulis ${newFiles.length} file yang belum ada, lewati ${existing.length} file lama`;
  }

  document.getElementById('exportConflictModal').style.display = 'flex';
}

function closeExportConflictModal() {
  document.getElementById('exportConflictModal').style.display = 'none';
  _exportConflictCtx = null;
}

/** Called when user picks a resolution from the modal */
async function exportConflictResolve(mode) {
  if (!_exportConflictCtx) return;
  // Save ctx FIRST, then close modal (closeExportConflictModal nulls _exportConflictCtx)
  const ctx = _exportConflictCtx;
  closeExportConflictModal();
  const { existing, newFiles, singleImg } = ctx;

  const toWrite = mode === 'overwrite_all'
    ? [...existing, ...newFiles]
    : newFiles; // new_only

  if (!toWrite.length) { notify('Tidak ada file yang ditulis', 'warn'); return; }

  let success = 0, fail = 0;
  for (const { img, txtName } of toWrite) {
    const natW = img.natW || state.imgNatW;
    const natH = img.natH || state.imgNatH;
    const content = annotationsToYOLO(img.annotations, natW, natH);
    try {
      const fh = await _folderHandle.getFileHandle(txtName, { create: true });
      const w = await fh.createWritable();
      await w.write(content);
      await w.close();
      success++;
    } catch(err) {
      fail++;
      console.warn('Failed to write', txtName, err);
    }
  }

  const skipped = mode === 'new_only' ? existing.length : 0;
  const failTxt   = fail    ? ` · ${fail} gagal`    : '';
  const skipTxt   = skipped ? ` · ${skipped} dilewati` : '';
  await writeClassesTxtToFolder();
  notify(`✓ ${success} file TXT + classes.txt ditulis${skipTxt}${failTxt}`);
}

/* ── Write single TXT to folder (with conflict check) ── */
async function writeTxtCurrent() {
  if (!_folderHandle) { notify('Pilih folder terlebih dahulu!', 'warn'); return; }
  if (state.activeImg === null) { notify('Pilih gambar terlebih dahulu!', 'warn'); return; }

  persistCurrentAnnotations();
  const img = state.images[state.activeImg];
  if (!state.annotations.length) { notify('Tidak ada anotasi!', 'warn'); return; }

  const { existing, newFiles } = await checkExistingTxt([img]);

  if (existing.length > 0) {
    // File already exists — show conflict modal
    showExportConflictModal({ existing, newFiles, mode: 'current' });
  } else {
    // No conflict — write directly
    const txtName = img.name.replace(/\.[^.]+$/, '') + '.txt';
    const natW = state.imgNatW || img.natW;
    const natH = state.imgNatH || img.natH;
    const content = annotationsToYOLO(state.annotations, natW, natH);
    try {
      const fh = await _folderHandle.getFileHandle(txtName, { create: true });
      const w  = await fh.createWritable();
      await w.write(content);
      await w.close();
      await writeClassesTxtToFolder();
      notify(`✓ Ditulis ke folder: ${txtName} (${state.annotations.length} box) + classes.txt`);
    } catch(err) {
      notify('⚠ Gagal menulis file: ' + err.message, 'warn');
    }
  }
}

/* ── Write ALL labeled images TXT to folder (with conflict check) ── */
async function writeTxtAll() {
  if (!_folderHandle) { notify('Pilih folder terlebih dahulu!', 'warn'); return; }
  const labeled = state.images.filter(im => im.annotations && im.annotations.length > 0);
  if (!labeled.length) { notify('Belum ada gambar yang dilabeli!', 'warn'); return; }

  persistCurrentAnnotations();

  notify('🔍 Memeriksa file yang sudah ada...');
  const { existing, newFiles } = await checkExistingTxt(labeled);

  if (existing.length === 0) {
    // No conflicts — write all directly
    let success = 0, fail = 0;
    for (const { img, txtName } of newFiles) {
      const natW = img.natW || state.imgNatW;
      const natH = img.natH || state.imgNatH;
      const content = annotationsToYOLO(img.annotations, natW, natH);
      try {
        const fh = await _folderHandle.getFileHandle(txtName, { create: true });
        const w  = await fh.createWritable();
        await w.write(content);
        await w.close();
        success++;
      } catch(err) { fail++; }
    }
    await writeClassesTxtToFolder();
    const failTxt = fail ? ` · ${fail} gagal` : '';
    notify(`✓ ${success} file TXT + classes.txt ditulis ke folder${failTxt}`);
  } else {
    // Show conflict modal
    showExportConflictModal({ existing, newFiles, mode: 'all' });
  }
}

/* ── Export single img TXT from list button (with conflict check) ── */
async function exportImgTxtToFolder(idx, e) {
  if (e) e.stopPropagation();
  if (!_folderHandle) { notify('Pilih folder terlebih dahulu di panel Save!', 'warn'); return; }
  const img = state.images[idx];
  if (!img || !img.annotations || !img.annotations.length) { notify('Gambar belum ada anotasi!', 'warn'); return; }

  const { existing, newFiles } = await checkExistingTxt([img]);

  if (existing.length > 0) {
    showExportConflictModal({ existing, newFiles, mode: 'single', singleImg: img });
  } else {
    const txtName = img.name.replace(/\.[^.]+$/, '') + '.txt';
    const natW = img.natW || state.imgNatW;
    const natH = img.natH || state.imgNatH;
    const content = annotationsToYOLO(img.annotations, natW, natH);
    try {
      const fh = await _folderHandle.getFileHandle(txtName, { create: true });
      const w  = await fh.createWritable();
      await w.write(content);
      await w.close();
      notify(`✓ ${txtName} → folder`);
    } catch(err) { notify('⚠ ' + err.message, 'warn'); }
  }
}

/* ═══════════════════════════════════════════════════════════
   IMAGE DELETION
═══════════════════════════════════════════════════════════ */
function confirmDeleteImage(idx, e) {
  if (e) e.stopPropagation();
  const img = state.images[idx];
  if (!img) return;
  showModal(
    'Hapus Gambar',
    `Hapus "${img.name}" dari list? Anotasi yang tersimpan di localStorage juga akan dihapus.`,
    () => {
      deleteImage(idx);
      closeModal();
    },
    'danger'
  );
}

function deleteImage(idx) {
  const img = state.images[idx];
  if (!img) return;

  // Clean up localStorage
  try {
    localStorage.removeItem('vl_' + img.name);
    localStorage.removeItem('vl_' + img.name + '_meta');
    localStorage.removeItem(quickKey(img.name));
    localStorage.removeItem(verKey(img.name));
  } catch(e) {}

  // Revoke object URL to free memory
  if (img.url && img.url.startsWith('blob:')) {
    URL.revokeObjectURL(img.url);
  }

  state.images.splice(idx, 1);

  // Adjust activeImg
  if (state.images.length === 0) {
    state.activeImg = null;
    state.annotations = [];
    const canvas = document.getElementById('labelCanvas');
    const ctx = canvas?.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    document.getElementById('imageDisplay').style.display = 'none';
    document.getElementById('uploadZone').style.display = 'flex';
    state.imgEl = null;
  } else if (state.activeImg !== null) {
    if (idx < state.activeImg) {
      state.activeImg--;
    } else if (idx === state.activeImg) {
      state.activeImg = Math.min(state.activeImg, state.images.length - 1);
      const newImg = state.images[state.activeImg];
      if (newImg) selectImage(state.activeImg);
    }
  }

  renderImgList();
  renderAnnotations();
  renderClasses();
  renderVersionList();
  updateFolderCount();
  notify(`🗑 "${img.name}" dihapus dari list`);
}

// ── Export single image TXT to folder (from img list button) ──
/* ═══════════════════════════════════════════════════════════
   MODEL → CLASS MAPPING  (Part Number catalogue)
═══════════════════════════════════════════════════════════ */
const MODEL_CLASSES = {
  '0K153': { cushion_black:2, hub:1, rivet_big:16, damper_sky_blue_long:4, rivet_small:16, stopper_pin:8, damper_black_short:4, plate_nail_black:4 },
  '1KD IMV-71': { hub:1, rivet_big:16, damper_white_long:4, cushion_green:2, rivet_small:16, damper_white_short:4, stopper_pin:8, plate_nail_black:4 },
  '2KDH-70715': { hub:1, damper_white_long:4, rivet_big:16, cushion_green:2, rivet_small:16, damper_white_short:4, stopper_pin:8, plate_nail_black:4 },
  '71381 H1A': { hub:1, damper_white_long:4, cushion_green:2, rivet_big:16, rivet_small:16, damper_white_short:4, stopper_pin:8, plate_nail_black:4 },
  '71491 H2GA': { hub:1, damper_orange_short:4, rivet_big:16, damper_blue_long:4, stopper_pin:8, rivet_small:16, cushion_yellow:2, plate_nail_black:4 },
  'DTX-162A': { hub:1, damper_grey_long:8, rivet_small:8, rivet_big:8, stopper_pin:8, plate_nail_black:4 },
  'DTX-164A': { hub:1, rivet_big:16, damper_white_long:4, cushion_green:2, rivet_small:16, damper_white_short:4, stopper_pin:8, plate_nail_black:4 },
  'DTX-165A': { damper_white_long:4, damper_white_short:4, hub:1, cushion_green:2, rivet_big:16, rivet_small:16, stopper_pin:8, plate_nail_black:4 },
  'DTX-163A': { hub:1, rivet_small:16, rivet_big:16, stopper_pin:8, damper_grey_short:2, damper_sky_blue_long:2, cushion_black:2, plate_nail_black:4 },
  'E2RB': { hub:1, damper_white_long:8, rivet_big:8, stopper_pin:8, rivet_small:8, plate_nail_black:4 },
  'EZ0S': { hub:1, damper_red_short:4, rivet_big:16, stopper_pin:8, rivet_small:16, damper_blue_long:4, cushion_yellow:2, plate_nail_black:4 },
  'EZ12 1GR': { hub:1, damper_white_long:4, rivet_big:16, rivet_small:16, damper_white_short:4, cushion_green:2, stopper_pin:8, plate_nail_white:4 },
  'EZ50-1TRGP': { damper_white_long:8, hub:1, rivet_big:8, rivet_small:8, stopper_pin:8, plate_nail_black:4 },
  'EZ88': { damper_white_long:4, hub:1, damper_white_short:4, rivet_big:16, cushion_green:2, rivet_small:16, stopper_pin:8, plate_nail_black:4 },
  'F1A': { damper_grey_long:4, hub:1, damper_yellow_short:4, rivet_big:16, rivet_small:16, stopper_pin:8, cushion_grey:2, plate_nail_black:4 },
  'F1B': { hub:1, damper_grey_long:4, damper_yellow_short:4, rivet_big:16, rivet_small:16, cushion_grey:2, stopper_pin:8, plate_nail_black:4 },
  'H4': { damper_green_long:4, hub:1, damper_yellow_short:4, rivet_big:16, cushion_yellow:2, rivet_small:16, stopper_pin:8, plate_nail_black:4 },
  '2KDL': { hub:1, damper_white_long:8, rivet_big:8, rivet_small:8, stopper_pin:8 },
  'TT207': { hub:1, damper_white_long:8, rivet_big:8, rivet_small:8, stopper_pin:8, plate_nail_black:4 },
  '71501-G1A': { hub:1, damper_blue_long:8, rivet_big:16, rivet_small:16, stopper_pin:8, plate_nail_pink:4 },
  'V6': { damper_white_long:4, hub:1, damper_white_short:4, rivet_big:16, cushion_green:2, rivet_small:16, stopper_pin:8, plate_nail_white:4 },
  'DTX-161A': { hub:1, damper_grey_long:8, rivet_big:8, rivet_small:8, stopper_pin:8, plate_nail_black:4 },
  'DTX-233A': { damper_grey_long:4, hub:1, damper_yellow_short:4, rivet_big:16, cushion_grey:2, rivet_small:16, stopper_pin:8, plate_nail_black:4 },
  '71222': { damper_white_long:4, hub:1, damper_white_short:4, rivet_big:16, cushion_green:2, rivet_small:16, stopper_pin:8, plate_nail_white:4 },
  '18KD': { hub:1, damper_white_long:8, rivet_big:8, rivet_small:8, stopper_pin:8, plate_nail_black:4 },
};

// Currently active model filter (null = show all classes)
let activeModelFilter = null;

// ── Built-in model name registry (set once at startup) ──
const _BUILTIN_MODEL_BOMS   = Object.freeze(
  Object.fromEntries(Object.entries(MODEL_CLASSES).map(([k,v]) => [k, {...v}]))
);
const _BUILTIN_MODEL_NAMES_ARR = Object.keys(MODEL_CLASSES);
const _BUILTIN_MODEL_NAMES     = new Set(_BUILTIN_MODEL_NAMES_ARR);


/* ═══════════════════════════════════════════════════════════
   ZOOM — SMOOTH CANVAS SCROLL
═══════════════════════════════════════════════════════════ */
function attachWheelHandler() {
  const el = document.getElementById('canvasContainer');
  if (!el) return;
  el.addEventListener('wheel', function(e) {
    e.preventDefault();
    e.stopPropagation();
    const rect = el.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const zoomFactor = Math.exp(e.deltaY * -0.003);
    const newZoom = Math.max(0.05, Math.min(20, state.zoom * zoomFactor));
    state.panX = mouseX - (mouseX - state.panX) * (newZoom / state.zoom);
    state.panY = mouseY - (mouseY - state.panY) * (newZoom / state.zoom);
    state.zoom = newZoom;
    updateZoomDisplay();
    requestAnimationFrame(redrawCanvas);
  }, { passive: false });
}

let _lastMousePos = { mx: 200, my: 200 };
let ctxMenu = null;

// Rotate-around-axis state — declared here so canvasMouseDown can access it
let rotateState = {
  active:    false,
  pivotX:    0,
  pivotY:    0,
  angleDeg:  0,
  origBoxes: [],
};

/* ─── NAVIGATION ─── */
function switchPage(name, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  btn.classList.add('active');
  if (name === 'results') initCharts();
  if (name === 'training') { trRefreshDataset(); trUpdateCmd(); trCheckBackend(); }
}

/* ─── CLASS MANAGEMENT ─── */

/**
 * renderClasses — tampilkan HANYA kelas yang ada di model yang dipilih.
 * Jika model = none → tampilkan semua 28 kelas (mode manual).
 * Jika model dipilih (part number) → hanya kelas di BOM model itu yang muncul,
 *   diurutkan sesuai urutan asli dari MODEL_CLASSES, dengan badge count detected/expected.
 */
function renderClasses() {
  const el = document.getElementById('classItems');
  if (!el) return;

  const modelMap = activeModelFilter ? (MODEL_CLASSES[activeModelFilter] || null) : null;

  // Build the display list — ONLY classes for this model (or all if no filter)
  let displayList = [];
  if (modelMap) {
    // Iterate MODEL_CLASSES entry in original order (preserves BOM order)
    Object.entries(modelMap).forEach(([clsName, expected]) => {
      const i = state.classes.findIndex(c => c.name === clsName);
      if (i >= 0) {
        displayList.push({ cls: state.classes[i], i, expected });
      }
    });
  } else {
    // Show all classes
    state.classes.forEach((cls, i) => {
      displayList.push({ cls, i, expected: null });
    });
  }

  function renderItem({ cls, i, expected }) {
    const detected = state.annotations.filter(a => a.classIdx === i).length;
    const isActive = i === state.activeClass;

    let statusHtml = '';
    if (expected !== null) {
      const ok   = detected >= expected;
      const over = detected > expected;
      const statusColor = over ? 'var(--accent2)' : ok ? 'var(--accent3)' : 'var(--muted)';
      const statusBg    = over ? 'rgba(255,107,53,0.18)' : ok ? 'rgba(57,255,20,0.14)' : 'rgba(255,255,255,0.04)';
      const label       = over ? 'LEBIH' : ok ? '✓' : `butuh ${expected - detected}`;
      const labelColor  = over ? 'var(--accent2)' : ok ? 'var(--accent3)' : 'var(--muted)';
      statusHtml = `
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:1px;flex-shrink:0;min-width:38px">
          <span style="font-family:var(--mono);font-size:9px;color:${statusColor};background:${statusBg};padding:2px 5px;border-radius:3px;white-space:nowrap;font-weight:bold">
            ${detected}/${expected}
          </span>
          <span style="font-size:7px;color:${labelColor};font-family:var(--mono);text-align:right">${label}</span>
        </div>`;
    } else {
      statusHtml = `<div class="class-count">${detected || ''}</div>`;
    }

    return `
      <div class="class-item ${isActive ? 'active' : ''}" onclick="setActiveClass(${i})"
           onmouseenter="this.querySelector('.cls-edit-btn').style.opacity='1'"
           onmouseleave="this.querySelector('.cls-edit-btn').style.opacity='0'">
        <div class="class-color" style="background:${cls.color};cursor:pointer"
             onclick="event.stopPropagation();openEditClassModal(${i})" title="Ganti warna"></div>
        <div class="class-name" title="${cls.name}">${cls.name}</div>
        ${statusHtml}
        <button class="cls-edit-btn" onclick="event.stopPropagation();openEditClassModal(${i})"
          title="Edit kelas"
          style="opacity:0;transition:opacity 0.15s;background:none;border:none;color:var(--muted);
                 font-size:10px;cursor:pointer;padding:0 3px;line-height:1;flex-shrink:0">✎</button>
      </div>`;
  }

  el.innerHTML = displayList.map(renderItem).join('');

  const badge = document.getElementById('classCountBadge');
  if (badge) {
    badge.textContent = modelMap
      ? `${displayList.length} KELAS`
      : `${state.classes.length} KELAS`;
  }

  updateModelValidation();
}

/**
 * Show validation chip: how many classes are complete vs missing.
 */
function updateModelValidation() {
  const chip = document.getElementById('modelInfoChip');
  if (!chip) return;

  const modelMap = activeModelFilter ? (MODEL_CLASSES[activeModelFilter] || null) : null;
  if (!modelMap) { chip.style.display = 'none'; return; }

  const entries = Object.entries(modelMap);
  let okCount = 0, missingClasses = [], overClasses = [];

  entries.forEach(([name, expected]) => {
    const idx = state.classes.findIndex(c => c.name === name);
    const detected = idx >= 0 ? state.annotations.filter(a => a.classIdx === idx).length : 0;
    if (detected >= expected) okCount++;
    else missingClasses.push({ name, need: expected - detected, expected });
    if (detected > expected) overClasses.push({ name, over: detected - expected });
  });

  const total = entries.length;
  const allOk = okCount === total && overClasses.length === 0;
  const chipColor = allOk ? 'var(--accent3)' : okCount > 0 ? 'var(--warn)' : 'var(--muted)';
  const chipBg = allOk ? 'rgba(57,255,20,0.08)' : okCount > 0 ? 'rgba(255,214,0,0.07)' : 'transparent';

  let detail = '';
  if (!allOk) {
    if (missingClasses.length) {
      detail += '<br><span style="color:var(--muted)">Kurang: </span>' +
        missingClasses.slice(0,3).map(m => `<span style="color:var(--accent2)">${m.name}(${m.need})</span>`).join(' ');
      if (missingClasses.length > 3) detail += ` +${missingClasses.length-3} lagi`;
    }
    if (overClasses.length) {
      detail += '<br><span style="color:var(--muted)">Lebih: </span>' +
        overClasses.map(o => `<span style="color:var(--accent2)">${o.name}(+${o.over})</span>`).join(' ');
    }
  }

  chip.style.display = 'block';
  chip.style.borderColor = chipColor + '55';
  chip.style.background = chipBg;
  chip.innerHTML = `
    <span style="color:${chipColor};font-weight:bold">${activeModelFilter}</span>
    &nbsp;·&nbsp;${okCount}/${total} kelas lengkap
    ${allOk ? '&nbsp;<span style="color:var(--accent3)">✓ KOMPLIT</span>' : ''}
    ${detail}
  `;
}

function setActiveClass(i) {
  state.activeClass = i;
  renderClasses();
}

function addClass() {
  const inp = document.getElementById('newClassName');
  const name = inp.value.trim();
  if (!name) { return; }
  if (state.classes.find(c => c.name === name)) {
    notify(`⚠ Kelas "${name}" sudah ada`, 'warn'); return;
  }
  const colors = ['#e040fb','#69f0ae','#ff8a65','#80d8ff','#f4ff81','#ea80fc','#ccff90','#a7ffeb'];
  state.classes.push({ name, color: colors[state.classes.length % colors.length] });
  inp.value = '';
  renderClasses();
  // Auto-write classes.txt to open folder
  if (_folderHandle) {
    writeClassesTxtToFolder().then(() =>
      notify(`✓ Kelas "${name}" ditambahkan · classes.txt diperbarui`)
    );
  } else {
    notify(`✓ Kelas "${name}" ditambahkan (indeks ${state.classes.length - 1})`);
  }
}

/* ─── IMAGE LIST ─── */
function renderImgList() {
  const el = document.getElementById('imgList');
  const countBadge = document.getElementById('imgListCount');
  if (countBadge) countBadge.textContent = state.images.length + ' file';

  if (!state.images.length) {
    el.innerHTML = '<p style="font-family:var(--mono);font-size:10px;color:var(--muted);padding:16px 12px;text-align:center;line-height:1.8">Upload gambar untuk<br>mulai labeling</p>';
    return;
  }
  el.innerHTML = state.images.map((img, i) => {
    const haslabel = img.annotations && img.annotations.length > 0;
    const status = haslabel ? 'done' : 'todo';
    const badgeMap = { done: 'badge-done', todo: 'badge-todo' };
    const badgeTxt = { done: '✓', todo: '○' };
    const hasVer    = loadVersions(img.name).length > 0;
    const hasFolder = !!_folderHandle;
    const hasTxt    = img._hasTxtFile && !haslabel;
    return `
      <div class="img-item ${state.activeImg===i?'active':''}" onclick="selectImage(${i})">
        <div class="img-thumb" style="font-size:13px">${haslabel ? '🖼️' : hasTxt ? '📄' : '📋'}</div>
        <div class="img-info">
          <div class="img-name" title="${img.name}">${img.name}</div>
          <div class="img-meta">
            <span class="badge ${badgeMap[status]}">${badgeTxt[status]}</span>
            <span style="color:var(--muted)">${img.annotations?img.annotations.length:0}lbl</span>
            ${hasVer ? `<span style="color:var(--warn);font-size:8px">📌${loadVersions(img.name).length}v</span>` : ''}
            ${hasTxt ? `<span style="color:var(--accent2);font-size:8px;background:rgba(255,107,53,0.12);border:1px solid rgba(255,107,53,0.3);padding:0 4px;border-radius:2px" title="File .txt ditemukan — akan auto-load saat dibuka">TXT</span>` : ''}
          </div>
        </div>
        <div class="img-actions">
          ${hasFolder && haslabel ? `<button class="img-action-btn export-btn" onclick="exportImgTxtToFolder(${i},event)" title="Tulis TXT ke folder">✎</button>` : ''}
          ${(img._hasTxtFile || img.annotations?.length) ? `<button class="img-action-btn" onclick="resetSingleFromTxt(${i},event)" title="Reset localStorage → reload dari .txt" style="color:var(--danger);border-color:rgba(255,61,90,0.4)">↺</button>` : ''}
          <button class="img-action-btn" onclick="confirmDeleteImage(${i},event)" title="Hapus dari list">🗑️</button>
        </div>
      </div>`;
  }).join('');
  const counter = document.getElementById('imgNavCounter');
  if (counter && state.activeImg !== null) counter.textContent = `${state.activeImg+1} / ${state.images.length}`;
}

function selectImage(idx) {
  persistCurrentAnnotations();
  clearHistory();
  state.activeImg = idx;
  state.selectedAnnos.clear();
  const img = state.images[idx];
  state._pendingImgIdx = idx;
  renderImgList();
  loadImageToCanvas(img.url);
  updateAIBtnState();
  renderVersionList();
  updateFolderCount();
}

async function onImageLoaded(idx) {
  // Guard: if user switched to another image while this one was loading, abort
  if (state.activeImg !== idx) {
    state._pendingImgIdx = undefined;
    return;
  }
  // Clear the pending flag now that we've validated
  state._pendingImgIdx = undefined;

  const img = state.images[idx];
  if (!img) return;

  // ── Priority 1: in-memory annotations (already in state.images[])
  if (img.annotations && img.annotations.length > 0) {
    state.annotations = img.annotations.map(a => ({...a}));
    renderAnnotations();
    renderClasses();
    updateAISampleBadge();
    return;
  }

  // ── Priority 2: localStorage
  const saved = loadPersistedAnnotations(img.name, state.imgNatW, state.imgNatH);
  if (saved && saved.length > 0) {
    state.annotations = saved;
    img.annotations   = saved.map(a => ({...a}));
    notify(`📂 Loaded ${saved.length} anotasi dari localStorage`);
    renderAnnotations();
    renderClasses();
    updateAISampleBadge();
    return;
  }

  // ── Priority 3: matching .txt file in folder (File System Access API)
  if (_folderHandle) {
    const txtName = img.name.replace(/\.[^.]+$/, '') + '.txt';
    try {
      const fh      = await _folderHandle.getFileHandle(txtName, { create: false });
      const file    = await fh.getFile();
      const content = await file.text();

      // Re-check: user may have switched image during the async file read
      if (state.activeImg !== idx) return;

      if (content.trim()) {
        const parsed = _parseTxtFileToAnnotations(content, state.imgNatW, state.imgNatH);
        if (parsed && parsed.length > 0) {
          state.annotations = parsed;
          img.annotations   = parsed.map(a => ({...a}));

          // Also persist into localStorage so it's available next time without folder
          // Save with embedded meta: # natW natH
          const key  = 'vl_' + img.name;
          const packed = `# ${state.imgNatW} ${state.imgNatH}\n${annotationsToYOLO(parsed, state.imgNatW, state.imgNatH)}`;
          try { localStorage.setItem(key, packed); } catch(e) {}

          notify(`📄 Auto-load ${parsed.length} anotasi dari ${txtName}`);
          img._hasTxtFile = false; // consumed — badge will now show as labeled
          renderAnnotations();
          renderClasses();
          updateAISampleBadge();
          updateFolderCount();
          return;
        }
      }
    } catch(e) {
      // File not found or unreadable — silently continue to empty state
      if (e.name !== 'NotFoundError') {
        console.warn('onImageLoaded txt fallback:', e);
      }
    }
  }

  // ── Fallback: no annotations
  state.annotations = [];
  renderAnnotations();
  renderClasses();
  updateAISampleBadge();
}

/**
 * Parse YOLO .txt file content → annotation objects
 * Handles standard format: class_id cx cy w h  (all normalized 0-1)
 * Same logic as loadPersistedAnnotations but without localStorage dependency.
 */
function _parseTxtFileToAnnotations(content, natW, natH) {
  if (!natW || !natH) return [];
  const results = [];
  const lines = content.trim().split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 5) continue;
    const classIdx = parseInt(parts[0]);
    const cx = parseFloat(parts[1]);
    const cy = parseFloat(parts[2]);
    const nw = parseFloat(parts[3]);
    const nh = parseFloat(parts[4]);
    if (isNaN(classIdx) || isNaN(cx) || isNaN(cy) || isNaN(nw) || isNaN(nh)) continue;
    if (classIdx < 0 || classIdx >= state.classes.length) continue;
    if (cx <= 0 || cy <= 0 || nw <= 0 || nh <= 0) continue;
    if (cx > 1.01 || cy > 1.01 || nw > 1.01 || nh > 1.01) continue;
    results.push({
      id:       Date.now() + Math.random(),
      classIdx,
      source:   'txt',
      x: (cx - nw / 2) * natW,
      y: (cy - nh / 2) * natH,
      w: nw * natW,
      h: nh * natH,
    });
  }
  return results;
}

function handleFileUpload(input) {
  const prevLen = state.images.length;
  Array.from(input.files).forEach(file => {
    const url = URL.createObjectURL(file);
    state.images.push({ name: file.name, url, annotations: [] });
  });
  renderImgList();
  if (state.images.length > prevLen) {
    selectImage(prevLen);
    // Re-scan folder for .txt matches (new images may have pairs)
    if (_folderHandle) _scanFolderForTxtFiles();
  }
}

function handleDrop(e) {
  e.preventDefault();
  document.getElementById('uploadZone').classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
  const prevLen = state.images.length;
  files.forEach(file => {
    const url = URL.createObjectURL(file);
    state.images.push({ name: file.name, url, annotations: [] });
  });
  renderImgList();
  if (files.length) {
    selectImage(prevLen);
    if (_folderHandle) _scanFolderForTxtFiles();
  }
}

/* ═══════════════════════════════════════════════════════════
   CANVAS ENGINE
═══════════════════════════════════════════════════════════ */
function s2i(sx, sy) { return [(sx - state.panX) / state.zoom, (sy - state.panY) / state.zoom]; }
function i2s(ix, iy) { return [ix * state.zoom + state.panX, iy * state.zoom + state.panY]; }

function getMousePos(e) {
  const rect = document.getElementById('canvasContainer').getBoundingClientRect();
  return [e.clientX - rect.left, e.clientY - rect.top];
}

function imgToScreen(a) {
  const [sx, sy] = i2s(a.x, a.y);
  return { sx, sy, sw: a.w * state.zoom, sh: a.h * state.zoom };
}

function loadImageToCanvas(url) {
  const imgEl = document.getElementById('imageDisplay');
  const zone = document.getElementById('uploadZone');
  zone.style.display = 'none';
  imgEl.style.display = 'none';
  imgEl.src = url;
  state.imgEl = imgEl;
  imgEl.onload = () => {
    state.imgNatW = imgEl.naturalWidth;
    state.imgNatH = imgEl.naturalHeight;
    resizeCanvas();
    fitImage();
    state.annotations = [];
    redrawCanvas();
    if (state._pendingImgIdx !== undefined && state._pendingImgIdx !== null) {
      const pendingIdx = state._pendingImgIdx;
      // Do NOT clear _pendingImgIdx here — onImageLoaded uses it as a guard
      // It will be cleared inside onImageLoaded after validation
      onImageLoaded(pendingIdx).then(() => redrawCanvas()).catch(() => redrawCanvas());
    } else {
      redrawCanvas();
    }
  };
}

function resizeCanvas() {
  const cont = document.getElementById('canvasContainer');
  const canvas = document.getElementById('labelCanvas');
  canvas.width = cont.clientWidth;
  canvas.height = cont.clientHeight;
}

function fitImage() {
  const canvas = document.getElementById('labelCanvas');
  const cw = canvas.width, ch = canvas.height;
  const scale = Math.min(cw / state.imgNatW, ch / state.imgNatH) * 0.92;
  state.zoom = scale;
  state.panX = (cw - state.imgNatW * scale) / 2;
  state.panY = (ch - state.imgNatH * scale) / 2;
  updateZoomDisplay();
}

function setTool(tool) {
  state.currentTool = tool;
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  const map = { box: 'btnBox', select: 'btnSelect', pan: 'btnPan' };
  if (map[tool]) document.getElementById(map[tool]).classList.add('active');
  const label = document.getElementById('toolModeLabel');
  if (label) {
    const modeInfo = {
      box:    { text: '📦 BOX',    cls: 'mode-box' },
      select: { text: '↖ SELECT', cls: 'mode-select' },
      pan:    { text: '✥ PAN',    cls: 'mode-pan' },
    };
    const info = modeInfo[tool] || modeInfo.box;
    label.textContent = info.text;
    label.className = 'tool-mode-label ' + info.cls;
  }
  updateCursor();
  hideContextMenu();
}

function updateCursor(mx, my) {
  const cont = document.getElementById('canvasContainer');
  if (state.currentTool === 'pan') { cont.style.cursor = state.dragging ? 'grabbing' : 'grab'; return; }
  if (state.currentTool === 'box') { cont.style.cursor = 'crosshair'; return; }
  if (mx !== undefined) {
    const h = getHandleAt(mx, my);
    if (h) { cont.style.cursor = h.cursor; return; }
    const a = getAnnoAt(mx, my);
    cont.style.cursor = a !== null ? 'move' : 'default';
  } else {
    cont.style.cursor = 'default';
  }
}

const HANDLE_SIZE = 6;

function getHandles(a) {
  const {sx, sy, sw, sh} = imgToScreen(a);
  const cx = sx + sw/2, cy = sy + sh/2;
  return [
    { id:'nw', x:sx,    y:sy,    cursor:'nw-resize' },
    { id:'n',  x:cx,    y:sy,    cursor:'n-resize'  },
    { id:'ne', x:sx+sw, y:sy,    cursor:'ne-resize' },
    { id:'e',  x:sx+sw, y:cy,    cursor:'e-resize'  },
    { id:'se', x:sx+sw, y:sy+sh, cursor:'se-resize' },
    { id:'s',  x:cx,    y:sy+sh, cursor:'s-resize'  },
    { id:'sw', x:sx,    y:sy+sh, cursor:'sw-resize' },
    { id:'w',  x:sx,    y:cy,    cursor:'w-resize'  },
  ];
}

function getHandleAt(mx, my) {
  if (state.selectedAnnos.size !== 1) return null;
  const idx = [...state.selectedAnnos][0];
  const a = state.annotations[idx];
  if (!a) return null;
  for (const h of getHandles(a)) {
    if (Math.abs(mx - h.x) <= HANDLE_SIZE && Math.abs(my - h.y) <= HANDLE_SIZE) return h;
  }
  return null;
}

function getAnnoAt(mx, my) {
  for (let i = state.annotations.length - 1; i >= 0; i--) {
    const {sx, sy, sw, sh} = imgToScreen(state.annotations[i]);
    if (mx >= sx && mx <= sx+sw && my >= sy && my <= sy+sh) return i;
  }
  return null;
}

function canvasMouseDown(e) {
  if (!state.imgEl) return;
  hideContextMenu();
  document.currentMarqueeEvent = e;
  const [mx, my] = getMousePos(e);

  // Rotate mode: left click moves pivot
  if (rotateState.active && e.button === 0) {
    rotatePivotClickCanvas(e);
    return;
  }

  if (e.button === 1 || (e.button === 0 && state.currentTool === 'pan')) {
    state.dragging = true;
    state.startX = mx; state.startY = my;
    state._panStartX = state.panX; state._panStartY = state.panY;
    document.getElementById('canvasContainer').style.cursor = 'grabbing';
    return;
  }

  if (e.button !== 0) return;

  if (state.currentTool === 'select') {
    const handle = getHandleAt(mx, my);
    if (handle) {
      state.resizing = true;
      state.resizeHandle = handle.id;
      const idx = [...state.selectedAnnos][0];
      const a = state.annotations[idx];
      state.resizeStart = { idx, x: a.x, y: a.y, w: a.w, h: a.h, mx, my };
      return;
    }

    const hit = getAnnoAt(mx, my);
    if (hit !== null) {
      if (e.shiftKey) {
        if (state.selectedAnnos.has(hit)) state.selectedAnnos.delete(hit);
        else state.selectedAnnos.add(hit);
      } else {
        if (!state.selectedAnnos.has(hit)) {
          state.selectedAnnos.clear();
          state.selectedAnnos.add(hit);
        }
      }
      state.dragging = true;
      state.startX = mx; state.startY = my;
      state.dragOffsets = [...state.selectedAnnos].map(i => {
        const a = state.annotations[i];
        return { i, ox: a.x - (mx - state.panX) / state.zoom,
                     oy: a.y - (my - state.panY) / state.zoom };
      });
    } else {
      if (!e.shiftKey) state.selectedAnnos.clear();
      state.marquee   = true;
      state.marqueeX  = mx;
      state.marqueeY  = my;
      state.marqueeCurX = mx;
      state.marqueeCurY = my;
    }
    renderAnnotations();
    redrawCanvas();
    updateSelInfo();
    return;
  }

  if (state.currentTool === 'box') {
    state.drawing = true;
    state.startX = mx; state.startY = my;
  }
}

function canvasMouseMove(e) {
  const [mx, my] = getMousePos(e);
  _lastMousePos = { mx, my };

  const [ix, iy] = s2i(mx, my);
  const cx = Math.max(0, Math.min(state.imgNatW, Math.round(ix)));
  const cy = Math.max(0, Math.min(state.imgNatH, Math.round(iy)));
  document.getElementById('cursorInfo').textContent = `x:${cx} y:${cy}`;

  if (state.dragging && state.currentTool === 'pan') {
    state.panX = state._panStartX + (mx - state.startX);
    state.panY = state._panStartY + (my - state.startY);
    redrawCanvas();
    return;
  }

  if (state.dragging && e.buttons === 4) {
    state.panX = state._panStartX + (mx - state.startX);
    state.panY = state._panStartY + (my - state.startY);
    redrawCanvas();
    return;
  }

  if (state.dragging && state.currentTool === 'select' && state.dragOffsets.length) {
    state.dragOffsets.forEach(({ i, ox, oy }) => {
      const a = state.annotations[i];
      a.x = ox + (mx - state.panX) / state.zoom;
      a.y = oy + (my - state.panY) / state.zoom;
    });
    redrawCanvas();
    updateSelInfo();
    return;
  }

  if (state.resizing) {
    const { idx, x, y, w, h, mx: smx, my: smy } = state.resizeStart;
    const a = state.annotations[idx];
    const dx = (mx - smx) / state.zoom;
    const dy = (my - smy) / state.zoom;
    const hid = state.resizeHandle;
    let nx = x, ny = y, nw = w, nh = h;
    if (hid.includes('e')) nw = Math.max(10/state.zoom, w + dx);
    if (hid.includes('s')) nh = Math.max(10/state.zoom, h + dy);
    if (hid.includes('w')) { nx = x + dx; nw = Math.max(10/state.zoom, w - dx); }
    if (hid.includes('n')) { ny = y + dy; nh = Math.max(10/state.zoom, h - dy); }
    a.x = nx; a.y = ny; a.w = nw; a.h = nh;
    redrawCanvas();
    updateSelInfo();
    return;
  }

  if (state.drawing && state.currentTool === 'box') {
    redrawCanvas();
    const canvas = document.getElementById('labelCanvas');
    const ctx = canvas.getContext('2d');
    const cls = state.classes[state.activeClass];
    const lx = Math.min(state.startX, mx), ly = Math.min(state.startY, my);
    const lw = Math.abs(mx-state.startX), lh = Math.abs(my-state.startY);
    ctx.save();
    ctx.strokeStyle = cls.color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5,3]);
    ctx.strokeRect(lx, ly, lw, lh);
    ctx.fillStyle = cls.color + '18';
    ctx.fillRect(lx, ly, lw, lh);
    ctx.setLineDash([]);
    ctx.restore();
    return;
  }

  if (state.marquee && state.currentTool === 'select') {
    state.marqueeCurX = mx;
    state.marqueeCurY = my;
    redrawCanvas();
    drawMarqueeRect();
    return;
  }

  if (state.currentTool === 'select') updateCursor(mx, my);
}

let _marqueePreview = new Set();

function canvasMouseUp(e) {
  const [mx, my] = getMousePos(e);

  if (state.resizing) {
    state.resizing = false;
    pushHistory();
    renderAnnotations();
    triggerAutosave();
    return;
  }

  if (state.marquee) {
    state.marquee = false;
    _marqueePreview = new Set();
    const selected = getAnnotationsInMarquee();
    if (selected.size > 0) {
      if (document.currentMarqueeEvent?.shiftKey) {
        selected.forEach(i => state.selectedAnnos.add(i));
      } else {
        state.selectedAnnos = selected;
      }
    }
    redrawCanvas();
    renderAnnotations();
    updateSelInfo();
    if (selected.size > 0) {
      notify(`◻ ${selected.size} box dipilih`);
      setTool('select');
    }
    return;
  }

  if (state.dragging) {
    state.dragging = false;
    document.getElementById('canvasContainer').style.cursor =
      state.currentTool === 'pan' ? 'grab' : 'default';
    if (state.currentTool === 'select') { pushHistory(); renderAnnotations(); triggerAutosave(); }
    return;
  }

  if (state.drawing) {
    state.drawing = false;
    if (state.currentTool !== 'box') return;
    const sx = Math.min(state.startX, mx), sy = Math.min(state.startY, my);
    const sw = Math.abs(mx - state.startX), sh = Math.abs(my - state.startY);
    if (sw < 6 || sh < 6) { redrawCanvas(); return; }
    const [ix, iy] = s2i(sx, sy);
    const iw = sw / state.zoom, ih = sh / state.zoom;
    pushHistory();
    const newAnno = { id: Date.now(), classIdx: state.activeClass, x: ix, y: iy, w: iw, h: ih };
    state.annotations.push(newAnno);
    state.selectedAnnos.clear();
    state.selectedAnnos.add(state.annotations.length - 1);
    redrawCanvas();
    renderAnnotations();
    renderClasses();
    updateSelInfo();
    triggerAutosave();
  }
}

function canvasMouseLeave(e) {
  if (state.marquee) {
    state.marquee = false;
    _marqueePreview = new Set();
    redrawCanvas();
  }
  canvasMouseUp(e);
}

function canvasContextMenu(e) {
  e.preventDefault();
  const [mx, my] = getMousePos(e);
  const hit = getAnnoAt(mx, my);
  if (hit !== null) {
    if (!state.selectedAnnos.has(hit)) {
      state.selectedAnnos.clear();
      state.selectedAnnos.add(hit);
      renderAnnotations();
      redrawCanvas();
    }
  }
  showContextMenu(e.clientX, e.clientY, hit);
}

function showContextMenu(cx, cy, hitIdx) {
  hideContextMenu();
  const hasSelection = state.selectedAnnos.size > 0;
  const hasClipboard = state.clipboard.length > 0;
  const a = hitIdx !== null ? state.annotations[hitIdx] : null;

  const items = [];
  if (hasSelection) {
    items.push({ label: `⎘ Copy (${state.selectedAnnos.size})`, fn: 'copySelected()' });
    items.push({ label: '↕ Duplicate di sini', fn: 'duplicateSelected()' });
    if (state.selectedAnnos.size === 1) {
      state.classes.forEach((cls, ci) => {
        if (ci !== (a ? a.classIdx : -1)) {
          items.push({ label: `→ Ganti ke ${cls.name}`, fn: `changeClass(${hitIdx},${ci})`, color: cls.color });
        }
      });
    }
    items.push({ label: '✕ Hapus', fn: `deleteSelected()`, danger: true });
  }
  if (hasClipboard) {
    items.push({ label: `⎙ Paste di cursor (${state.clipboard.length} item)`, fn: 'pasteAnno()' });
  }
  items.push({ label: '⊕ Copy dari gambar sebelumnya', fn: 'copyFromPrevImage()' });

  if (!items.length) return;

  const menu = document.createElement('div');
  menu.id = 'ctxMenu';
  const vw = window.innerWidth, vh = window.innerHeight;
  const menuW = 220, menuH = items.length * 32 + 8;
  const finalX = Math.min(cx, vw - menuW - 4);
  const finalY = Math.min(cy, vh - menuH - 4);
  menu.style.cssText = `
    position:fixed; left:${finalX}px; top:${finalY}px; z-index:99998;
    background:#181c24; border:1px solid #333; border-radius:7px;
    padding:4px 0; min-width:220px; box-shadow:0 12px 32px rgba(0,0,0,0.7);
    font-family:'Space Mono',monospace; font-size:11px;
  `;
  items.forEach(item => {
    const div = document.createElement('div');
    div.style.cssText = `
      padding:7px 14px; cursor:pointer; color:${item.danger ? '#ff3d5a' : (item.color || '#e8eaf0')};
      display:flex; align-items:center; gap:8px; letter-spacing:.5px;
      transition:background .1s;
    `;
    if (item.color) {
      const dot = document.createElement('span');
      dot.style.cssText = `width:8px;height:8px;border-radius:2px;background:${item.color};flex-shrink:0`;
      div.appendChild(dot);
    }
    div.appendChild(document.createTextNode(item.label));
    div.onmouseenter = () => div.style.background = '#242830';
    div.onmouseleave = () => div.style.background = '';
    div.onclick = () => { eval(item.fn); hideContextMenu(); };
    menu.appendChild(div);
  });
  document.body.appendChild(menu);
  ctxMenu = menu;
  setTimeout(() => document.addEventListener('click', hideContextMenu, { once: true }), 10);
}

function hideContextMenu() {
  if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; }
}

function redrawCanvas() {
  const canvas = document.getElementById('labelCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (state.imgEl && state.imgEl.complete && state.imgNatW) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(state.imgEl, state.panX, state.panY,
      state.imgNatW * state.zoom, state.imgNatH * state.zoom);
    ctx.restore();
  }

  if (state.imgNatW) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0,229,255,0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(state.panX, state.panY, state.imgNatW*state.zoom, state.imgNatH*state.zoom);
    ctx.restore();
  }

  if (findState.matches.length && document.getElementById('findPanel')?.classList.contains('open')) {
    showFindRing(findState.matches[findState.cursor]);
  }

  if (state.marquee) drawMarqueeRect();

  state.annotations.forEach((a, i) => {
    const cls = state.classes[a.classIdx] || { name:'?', color:'#888' };
    const sel = state.selectedAnnos.has(i);
    const {sx, sy, sw, sh} = imgToScreen(a);

    ctx.save();
    ctx.fillStyle = sel ? cls.color + '30' : cls.color + '18';
    ctx.fillRect(sx, sy, sw, sh);
    ctx.strokeStyle = cls.color;
    ctx.lineWidth = sel ? 2.5 : 1.5;
    ctx.setLineDash([]);
    ctx.strokeRect(sx, sy, sw, sh);

    const label = cls.name;
    ctx.font = `bold ${Math.max(9, 11 * Math.min(state.zoom,1.5))}px Space Mono,monospace`;
    const tw = ctx.measureText(label).width;
    const bh = Math.max(14, 16 * Math.min(state.zoom,1.5));
    const by = sy >= bh ? sy - bh : sy + 1;
    ctx.fillStyle = cls.color;
    ctx.fillRect(sx, by, tw + 8, bh);
    ctx.fillStyle = '#000';
    ctx.fillText(label, sx + 4, by + bh - 4);

    if (sel && state.selectedAnnos.size === 1 && state.currentTool === 'select') {
      getHandles(a).forEach(h => {
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = cls.color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.fillRect(h.x - HANDLE_SIZE, h.y - HANDLE_SIZE, HANDLE_SIZE*2, HANDLE_SIZE*2);
        ctx.strokeRect(h.x - HANDLE_SIZE, h.y - HANDLE_SIZE, HANDLE_SIZE*2, HANDLE_SIZE*2);
      });
    }

    if (sw > 28) {
      ctx.fillStyle = cls.color + 'aa';
      ctx.font = `${Math.max(8, 10*Math.min(state.zoom,1.5))}px Space Mono,monospace`;
      ctx.fillText(i+1, sx + 3, sy + sh - 4);
    }
    ctx.restore();
  });

  // Draw rotate pivot overlay on top
  drawRotatePivot(ctx);
}

function renderAnnotations() {
  const el = document.getElementById('annoList');
  if (!el) return;
  const badge = document.getElementById('annoCountBadge');

  if (!state.annotations.length) {
    el.innerHTML = '<p style="font-family:var(--mono);font-size:10px;color:var(--muted);padding:16px 8px;text-align:center;line-height:1.8">Belum ada anotasi.<br>Gambar box di kanvas.</p>';
    if (badge) badge.textContent = '0 box';
    updateCopyPasteUI();
    return;
  }
  if (badge) badge.textContent = state.annotations.length + ' box';

  el.innerHTML = state.annotations.map((a, i) => {
    const cls = state.classes[a.classIdx] || { name:'?', color:'#888' };
    const sel = state.selectedAnnos.has(i);
    const isAI = a.source === 'ai';
    return `
      <div class="anno-item ${sel?'selected':''} ${isAI?'ai-labeled':''}" onclick="selectAnnoClick(${i},event)">
        <div class="anno-color" style="background:${cls.color}"></div>
        <div class="anno-label" title="${cls.name}">${cls.name}</div>
        <div class="anno-coords">${Math.round(a.w)}×${Math.round(a.h)}</div>
        ${isAI?'<span class="anno-src">AI</span>':''}
        <button class="del-btn" title="Copy box ini" onclick="copySingleAnno(${i},event)" style="color:var(--accent)">⎘</button>
        <button class="del-btn" title="Hapus" onclick="deleteAnno(${i},event)">✕</button>
      </div>`;
  }).join('');
  updateCopyPasteUI();
  updateModelValidation();
}

function selectAnnoClick(i, e) {
  if (e.shiftKey) {
    if (state.selectedAnnos.has(i)) state.selectedAnnos.delete(i);
    else state.selectedAnnos.add(i);
  } else {
    state.selectedAnnos.clear();
    state.selectedAnnos.add(i);
    setTool('select');
  }
  renderAnnotations();
  redrawCanvas();
  updateSelInfo();
}

function updateSelInfo() {
  const n = state.selectedAnnos.size;
  const el = document.getElementById('selInfo');
  if (!el) return;
  if (n === 0) { el.textContent = 'no sel'; el.style.color = 'var(--muted)'; return; }
  if (n === 1) {
    const a = state.annotations[[...state.selectedAnnos][0]];
    const cls = state.classes[a.classIdx] || { name:'?' };
    el.textContent = `${cls.name} ${Math.round(a.w)}×${Math.round(a.h)}`;
    el.style.color = 'var(--accent2)';
  } else {
    el.textContent = `${n} selected`;
    el.style.color = 'var(--warn)';
  }
}

function deleteAnno(i, e) {
  e.stopPropagation();
  pushHistory();
  state.annotations.splice(i, 1);
  state.selectedAnnos.clear();
  renderAnnotations();
  redrawCanvas();
  renderClasses();
  triggerAutosave();
}

function deleteSelected() {
  pushHistory();
  const indices = [...state.selectedAnnos].sort((a,b)=>b-a);
  indices.forEach(i => state.annotations.splice(i, 1));
  state.selectedAnnos.clear();
  renderAnnotations();
  redrawCanvas();
  renderClasses();
  triggerAutosave();
}

/* ═══ UNDO / REDO ═══ */
const _undoStack = [];
const _redoStack = [];
const HISTORY_LIMIT = 50;

function pushHistory() {
  _undoStack.push(JSON.stringify(state.annotations));
  if (_undoStack.length > HISTORY_LIMIT) _undoStack.shift();
  _redoStack.length = 0;
  updateUndoRedoUI();
}

function _restoreSnapshot(snap) {
  state.annotations = JSON.parse(snap);
  state.selectedAnnos.clear();
  renderAnnotations();
  redrawCanvas();
  renderClasses();
  persistCurrentAnnotations();
  updateUndoRedoUI();
}

function undoLast() {
  if (!_undoStack.length) { notify('Tidak ada yang bisa di-undo', 'warn'); return; }
  _redoStack.push(JSON.stringify(state.annotations));
  _restoreSnapshot(_undoStack.pop());
  notify(`↩ Undo (${_undoStack.length} langkah tersisa)`);
}

function redoLast() {
  if (!_redoStack.length) { notify('Tidak ada yang bisa di-redo', 'warn'); return; }
  _undoStack.push(JSON.stringify(state.annotations));
  _restoreSnapshot(_redoStack.pop());
  notify(`↪ Redo (${_redoStack.length} redo tersisa)`);
}

function updateUndoRedoUI() {
  const undoBtn = document.getElementById('btnUndo');
  const redoBtn = document.getElementById('btnRedo');
  if (undoBtn) undoBtn.style.opacity = _undoStack.length ? '1' : '0.35';
  if (redoBtn) redoBtn.style.opacity = _redoStack.length ? '1' : '0.35';
}

function clearHistory() {
  _undoStack.length = 0;
  _redoStack.length = 0;
  updateUndoRedoUI();
}

function undoAll() {
  if (!_undoStack.length) { notify('Tidak ada yang bisa di-undo', 'warn'); return; }
  _redoStack.push(JSON.stringify(state.annotations));
  const firstSnap = _undoStack[0];
  for (let i = _undoStack.length - 1; i >= 1; i--) {
    _redoStack.push(_undoStack[i]);
  }
  _undoStack.length = 0;
  _restoreSnapshot(firstSnap);
  notify(`↩↩ Undo semua`);
}

function clearAll() {
  if (!state.annotations.length) return;
  showModal('Clear Semua', 'Hapus semua anotasi di gambar ini?', () => {
    pushHistory();
    state.annotations = [];
    state.selectedAnnos.clear();
    renderAnnotations();
    redrawCanvas();
    renderClasses();
    closeModal();
    triggerAutosave();
  });
}

function changeClass(annoIdx, classIdx) {
  if (state.annotations[annoIdx]) {
    pushHistory();
    state.annotations[annoIdx].classIdx = classIdx;
    renderAnnotations();
    redrawCanvas();
    renderClasses();
    triggerAutosave();
  }
}

/* ══ COPY / PASTE ══ */
function snapRotate(deg) {
  rotateState.angleDeg = deg;
  document.getElementById('rotateSlider').value = deg;
  document.getElementById('rotateAngleInput').value = deg;
  applyRotation(deg);
}

function nudgeRotate(delta) {
  const newAngle = (rotateState.angleDeg || 0) + delta;
  rotateState.angleDeg = newAngle;
  document.getElementById('rotateSlider').value = newAngle;
  document.getElementById('rotateAngleInput').value = newAngle.toFixed(1);
  applyRotation(newAngle);
}


function copySelected() {
  if (!state.selectedAnnos.size) return;
  state.clipboard = [...state.selectedAnnos].map(i => ({ ...state.annotations[i] }));
  updateCopyPasteUI();
  notify(`⎘ ${state.clipboard.length} box di-copy`);
}

/* ── Ctrl+Shift+C: Select ALL same-class boxes then copy ── */
function selectAndCopySameClass() {
  // Determine target class — from current selection or active class
  let targetClassIdx = null;
  if (state.selectedAnnos.size > 0) {
    // Use class of first selected box
    const firstIdx = [...state.selectedAnnos][0];
    targetClassIdx = state.annotations[firstIdx]?.classIdx;
  } else {
    targetClassIdx = state.activeClass;
  }
  if (targetClassIdx === null) { notify('Pilih salah satu box dulu', 'warn'); return; }

  const className = state.classes[targetClassIdx]?.name || `class ${targetClassIdx}`;

  // Select ALL annotations of that class
  state.selectedAnnos.clear();
  state.annotations.forEach((a, i) => {
    if (a.classIdx === targetClassIdx) state.selectedAnnos.add(i);
  });

  if (!state.selectedAnnos.size) { notify(`Tidak ada box "${className}"`, 'warn'); return; }

  // Copy to clipboard
  state.clipboard = [...state.selectedAnnos].map(i => ({ ...state.annotations[i] }));
  updateCopyPasteUI();
  redrawCanvas();
  renderAnnotations();

  notify(`⎘ ${state.clipboard.length} box "${className}" di-select & copy`);
}

/* ══════════════════════════════════════════════════════════
   ROTATE AROUND AXIS — Rotate selected BBs around a center
   User sets center pivot on canvas, then rotates all selected
══════════════════════════════════════════════════════════ */

function openRotateOverlay() {
  if (!state.selectedAnnos.size) {
    notify('Pilih beberapa box dulu sebelum rotate', 'warn');
    return;
  }

  const sel = [...state.selectedAnnos].map(i => state.annotations[i]);
  const cx  = sel.reduce((s, a) => s + a.x + a.w / 2, 0) / sel.length;
  const cy  = sel.reduce((s, a) => s + a.y + a.h / 2, 0) / sel.length;

  rotateState.active    = true;
  rotateState.pivotX    = cx;
  rotateState.pivotY    = cy;
  rotateState.angleDeg  = 0;
  rotateState.origBoxes = [...state.selectedAnnos].map(i => ({ ...state.annotations[i] }));

  const ov = document.getElementById('rotateOverlay');
  if (ov) { ov.style.display = 'flex'; }

  document.getElementById('rotatePivotX').value = Math.round(cx);
  document.getElementById('rotatePivotY').value = Math.round(cy);
  document.getElementById('rotateSlider').value = 0;
  document.getElementById('rotateAngleInput').value = '0';
  document.getElementById('rotateAngleDisplay').textContent = '0°';

  redrawCanvas();
  notify(`↻ Rotate mode aktif · ${sel.length} box · Klik canvas untuk pindah pivot`);
}

function closeRotateOverlay(apply = false) {
  rotateState.active = false;
  const ov = document.getElementById('rotateOverlay');
  if (ov) ov.style.display = 'none';
  if (!apply) {
    // Restore original positions
    [...state.selectedAnnos].forEach((idx, n) => {
      const orig = rotateState.origBoxes[n];
      if (orig && state.annotations[idx]) Object.assign(state.annotations[idx], orig);
    });
    notify('Rotate dibatalkan');
  } else {
    pushHistory();
    triggerAutosave();
    notify(`✓ Rotate ${parseFloat(rotateState.angleDeg).toFixed(1)}° diterapkan ke ${state.selectedAnnos.size} box`);
  }
  redrawCanvas();
  renderAnnotations();
}

function applyRotation(deg) {
  rotateState.angleDeg = parseFloat(deg) || 0;
  document.getElementById('rotateAngleDisplay').textContent = rotateState.angleDeg.toFixed(1) + '°';

  const rad  = rotateState.angleDeg * Math.PI / 180;
  const px   = parseFloat(document.getElementById('rotatePivotX')?.value) || rotateState.pivotX;
  const py   = parseFloat(document.getElementById('rotatePivotY')?.value) || rotateState.pivotY;
  rotateState.pivotX = px;
  rotateState.pivotY = py;
  const cos  = Math.cos(rad);
  const sin  = Math.sin(rad);

  [...state.selectedAnnos].forEach((idx, n) => {
    const orig = rotateState.origBoxes[n];
    if (!orig) return;
    // Rotate center of box around pivot
    const ocx = orig.x + orig.w / 2;
    const ocy = orig.y + orig.h / 2;
    const dx  = ocx - px;
    const dy  = ocy - py;
    const ncx = px + dx * cos - dy * sin;
    const ncy = py + dx * sin + dy * cos;
    state.annotations[idx].x = ncx - orig.w / 2;
    state.annotations[idx].y = ncy - orig.h / 2;
  });

  redrawCanvas();
  renderAnnotations();
}

function updatePivotFromInputs() {
  applyRotation(rotateState.angleDeg);
}

function rotatePivotToCenter() {
  // Reset pivot to center of selection
  const sel = [...state.selectedAnnos].map(i => state.annotations[i]);
  const cx  = sel.reduce((s, a) => s + a.x + a.w / 2, 0) / sel.length;
  const cy  = sel.reduce((s, a) => s + a.y + a.h / 2, 0) / sel.length;
  rotateState.pivotX = cx;
  rotateState.pivotY = cy;
  const px = document.getElementById('rotatePivotX');
  const py = document.getElementById('rotatePivotY');
  if (px) px.value = Math.round(cx);
  if (py) py.value = Math.round(cy);
  applyRotation(rotateState.angleDeg);
}

function rotatePivotClickCanvas(e) {
  if (!rotateState.active) return;
  const rect  = e.target.getBoundingClientRect();
  const sx    = (e.clientX - rect.left);
  const sy    = (e.clientY - rect.top);
  const [ix, iy] = s2i(sx, sy);
  rotateState.pivotX = ix;
  rotateState.pivotY = iy;
  document.getElementById('rotatePivotX').value = Math.round(ix);
  document.getElementById('rotatePivotY').value = Math.round(iy);
  applyRotation(rotateState.angleDeg);
  notify('↻ Pivot dipindah ke posisi klik');
}

/* Draw pivot crosshair on canvas — called inside redrawCanvas */
function drawRotatePivot(ctx) {
  if (!rotateState.active) return;
  const [sx, sy] = i2s(rotateState.pivotX, rotateState.pivotY);
  const R = 14;
  ctx.save();
  // Outer ring
  ctx.beginPath();
  ctx.arc(sx, sy, R, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,214,0,0.9)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Inner dot
  ctx.beginPath();
  ctx.arc(sx, sy, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#ffd600';
  ctx.fill();
  // Crosshair lines
  ctx.strokeStyle = 'rgba(255,214,0,0.8)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(sx - R - 6, sy); ctx.lineTo(sx + R + 6, sy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(sx, sy - R - 6); ctx.lineTo(sx, sy + R + 6); ctx.stroke();
  // Draw radius lines to each selected box center
  ctx.strokeStyle = 'rgba(255,214,0,0.25)';
  ctx.lineWidth = 1;
  [...state.selectedAnnos].forEach(i => {
    const a = state.annotations[i];
    const [bx, by] = i2s(a.x + a.w / 2, a.y + a.h / 2);
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(bx, by); ctx.stroke();
  });
  ctx.setLineDash([]);
  ctx.restore();
}

function copySingleAnno(i, e) {
  e.stopPropagation();
  state.clipboard = [{ ...state.annotations[i] }];
  updateCopyPasteUI();
  notify(`⎘ Copied: ${state.classes[state.annotations[i].classIdx]?.name}`);
}

function pasteAnno() {
  if (!state.clipboard.length) return;
  pushHistory();
  const canvasEl = document.getElementById('labelCanvas');
  const mx = _lastMousePos.mx || canvasEl.width / 2;
  const my = _lastMousePos.my || canvasEl.height / 2;
  const [cursorIX, cursorIY] = s2i(mx, my);
  const targetX = Math.max(0, Math.min(state.imgNatW, cursorIX));
  const targetY = Math.max(0, Math.min(state.imgNatH, cursorIY));
  const minX = Math.min(...state.clipboard.map(a => a.x));
  const minY = Math.min(...state.clipboard.map(a => a.y));
  const maxX = Math.max(...state.clipboard.map(a => a.x + a.w));
  const maxY = Math.max(...state.clipboard.map(a => a.y + a.h));
  const groupCX = (minX + maxX) / 2;
  const groupCY = (minY + maxY) / 2;
  const offsetX = targetX - groupCX;
  const offsetY = targetY - groupCY;
  state.selectedAnnos.clear();
  state.clipboard.forEach(src => {
    const newA = { ...src, id: Date.now() + Math.random(), x: src.x + offsetX, y: src.y + offsetY };
    state.annotations.push(newA);
    state.selectedAnnos.add(state.annotations.length - 1);
  });
  redrawCanvas();
  renderAnnotations();
  renderClasses();
  triggerAutosave();
  notify(`⎙ Paste ${state.clipboard.length} box di posisi cursor`);
}

function duplicateSelected() {
  if (!state.selectedAnnos.size) return;
  pushHistory();
  const OFFSET = 15 / state.zoom;
  const newIdxs = new Set();
  [...state.selectedAnnos].forEach(i => {
    const src = state.annotations[i];
    state.annotations.push({ ...src, id: Date.now()+Math.random(), x: src.x+OFFSET, y: src.y+OFFSET });
    newIdxs.add(state.annotations.length-1);
  });
  state.selectedAnnos.clear();
  newIdxs.forEach(i => state.selectedAnnos.add(i));
  redrawCanvas();
  renderAnnotations();
  renderClasses();
  triggerAutosave();
  notify(`Duplicate ${newIdxs.size} box`);
}

function copyFromPrevImage() {
  if (state.activeImg === null || state.activeImg === 0) {
    notify('Tidak ada gambar sebelumnya!', 'warn'); return;
  }
  const prevImg = state.images[state.activeImg - 1];
  if (!prevImg || !prevImg.annotations || !prevImg.annotations.length) {
    notify('Gambar sebelumnya belum ada anotasi!', 'warn'); return;
  }
  const copied = prevImg.annotations.map(a => ({ ...a, id: Date.now()+Math.random() }));
  pushHistory();
  state.annotations = [...state.annotations, ...copied];
  state.selectedAnnos.clear();
  copied.forEach((_, i) => state.selectedAnnos.add(state.annotations.length - copied.length + i));
  redrawCanvas();
  renderAnnotations();
  renderClasses();
  triggerAutosave();
  notify(`⊕ ${copied.length} box disalin dari gambar sebelumnya`);
}

function updateCopyPasteUI() {
  const hasSel = state.selectedAnnos.size > 0;
  const hasClip = state.clipboard.length > 0;
  const btnCopy = document.getElementById('btnCopy');
  const btnPaste = document.getElementById('btnPaste');
  if (btnCopy) btnCopy.style.opacity = hasSel ? '1' : '0.35';
  if (btnPaste) btnPaste.style.opacity = hasClip ? '1' : '0.35';
}

/* ── ZOOM ── */
function zoomIn()  { zoomBy(1.25); }
function zoomOut() { zoomBy(0.8); }
function resetZoom() { fitImage(); redrawCanvas(); }

function zoomBy(factor) {
  const canvas = document.getElementById('labelCanvas');
  const cx = canvas.width/2, cy = canvas.height/2;
  const newZoom = Math.max(0.05, Math.min(30, state.zoom * factor));
  state.panX = cx - (cx - state.panX) * (newZoom / state.zoom);
  state.panY = cy - (cy - state.panY) * (newZoom / state.zoom);
  state.zoom = newZoom;
  updateZoomDisplay();
  redrawCanvas();
}

function updateZoomDisplay() {
  const el = document.getElementById('zoomDisplay');
  if (el) el.textContent = Math.round(state.zoom * 100) + '%';
}

/* ── IMAGE NAVIGATION ── */
function navigateImage(dir) {
  if (!state.images.length) return;
  persistCurrentAnnotations();
  const next = (state.activeImg === null ? 0 : state.activeImg + dir);
  const clamped = Math.max(0, Math.min(state.images.length - 1, next));
  if (clamped === state.activeImg && state.activeImg !== null) return;
  selectImage(clamped);
  const items = document.querySelectorAll('.img-item');
  if (items[clamped]) items[clamped].scrollIntoView({ block:'nearest', behavior:'smooth' });
}

function nextImage() { navigateImage(1); }
function prevImage() { navigateImage(-1); }

document.addEventListener('mouseup', e => {
  if (e.button === 3) { e.preventDefault(); nextImage(); }
  if (e.button === 4) { e.preventDefault(); prevImage(); }
}, { passive: false });

/* ── KEYBOARD ── */
window.addEventListener('keydown', function(e) {
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  const key = e.key.toLowerCase();
  if (e.ctrlKey || e.metaKey) {
    if (key === 's' && !e.shiftKey)  { e.preventDefault(); quickSave(); return; }
    if (key === 's' &&  e.shiftKey)  { e.preventDefault(); versionSave(); return; }
    if (key === 'z' && !e.shiftKey)  { e.preventDefault(); e.stopPropagation(); undoLast(); return; }
    if (key === 'z' &&  e.shiftKey)  { e.preventDefault(); e.stopPropagation(); undoAll(); return; }
    if (key === 'y') { e.preventDefault(); e.stopPropagation(); redoLast(); return; }
    if (key === 'c' && e.shiftKey)  { e.preventDefault(); e.stopPropagation(); selectAndCopySameClass(); return; }
    if (key === 'c' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); copySelected(); return; }
    if (key === 'v') { e.preventDefault(); e.stopPropagation(); pasteAnno(); return; }
    if (key === 'd') { e.preventDefault(); e.stopPropagation(); duplicateSelected(); return; }
    if (key === 'a') { e.preventDefault(); e.stopPropagation(); selectAllAnnos(); return; }
    if (key === 'f') { e.preventDefault(); e.stopPropagation(); toggleFindPanel(); return; }
    return;
  }
  if (key === 'b') { setTool('box'); return; }
  if (key === 'v') { setTool('select'); return; }
  if (key === 'h') { setTool('pan'); return; }
  if (key === 'r' && !e.ctrlKey) { e.preventDefault(); openRotateOverlay(); return; }
  if (key === '+' || key === '=') { e.preventDefault(); zoomIn(); return; }
  if (key === '-' || key === '_') { e.preventDefault(); zoomOut(); return; }
  if (key === '0')                { e.preventDefault(); resetZoom(); return; }
  if (e.shiftKey && state.selectedAnnos.size && ['arrowleft','arrowright','arrowup','arrowdown'].includes(key)) {
    e.preventDefault();
    const step = 5;
    const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0;
    const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0;
    state.selectedAnnos.forEach(i => {
      state.annotations[i].x += dx;
      state.annotations[i].y += dy;
    });
    redrawCanvas(); renderAnnotations(); updateSelInfo();
    return;
  }
  if (!e.shiftKey && state.selectedAnnos.size && ['arrowup','arrowdown'].includes(key)) {
    e.preventDefault();
    const dy = key === 'arrowup' ? -1 : 1;
    state.selectedAnnos.forEach(i => { state.annotations[i].y += dy; });
    redrawCanvas(); renderAnnotations(); updateSelInfo();
    return;
  }
  if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); nextImage(); return; }
  if (e.key === 'ArrowLeft'  || e.key === 'PageUp')   { e.preventDefault(); prevImage(); return; }
  if (key === 'c') { copyFromPrevImage(); return; }
  if (key === 'escape') {
    if (rotateState.active) { closeRotateOverlay(false); return; }
    state.selectedAnnos.clear();
    renderAnnotations(); redrawCanvas(); updateSelInfo(); return;
  }
  if ((key === 'delete' || key === 'backspace') && state.selectedAnnos.size) {
    e.preventDefault(); deleteSelected(); return;
  }
  const num = parseInt(e.key);
  if (!e.altKey && num >= 1 && num <= 9) { setActiveClass(num - 1); return; }
}, true);

function selectAllAnnos() {
  state.annotations.forEach((_, i) => state.selectedAnnos.add(i));
  renderAnnotations();
  redrawCanvas();
  updateSelInfo();
}

/* ═══════════════════════════════════════════════════════════
   GEMINI API KEY MANAGEMENT
═══════════════════════════════════════════════════════════ */
function saveApiKey(val) {
  val = val.trim();
  try { localStorage.setItem('vl_gemini_key', val); } catch(e) {}
  const status = document.getElementById('apiKeyStatus');
  if (!status) return;
  if (!val) {
    status.textContent = 'Masukkan Gemini API key untuk Auto Label';
    status.style.color = 'var(--muted)';
  } else if (!val.startsWith('AIza')) {
    status.textContent = '⚠ Format key tidak valid (harus dimulai AIza...)';
    status.style.color = 'var(--warn)';
  } else {
    status.textContent = '✓ Gemini API key tersimpan';
    status.style.color = 'var(--accent3)';
  }
  updateAIBtnState();
}

function loadApiKey() {
  try {
    const key = localStorage.getItem('vl_gemini_key') || '';
    const inp = document.getElementById('apiKeyInput');
    if (inp && key) { inp.value = key; saveApiKey(key); }
    return key;
  } catch(e) { return ''; }
}

function getApiKey() {
  const inp = document.getElementById('apiKeyInput');
  return (inp ? inp.value.trim() : '') || (localStorage.getItem('vl_gemini_key') || '');
}

function toggleApiKeyVisibility() {
  const inp = document.getElementById('apiKeyInput');
  const btn = document.getElementById('apiKeyToggle');
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  if (btn) btn.textContent = inp.type === 'password' ? '👁' : '🙈';
}

/* ═══════════════════════════════════════════════════════════
   GEMINI AI AUTO LABELING
═══════════════════════════════════════════════════════════ */
const MIN_SAMPLES = 1;
const MAX_SAMPLES = 6;

function onModelChange() {
  const val = document.getElementById('pretrainedModel')?.value || 'none';
  localStorage.setItem('vl_active_model', val);

  if (val === 'none') {
    activeModelFilter = null;
    // Reset to first class
    state.activeClass = 0;
    notify('Menampilkan semua kelas (mode manual)');

  } else if (val.startsWith('__yolo_')) {
    activeModelFilter = null;
    state.activeClass = 0;
    notify(`Model YOLO dipilih: ${val.replace('__yolo_v','Clutch_v')}`);

  } else if (MODEL_CLASSES[val]) {
    activeModelFilter = val;
    const modelMap    = MODEL_CLASSES[val];
    const classNames  = Object.keys(modelMap);
    const totalParts  = Object.values(modelMap).reduce((a, b) => a + b, 0);

    // Auto-select first class of this model
    const firstIdx = state.classes.findIndex(c => c.name === classNames[0]);
    if (firstIdx >= 0) state.activeClass = firstIdx;

    notify(`📦 ${val} · ${classNames.length} kelas · ${totalParts} komponen`);
  } else {
    activeModelFilter = null;
    state.activeClass = 0;
  }

  // Show ✎ edit button when a real model (not "none" or YOLO) is selected
  const editBtn = document.getElementById('editModelBtn');
  if (editBtn) {
    const showEdit = val !== 'none' && !val.startsWith('__yolo_') && MODEL_CLASSES[val];
    editBtn.style.display = showEdit ? 'flex' : 'none';
    editBtn.title = showEdit ? `✎ Edit BOM model "${val}"` : '';
  }

  renderClasses();
  updateAIBtnState();
}

function updateAIBtnState() {
  const btn = document.getElementById('aiAssistBtn');
  if (!btn) return;
  const labeled = state.images.filter(im => im.annotations && im.annotations.length > 0);
  const hasKey = getApiKey().startsWith('AIza');
  const hasSamples = labeled.length >= MIN_SAMPLES;
  if (!hasKey) { btn.title = 'Masukkan Gemini API key'; btn.style.opacity = '0.4'; }
  else if (!hasSamples) { btn.title = `Label minimal ${MIN_SAMPLES} gambar dulu`; btn.style.opacity = '0.5'; }
  else { btn.title = `Auto label (${labeled.length} contoh)`; btn.style.opacity = '1'; }
}

async function blobToBase64(url) {
  const resp = await fetch(url);
  const blob = await resp.blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ data: r.result.split(',')[1], mimeType: blob.type || 'image/jpeg' });
    r.onerror = () => reject(new Error('Failed to read image'));
    r.readAsDataURL(blob);
  });
}

function annoToText(annotations, imgW, imgH) {
  return annotations.map((a, i) => {
    const cls = state.classes[a.classIdx]?.name || `class${a.classIdx}`;
    const cx = ((a.x + a.w/2) / imgW).toFixed(3);
    const cy = ((a.y + a.h/2) / imgH).toFixed(3);
    const nw = (a.w / imgW).toFixed(3);
    const nh = (a.h / imgH).toFixed(3);
    return `${i+1}. ${cls}  cx=${cx} cy=${cy} w=${nw} h=${nh}`;
  }).join('\n');
}

function parseYOLOResponse(text, imgW, imgH) {
  const results = [];
  const classNames = state.classes.map(c => c.name);
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('=') || trimmed.startsWith('```')) continue;
    const m = trimmed.match(/^(?:\d+\.\s*)?([\w_]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
    if (!m) continue;
    let classIdx = parseInt(m[1]);
    if (isNaN(classIdx)) {
      classIdx = classNames.indexOf(m[1]);
      if (classIdx === -1) {
        classIdx = classNames.findIndex(n =>
          n.toLowerCase().includes(m[1].toLowerCase()) ||
          m[1].toLowerCase().includes(n.toLowerCase().split('_')[0])
        );
      }
    }
    if (classIdx < 0 || classIdx >= state.classes.length) continue;
    const cx = parseFloat(m[2]), cy = parseFloat(m[3]);
    const nw = parseFloat(m[4]), nh = parseFloat(m[5]);
    if ([cx,cy,nw,nh].some(v => isNaN(v) || v <= 0 || v > 1.5)) continue;
    results.push({
      id: Date.now() + Math.random(),
      classIdx,
      x: (cx - nw/2) * imgW,
      y: (cy - nh/2) * imgH,
      w: nw * imgW,
      h: nh * imgH,
      source: 'ai',
    });
  }
  return results;
}

async function runAIAssist() {
  if (state.activeImg === null || !state.images[state.activeImg]) {
    notify('Upload gambar terlebih dahulu!', 'warn'); return;
  }
  const apiKey = getApiKey();
  if (!apiKey || !apiKey.startsWith('AIza')) {
    notify('⚠ Masukkan Gemini API key yang valid!', 'warn'); return;
  }
  const samples = state.images
    .filter((im, i) => i !== state.activeImg && im.annotations && im.annotations.length > 0)
    .slice(-MAX_SAMPLES);
  if (samples.length < MIN_SAMPLES) {
    notify(`Butuh minimal ${MIN_SAMPLES} gambar contoh!`, 'warn'); return;
  }
  const btn = document.getElementById('aiAssistBtn');
  btn.classList.add('loading');
  btn.innerHTML = '<span>⏳</span> GEMINI MENGANALISIS...';

  try {
    const target = state.images[state.activeImg];
    const targetImg = await blobToBase64(target.url);
    const parts = [];
    parts.push({ text: `Kamu adalah sistem deteksi objek untuk komponen kopling (clutch) otomotif.\nTugasmu: deteksi semua objek di gambar target dan berikan koordinat bounding box YOLO.\n\nKelas yang valid:\n${state.classes.map((c,i)=>`  ${i}: ${c.name}`).join('\n')}\n\nFormat output WAJIB (HANYA baris anotasi, satu per baris, tanpa teks lain):\nnama_kelas cx cy w h\nSemua nilai cx,cy,w,h harus dinormalisasi antara 0.0 hingga 1.0.` });

    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const sImg = await blobToBase64(s.url);
      const sW = s.natW || state.imgNatW;
      const sH = s.natH || state.imgNatH;
      parts.push({ text: `=== CONTOH ${i+1}: ${s.name} ===` });
      parts.push({ inline_data: { mime_type: sImg.mimeType, data: sImg.data } });
      parts.push({ text: `Anotasi YOLO untuk gambar contoh ${i+1}:\n${annoToText(s.annotations, sW, sH)}` });
    }
    parts.push({ text: `=== TARGET: ${target.name} ===\nBerdasarkan ${samples.length} contoh di atas, deteksi SEMUA komponen clutch di gambar ini.\nBerikan HANYA baris anotasi:` });
    parts.push({ inline_data: { mime_type: targetImg.mimeType, data: targetImg.data } });

    const FALLBACK_MODELS = [
      { model: 'gemini-2.0-flash', ver: 'v1beta' },
      { model: 'gemini-1.5-flash-latest', ver: 'v1' },
      { model: 'gemini-1.5-pro-latest', ver: 'v1' },
    ];
    const selectedModel = document.getElementById('geminiModel')?.value || 'gemini-1.5-flash-latest';
    const selectedVer = selectedModel.startsWith('gemini-2') ? 'v1beta' : 'v1';
    const startChain = [{ model: selectedModel, ver: selectedVer }, ...FALLBACK_MODELS.filter(m => m.model !== selectedModel)];

    let data = null;
    let usedModel = selectedModel;

    for (const { model, ver } of startChain) {
      const endpoint = `https://generativelanguage.googleapis.com/${ver}/models/${model}:generateContent?key=${apiKey}`;
      try {
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.1, maxOutputTokens: 2048 } })
        });
        if (resp.status === 429) { continue; }
        if (!resp.ok) { const e = await resp.text(); throw new Error(`HTTP ${resp.status}`); }
        data = await resp.json();
        usedModel = model;
        break;
      } catch(fe) {
        if (fe.message?.includes('QUOTA_EXCEEDED')) continue;
        throw fe;
      }
    }

    if (!data) throw new Error('QUOTA_ALL: Semua model Gemini habis quota');
    if (data.error) throw new Error(data.error.message || 'Gemini API error');
    if (!data.candidates?.length) throw new Error('Response kosong dari Gemini');

    const candidate = data.candidates[0];
    if (candidate.finishReason === 'SAFETY') throw new Error('Diblokir filter keamanan');
    const raw = candidate.content?.parts?.filter(p=>p.text)?.map(p=>p.text)?.join('\n') || '';

    const boxes = parseYOLOResponse(raw, state.imgNatW, state.imgNatH);
    if (!boxes.length) {
      notify('Gemini tidak menemukan objek. Tambah lebih banyak contoh.', 'warn');
    } else {
      pushHistory();
      boxes.forEach(b => state.annotations.push(b));
      redrawCanvas(); renderAnnotations(); renderClasses();
      triggerAutosave();
      notify(`✦ Gemini: ${boxes.length} objek (${usedModel})`);
      updateAISampleBadge();
    }

  } catch(err) {
    let userMsg = err.message;
    if (err.message?.includes('Failed to fetch')) userMsg = 'Gagal konek ke Gemini API';
    else if (err.message?.includes('401') || err.message?.includes('API_KEY')) userMsg = 'API Key tidak valid';
    else if (err.message?.includes('403')) userMsg = 'API Key tidak punya akses. Aktifkan Gemini API';
    else if (err.message?.includes('429') || err.message?.includes('quota')) userMsg = '🚫 Quota API habis!';
    else if (err.message?.includes('QUOTA_ALL')) userMsg = '🚫 Semua model Gemini habis quota';
    notify('⚠ ' + userMsg, 'warn');
  } finally {
    btn.classList.remove('loading');
    btn.innerHTML = '<span>✦</span> AUTO LABEL (GEMINI)';
  }
}

function updateAISampleBadge() {
  const labeled = state.images.filter(im => im.annotations && im.annotations.length > 0).length;
  const el = document.getElementById('sampleCountBadge');
  if (el) {
    el.textContent = `${labeled} contoh`;
    el.style.color = labeled >= MIN_SAMPLES ? 'var(--accent3)' : 'var(--warn)';
  }
}

/* ─── PERSISTENCE ─── */
function persistCurrentAnnotations() {
  if (state.activeImg === null) return;
  // Guard: do not persist while a new image is still loading (prevents coordinate shift)
  if (!state.imgNatW || !state.imgNatH) return;
  const img = state.images[state.activeImg];
  if (!img) return;

  img.annotations = state.annotations.map(a => ({...a}));
  img.natW = state.imgNatW;
  img.natH = state.imgNatH;

  // Single localStorage key — YOLO lines prefixed with one meta comment
  // Format: # natW natH\n0 cx cy w h\n...
  const yolo = annotationsToYOLO(img.annotations, state.imgNatW, state.imgNatH);
  const packed = `# ${state.imgNatW} ${state.imgNatH}\n${yolo}`;
  try { localStorage.setItem('vl_' + img.name, packed); } catch(e) {}

  // Lightweight badge update — no full list rebuild
  _updateImgBadge(state.activeImg);
  updateFolderCount();
}

/** Update only the badge of one img-item in the list (no full rebuild) */
function _updateImgBadge(idx) {
  const el = document.querySelector(`#imgList .img-item:nth-child(${idx + 1})`);
  if (!el) return;
  const img = state.images[idx];
  if (!img) return;
  const haslabel = img.annotations && img.annotations.length > 0;
  const badge = el.querySelector('.badge');
  if (badge) {
    badge.className = 'badge ' + (haslabel ? 'badge-done' : 'badge-todo');
    badge.textContent = haslabel ? '✓' : '○';
  }
  const countEl = el.querySelectorAll('.img-meta span')[1];
  if (countEl) countEl.textContent = (img.annotations ? img.annotations.length : 0) + 'lbl';
  // Update thumb icon
  const thumb = el.querySelector('.img-thumb');
  if (thumb) thumb.textContent = haslabel ? '🖼️' : (img._hasTxtFile ? '📄' : '📋');
}

function showAutosavePill(msg = 'SAVED') {
  const pill = document.getElementById('autosavePill');
  if (pill) {
    pill.querySelector('.autosave-dot').style.background = msg.includes('Ver') ? 'var(--warn)' : 'var(--accent3)';
    pill.childNodes[1].textContent = msg;
    pill.style.display = 'flex';
    pill.style.animation = 'none';
    void pill.offsetWidth;
    pill.style.animation = 'fadeout 2.5s forwards';
    setTimeout(() => { pill.style.display = 'none'; }, 2600);
  }
}

function loadPersistedAnnotations(imgName, natW, natH) {
  try {
    const key  = 'vl_' + imgName;
    const raw  = localStorage.getItem(key);
    if (!raw) return null;

    let w = natW, h = natH;
    const lines = raw.trim().split('\n').filter(Boolean);

    // Parse optional meta comment: # <natW> <natH>
    let dataLines = lines;
    if (lines[0] && lines[0].startsWith('#')) {
      const m = lines[0].match(/^#\s*(\d+)\s+(\d+)/);
      if (m) { w = parseInt(m[1]); h = parseInt(m[2]); }
      dataLines = lines.slice(1);
    }

    // Fall back to passed-in dimensions if meta missing or zero
    if (!w || !h) { w = natW; h = natH; }
    if (!w || !h) return null;

    return dataLines.map(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 5) return null;
      const classIdx = parseInt(parts[0]);
      const cx = parseFloat(parts[1]), cy = parseFloat(parts[2]);
      const nw = parseFloat(parts[3]), nh = parseFloat(parts[4]);
      if (isNaN(classIdx) || isNaN(cx) || isNaN(nw)) return null;
      return { id: Date.now() + Math.random(), classIdx, source: 'saved',
               x: (cx - nw/2) * w, y: (cy - nh/2) * h, w: nw * w, h: nh * h };
    }).filter(Boolean);
  } catch(e) { return null; }
}

function annotationsToYOLO(annotations, natW, natH) {
  if (!natW || !natH) return '';
  return annotations.map(a => {
    const cx = ((a.x + a.w/2) / natW).toFixed(6);
    const cy = ((a.y + a.h/2) / natH).toFixed(6);
    const nw = (a.w / natW).toFixed(6);
    const nh = (a.h / natH).toFixed(6);
    return `${a.classIdx} ${cx} ${cy} ${nw} ${nh}`;
  }).join('\n');
}

/* ─── SAVE & EXPORT ─── */
function saveAnnotations() { quickSave(); }

/**
 * Generate classes.txt content — one class name per line,
 * preserving the original class index order used in YOLO labels.
 */
function generateClassesTxt() {
  return state.classes.map(c => c.name).join('\n');
}

/**
 * Write classes.txt to the currently open folder handle.
 * Silent — only shows warning if write fails.
 */
async function writeClassesTxtToFolder() {
  if (!_folderHandle) return;
  try {
    const fh = await _folderHandle.getFileHandle('classes.txt', { create: true });
    const w  = await fh.createWritable();
    await w.write(generateClassesTxt());
    await w.close();
  } catch(err) {
    console.warn('classes.txt write failed:', err);
  }
}

function exportYOLO() {
  if (!state.annotations.length) { notify('Tidak ada anotasi!', 'warn'); return; }
  const img = state.images[state.activeImg];
  const name = img ? img.name.replace(/\.[^.]+$/, '') : 'labels';
  const txt = annotationsToYOLO(state.annotations, state.imgNatW, state.imgNatH);
  downloadText(txt, name + '.txt');
  setTimeout(() => downloadText(generateClassesTxt(), 'classes.txt'), 100);
  notify('✓ Download: ' + name + '.txt + classes.txt');
}

function exportAllYOLO() {
  const labeled = state.images.filter(im => im.annotations && im.annotations.length > 0);
  if (!labeled.length) { notify('Belum ada gambar yang dilabeli!', 'warn'); return; }
  let count = 0;
  labeled.forEach(im => {
    const name = im.name.replace(/\.[^.]+$/, '');
    const natW = im.natW || state.imgNatW;
    const natH = im.natH || state.imgNatH;
    const txt = annotationsToYOLO(im.annotations, natW, natH);
    setTimeout(() => downloadText(txt, name + '.txt'), count * 80);
    count++;
  });
  setTimeout(() => downloadText(generateClassesTxt(), 'classes.txt'), count * 80 + 120);
  notify(`⬇ Download ${count} file YOLO + classes.txt`);
}

function downloadText(text, filename) {
  const blob = new Blob([text], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function exportCOCO() {
  if (!state.annotations.length) { notify('Tidak ada anotasi!', 'warn'); return; }
  const img = state.images[state.activeImg];
  const name = img ? img.name : 'image.jpg';
  const coco = {
    images: [{ id: 1, width: state.imgNatW, height: state.imgNatH, file_name: name }],
    categories: state.classes.map((c, i) => ({ id: i, name: c.name })),
    annotations: state.annotations.map((a, i) => ({
      id: i, image_id: 1, category_id: a.classIdx,
      bbox: [ Math.round(a.x), Math.round(a.y), Math.round(a.w), Math.round(a.h) ],
      area: Math.round(a.w * a.h), iscrowd: 0
    }))
  };
  const blob = new Blob([JSON.stringify(coco, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name.replace(/\.[^.]+$/,'') + '_coco.json';
  a.click();
  notify('✓ Export COCO JSON selesai');
}

/* ─── TRAINING ─── */
function updateLR(el) {
  const val = (el.value / 10000).toFixed(4);
  document.getElementById('lrVal').textContent = val;
}

function renderClassDist() {
  const classData = [
    { name: 'hub', count: 247 }, { name: 'rivet_big', count: 392 },
    { name: 'rivet_small', count: 388 }, { name: 'stopper_pin', count: 312 },
    { name: 'damper_red_long', count: 180 }, { name: 'damper_red_short', count: 175 },
    { name: 'damper_blue_long', count: 198 }, { name: 'damper_blue_short', count: 190 },
    { name: 'damper_green_long', count: 88 }, { name: 'damper_green_short', count: 76 },
    { name: 'damper_white_long', count: 145 }, { name: 'damper_white_short', count: 56 },
    { name: 'damper_black_long', count: 42 }, { name: 'damper_black_short', count: 38 },
    { name: 'damper_yellow_long', count: 67 }, { name: 'damper_yellow_short', count: 55 },
    { name: 'damper_grey_long', count: 49 }, { name: 'damper_grey_short', count: 44 },
    { name: 'cushion_yellow', count: 210 }, { name: 'cushion_green', count: 94 },
    { name: 'cushion_white', count: 82 }, { name: 'cushion_black', count: 60 },
    { name: 'cushion_grey', count: 35 }, { name: 'damper_sky_blue_long', count: 120 },
    { name: 'plate_nail_black', count: 156 }, { name: 'plate_nail_white', count: 88 },
    { name: 'plate_nail_pink', count: 42 }, { name: 'damper_orange_short', count: 95 },
  ];
  const max = Math.max(...classData.map(c => c.count));
  const colors = state.classes.map(c => c.color);
  const distEl = document.getElementById('classDist');
  if (!distEl) return;
  distEl.innerHTML = classData.map((c, i) => `
    <div class="dist-row">
      <div class="dist-label">${c.name}</div>
      <div class="dist-bar-bg"><div class="dist-bar" style="width:${c.count/max*100}%;background:${colors[i%colors.length]}"></div></div>
      <div class="dist-count">${c.count}</div>
    </div>
  `).join('');
}

/* ══════════════════════════════════════════════════════════════
   TRAINING PIPELINE — Real implementation
   Flow: Collect labels → Export to server → Train via API → Poll → Deploy
══════════════════════════════════════════════════════════════ */

let trState = {
  datasetReady: false,
  datasetPath:  '',
  weightPath:   '',
  bestMap50:    0,
  bestEpoch:    0,
  pollTimer:    null,
  polling:      false,
  mode:         'api',   // 'api' | 'manual'
};

/* ── Helpers ── */
function trLog(msg, type = 'info') {
  const el = document.getElementById('trainLog');
  if (!el) return;
  const line = document.createElement('span');
  line.className = 'log-line ' + type;
  line.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
  el.appendChild(line);
  el.appendChild(document.createElement('br'));
  el.scrollTop = el.scrollHeight;
}

function trSetStatus(msg, color = 'var(--muted)') {
  const el = document.getElementById('trainStatusLabel');
  if (el) el.innerHTML = `<div class="dot" style="background:${color}"></div><span>${msg}</span>`;
}

function trActivateStep(n) {
  for (let i = 1; i <= 4; i++) {
    const s = document.getElementById('pstep' + i);
    if (!s) continue;
    s.style.background = i === n ? 'var(--surface2)' : 'var(--surface)';
    const title = s.querySelector('div:last-child');
    if (title) title.style.color = i <= n ? 'var(--accent)' : 'var(--muted)';
  }
}

/* ── Step 1: Dataset ── */
function trUpdateSplitLabel() {
  const v = parseInt(document.getElementById('trSplitSlider')?.value || 80);
  const el = document.getElementById('trSplitLabel');
  if (el) el.textContent = `Train ${v}% / Val ${100 - v}%`;
}

/**
 * Load annotations dari localStorage untuk SEMUA gambar yang belum di-buka.
 * Gambar hanya punya im.annotations jika pernah dibuka di canvas.
 * Fungsi ini mengisi im.annotations dari localStorage (key: vl_<imgName>)
 * sehingga trRefreshDataset dan trPrepareDataset bisa baca semua data.
 */
async function trCheckDataset() {
  const url       = beGetUrl();
  const dataPath  = document.getElementById('trDatasetPath')?.value.trim() || 'dataset';
  trLog(`Mengecek dataset di server: ${dataPath}`, 'info');
  try {
    const r = await fetch(`${url}/dataset_info?path=${encodeURIComponent(dataPath)}`);
    const d = await r.json();
    trLog(`Server dir: ${d.server_dir}`, 'info');
    trLog(`Dataset root: ${d.dataset_root}`, 'info');
    trLog(`dataset.yaml: ${d.yaml_exists ? '✓ ADA' : '✗ TIDAK ADA'} → ${d.yaml_path}`, d.yaml_exists ? 'ok' : 'warn');
    if (d.counts) {
      trLog(`images/train: ${d.counts.images_train} file  |  images/val: ${d.counts.images_val} file`, 'info');
      trLog(`labels/train: ${d.counts.labels_train} file  |  labels/val: ${d.counts.labels_val} file`, 'info');
    }
    if (d.yaml_exists) {
      // Use the absolute yaml path for training
      trState.yamlPathAbs = d.yaml_path;
      trState.datasetReady = true;
      trLog(`✓ yamlPathAbs di-set: ${d.yaml_path}`, 'ok');
      notify('✓ Dataset OK! Siap training.');
    } else {
      trLog(`✗ Klik "Export Dataset ke Server" dulu!`, 'warn');
      notify('Dataset belum ada di server. Export dulu!', 'warn');
    }
  } catch(e) {
    trLog(`✗ Gagal cek: ${e.message}`, 'warn');
  }
}

function trHydrateAllAnnotations() {
  let loaded = 0;
  state.images.forEach(im => {
    // Sudah ada annotations di memory → skip
    if (im.annotations && im.annotations.length > 0) return;

    try {
      const key  = 'vl_' + im.name;
      const yolo = localStorage.getItem(key);
      if (!yolo || !yolo.trim()) return;

      // Parse packed format: first line may be "# natW natH"
      let natW = im.natW || 0;
      let natH = im.natH || 0;
      const allLines = yolo.trim().split('\n').filter(Boolean);
      let dataLines  = allLines;
      if (allLines[0] && allLines[0].startsWith('#')) {
        const m = allLines[0].match(/^#\s*(\d+)\s+(\d+)/);
        if (m) {
          natW = natW || parseInt(m[1]);
          natH = natH || parseInt(m[2]);
          im.natW = im.natW || natW;
          im.natH = im.natH || natH;
        }
        dataLines = allLines.slice(1);
      }
      // Legacy fallback: try old _meta key
      if (!natW || !natH) {
        try {
          const metaRaw = localStorage.getItem(key + '_meta');
          if (metaRaw) { const m2 = JSON.parse(metaRaw); natW = m2.natW||640; natH = m2.natH||640; }
        } catch(_) {}
      }
      if (!natW) natW = 640;
      if (!natH) natH = 640;

      const annotations = dataLines.map(line => {
        const p = line.trim().split(/\s+/);
        if (p.length < 5) return null;
        const classIdx = parseInt(p[0]);
        const cx = parseFloat(p[1]), cy = parseFloat(p[2]);
        const nw = parseFloat(p[3]), nh = parseFloat(p[4]);
        if (isNaN(classIdx) || isNaN(cx)) return null;
        return {
          id: Date.now() + Math.random(),
          classIdx, source: 'saved',
          x: (cx - nw / 2) * natW,
          y: (cy - nh / 2) * natH,
          w: nw * natW,
          h: nh * natH,
        };
      }).filter(Boolean);

      if (annotations.length > 0) {
        im.annotations = annotations;
        loaded++;
      }
    } catch(e) { /* ignore corrupt entries */ }
  });
  return loaded;
}

function trRefreshDataset() {
  // Load semua annotations dari localStorage dulu
  const hydrated = trHydrateAllAnnotations();

  const labeled    = state.images.filter(im => im.annotations && im.annotations.length > 0);
  const totalBoxes = labeled.reduce((s, im) => s + (im.annotations?.length || 0), 0);

  const usedClasses = new Set();
  labeled.forEach(im => im.annotations?.forEach(a => usedClasses.add(a.classIdx)));

  document.getElementById('trTotalImgs').textContent    = state.images.length;
  document.getElementById('trLabeledImgs').textContent  = labeled.length;
  document.getElementById('trTotalBoxes').textContent   = totalBoxes;
  document.getElementById('trActiveClasses').textContent = usedClasses.size;

  if (hydrated > 0) {
    trLog(`↺ Di-load dari localStorage: ${hydrated} gambar baru terdeteksi`, 'info');
  }

  // Class distribution
  const counts = {};
  state.classes.forEach((c, i) => { if (usedClasses.has(i)) counts[c.name] = 0; });
  labeled.forEach(im => im.annotations?.forEach(a => {
    const name = state.classes[a.classIdx]?.name;
    if (name) counts[name] = (counts[name] || 0) + 1;
  }));

  const maxCount = Math.max(...Object.values(counts), 1);
  const distEl = document.getElementById('trClassDist');
  if (distEl) {
    distEl.innerHTML = Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([name, cnt]) => {
      const cls = state.classes.find(c => c.name === name);
      const pct = Math.round(cnt / maxCount * 100);
      return `<div class="dist-item">
        <div class="dist-label" style="color:${cls?.color||'#888'}">${name}</div>
        <div class="dist-bar-wrap"><div class="dist-bar-fill" style="width:${pct}%;background:${cls?.color||'#888'}88"></div></div>
        <div class="dist-count">${cnt}</div>
      </div>`;
    }).join('');
  }

  trUpdateCmd();
}

async function trPrepareDataset() {
  const url = beGetUrl();

  // Pastikan semua annotations dari localStorage sudah di-load ke state
  trHydrateAllAnnotations();

  const labeled = state.images.filter(im => im.annotations && im.annotations.length > 0);
  if (!labeled.length) { notify('Belum ada gambar yang dilabel!', 'warn'); return; }

  const btn    = document.getElementById('trPrepareBtn');
  const status = document.getElementById('trPrepareStatus');
  btn.disabled = true;
  btn.textContent = '⏳ Menyiapkan...';
  status.style.display = 'block';
  status.style.color = 'var(--accent)';

  const datasetPath = document.getElementById('trDatasetPath')?.value.trim() || 'dataset';
  const split = parseInt(document.getElementById('trSplitSlider')?.value || 80) / 100;

  const shuffled   = [...labeled].sort(() => Math.random() - 0.5);
  const trainCount = Math.max(1, Math.floor(shuffled.length * split));
  const trainImgs  = shuffled.slice(0, trainCount);
  const valImgs    = shuffled.slice(trainCount);

  trLog(`=== EXPORT DATASET ===`, 'accent');
  trLog(`${labeled.length} gambar → train:${trainImgs.length}  val:${valImgs.length}`, 'info');

  // Helper: blob URL → base64 jpeg + capture natural dimensions
  async function imgToBase64(imgObj) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width  = img.naturalWidth  || 640;
        c.height = img.naturalHeight || 640;
        c.getContext('2d').drawImage(img, 0, 0);
        // Store actual dimensions back onto the image object for correct YOLO coords
        if (!imgObj.natW) imgObj.natW = img.naturalWidth;
        if (!imgObj.natH) imgObj.natH = img.naturalHeight;
        resolve(c.toDataURL('image/jpeg', 0.92).split(',')[1]);
      };
      img.onerror = () => reject(new Error('Gagal load: ' + imgObj.name));
      img.src = imgObj.url;
    });
  }

  function buildLabel(im) {
    const natW = im.natW || state.imgNatW || 640;
    const natH = im.natH || state.imgNatH || 640;
    return annotationsToYOLO(im.annotations, natW, natH);
  }

  // Only classes actually used
  const usedIdxs = new Set();
  labeled.forEach(im => im.annotations?.forEach(a => usedIdxs.add(a.classIdx)));
  const classNames = state.classes
    .map((c, i) => ({ name: c.name, i }))
    .filter(c => usedIdxs.has(c.i))
    .map(c => c.name);

  try {
    const BATCH = 5;
    let imgSent = 0;

    // ── 1. Gambar train dulu (imgToBase64 mengisi natW/natH) ──
    trLog(`Mengirim ${trainImgs.length} gambar train...`, 'info');
    for (let b = 0; b < trainImgs.length; b += BATCH) {
      const chunk  = trainImgs.slice(b, b + BATCH);
      const images = [];
      for (const im of chunk) {
        try { images.push({ filename: im.name, image: await imgToBase64(im) }); }
        catch(e) { trLog(`⚠ Skip ${im.name}: ${e.message}`, 'warn'); }
      }
      if (!images.length) continue;
      const r = await fetch(`${url}/export_images`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ output_dir: `${datasetPath}/images/train`, images })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Gagal kirim gambar train');
      imgSent += d.saved.length;
      status.textContent = `Gambar train (${imgSent}/${trainImgs.length})...`;
    }
    trLog(`✓ Gambar train: ${imgSent} tersimpan`, 'ok');

    // ── 2. Gambar val ──
    trLog(`Mengirim ${valImgs.length} gambar val...`, 'info');
    imgSent = 0;
    for (let b = 0; b < valImgs.length; b += BATCH) {
      const chunk  = valImgs.slice(b, b + BATCH);
      const images = [];
      for (const im of chunk) {
        try { images.push({ filename: im.name, image: await imgToBase64(im) }); }
        catch(e) { trLog(`⚠ Skip ${im.name}: ${e.message}`, 'warn'); }
      }
      if (!images.length) continue;
      const r = await fetch(`${url}/export_images`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ output_dir: `${datasetPath}/images/val`, images })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Gagal kirim gambar val');
      imgSent += d.saved.length;
      status.textContent = `Gambar val (${imgSent}/${valImgs.length})...`;
    }
    trLog(`✓ Gambar val: ${imgSent} tersimpan`, 'ok');

    // ── 3. Labels train (natW/natH sudah terisi dari step 1&2) ──
    status.textContent = `Mengirim ${trainImgs.length} labels train...`;
    const r1 = await fetch(`${url}/export_labels`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        output_dir: `${datasetPath}/labels/train`,
        labels: trainImgs.map(im => ({
          filename: im.name.replace(/\.[^.]+$/, '') + '.txt',
          content: buildLabel(im), overwrite: true
        }))
      })
    });
    const d1 = await r1.json();
    if (!r1.ok) throw new Error(d1.error || 'Gagal kirim train labels');
    trLog(`✓ Train labels: ${d1.saved.length} file → ${d1.output_dir}`, 'ok');

    // ── 4. Labels val ──
    status.textContent = `Mengirim ${valImgs.length} labels val...`;
    const r2 = await fetch(`${url}/export_labels`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        output_dir: `${datasetPath}/labels/val`,
        labels: valImgs.map(im => ({
          filename: im.name.replace(/\.[^.]+$/, '') + '.txt',
          content: buildLabel(im), overwrite: true
        }))
      })
    });
    const d2 = await r2.json();
    if (!r2.ok) throw new Error(d2.error || 'Gagal kirim val labels');
    trLog(`✓ Val labels: ${d2.saved.length} file → ${d2.output_dir}`, 'ok');

    // ── 5. Save dataset.yaml ke disk ──
    status.textContent = 'Menyimpan dataset.yaml...';
    const r3 = await fetch(`${url}/save_yaml`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path:  `${datasetPath}/dataset.yaml`,
        train: `${datasetPath}/images/train`,
        val:   `${datasetPath}/images/val`,
        nc:    classNames.length,
        names: classNames
      })
    });
    const d3 = await r3.json();
    if (!r3.ok) throw new Error(d3.error || 'Gagal simpan dataset.yaml');
    trLog(`✓ dataset.yaml → ${d3.path}  (${classNames.length} kelas)`, 'ok');

    trState.datasetReady = true;
    trState.datasetPath  = datasetPath;
    trState.yamlPathAbs  = d3.path;   // absolute path from server — used for training
    trLog(`=== DATASET SIAP ✓ ===`, 'ok');
    status.textContent = `✓ Selesai! Train:${trainImgs.length} | Val:${valImgs.length} | ${d3.path}`;
    status.style.color = 'var(--accent3)';
    trActivateStep(2);
    notify('✓ Dataset lengkap! Lanjut ke Konfigurasi → Training.');

  } catch(e) {
    trLog(`✗ ${e.message}`, 'warn');
    status.textContent = `✗ ${e.message}`;
    status.style.color = 'var(--danger)';
    notify('Export gagal: ' + e.message, 'warn');
  }

  btn.disabled = false;
  btn.textContent = '📤 EXPORT DATASET KE SERVER';
}

/* ── Step 2: Command preview ── */
function trUpdateCmd() {
  const el = document.getElementById('trCmdPreview');
  if (!el) return;
  const modelName  = document.getElementById('modelName')?.value || 'Clutch_v4';
  const arch       = document.getElementById('architecture')?.value || 'yolov8s';
  const weights    = document.getElementById('trBaseWeights')?.value || 'yolov8s.pt';
  const epochs     = document.getElementById('epochs')?.value || '100';
  const batch      = document.getElementById('batchSize')?.value || '16';
  const imgSize    = document.getElementById('trImgSize')?.value || '640';
  const patience   = document.getElementById('trPatience')?.value || '20';
  const dataPath   = document.getElementById('trDatasetPath')?.value || 'dataset';
  const lr         = document.getElementById('lrVal')?.textContent || '0.001';

  const customW    = document.getElementById('trCustomWeights')?.value;
  const finalWeights = (weights === 'custom' && customW) ? customW : weights;

  const cmd = `yolo train \\\n  model=${arch}.pt \\\n  pretrained=${finalWeights} \\\n  data=${dataPath}/dataset.yaml \\\n  epochs=${epochs} \\\n  batch=${batch} \\\n  imgsz=${imgSize} \\\n  lr0=${lr} \\\n  patience=${patience} \\\n  name=${modelName} \\\n  project=runs/detect`;

  el.textContent = cmd;
}

function trCopyCmd() {
  const el = document.getElementById('trCmdPreview');
  if (!el) return;
  navigator.clipboard?.writeText(el.textContent)
    .then(() => notify('✓ Command di-copy!'))
    .catch(() => notify('Gagal copy — select manual', 'warn'));
}

document.getElementById('trBaseWeights')?.addEventListener('change', function() {
  const customInp = document.getElementById('trCustomWeights');
  if (customInp) customInp.style.display = this.value === 'custom' ? 'block' : 'none';
  trUpdateCmd();
});

/* ── Step 3: Training ── */
function trModeChanged() {
  trState.mode = document.querySelector('input[name="trMode"]:checked')?.value || 'api';
}

async function trCheckBackend() {
  const url = beGetUrl();
  const dot   = document.getElementById('trBackendDot');
  const label = document.getElementById('trBackendLabel');
  if (dot) dot.style.background = 'var(--warn)';
  if (label) label.textContent = 'Memeriksa...';
  try {
    const r = await fetch(`${url}/status`, { signal: AbortSignal.timeout(3000) });
    const d = await r.json();
    if (dot) dot.style.background = 'var(--accent3)';
    if (label) label.textContent = d.model_loaded
      ? `✓ ${d.model_name} (${d.num_classes} kelas)`
      : '✓ Backend OK — belum ada model';
    trLog(`Backend OK: ${url} | ${d.model_loaded ? d.model_name : 'no model'}`, 'ok');
    return true;
  } catch(e) {
    if (dot) dot.style.background = 'var(--danger)';
    if (label) label.textContent = '✗ Tidak tersambung';
    trLog(`Backend tidak tersambung: ${url}`, 'warn');
    return false;
  }
}

function toggleTraining() {
  if (state.trainingRunning) stopTraining();
  else startTraining();
}

async function startTraining() {
  const mode = trState.mode;
  const modelName = document.getElementById('modelName')?.value || 'Clutch_v4';

  if (mode === 'api') {
    await trStartViaBackend(modelName);
  } else {
    trStartManualMode(modelName);
  }
}

async function trStartViaBackend(modelName) {
  const url     = beGetUrl();
  const arch    = document.getElementById('architecture')?.value || 'yolov8s';
  const weights = document.getElementById('trBaseWeights')?.value || 'yolov8s.pt';
  const epochs  = parseInt(document.getElementById('epochs')?.value || 100);
  const batch   = document.getElementById('batchSize')?.value || '16';
  const imgSize = document.getElementById('trImgSize')?.value || '640';
  const lr      = document.getElementById('lrVal')?.textContent || '0.001';
  const patience= document.getElementById('trPatience')?.value || '20';
  const dataPath= document.getElementById('trDatasetPath')?.value || 'dataset';

  const customW  = document.getElementById('trCustomWeights')?.value;
  const finalW   = (weights === 'custom' && customW) ? customW : weights;

  // Check backend first
  const ok = await trCheckBackend();
  if (!ok) {
    trLog('Backend tidak tersambung! Gunakan mode Manual atau periksa server.', 'warn');
    notify('Backend tidak tersambung!', 'warn');
    return;
  }

  state.trainingRunning = true;
  state.trainingEpoch   = 0;
  state.trainingTotal   = epochs;
  trState.bestMap50     = 0;
  trState.bestEpoch     = 0;

  const btn = document.getElementById('trainBtn');
  btn.textContent = '⏹ STOP TRAINING';
  btn.classList.add('running');
  trSetStatus('Mengirim perintah training ke backend...', 'var(--warn)');
  trActivateStep(3);
  trLog(`=== MULAI TRAINING: ${modelName} ===`, 'accent');
  trLog(`Arch: ${arch} | Base: ${finalW} | Epochs: ${epochs} | Batch: ${batch} | imgSz: ${imgSize}`, 'info');

  try {
    const r = await fetch(`${url}/train`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model_path: finalW,
        data:       trState.yamlPathAbs || `${dataPath}/dataset.yaml`,  // prefer absolute path from export
        epochs, batch: parseInt(batch), imgsz: parseInt(imgSize),
        lr0: parseFloat(lr), patience: parseInt(patience),
        name: modelName, project: 'runs/detect'
      })
    });
    const d = await r.json();

    if (!r.ok) {
      // Backend mungkin tidak punya endpoint /train — fallback ke polling + manual
      trLog(`Backend tidak punya /train endpoint. Polling mode aktif.`, 'warn');
      trLog(`Jalankan command ini di terminal server:`, 'warn');
      trLog(document.getElementById('trCmdPreview')?.textContent || '', 'info');
      trStartPolling(modelName, dataPath);
      return;
    }

    trLog(`Training dimulai di backend! Job ID: ${d.job_id || 'N/A'}`, 'ok');
    trStartPolling(modelName, dataPath, d.job_id);

  } catch(e) {
    // Backend tidak punya /train → fallback ke polling
    trLog(`Endpoint /train tidak tersedia. Aktifkan polling manual.`, 'warn');
    trLog(`Salin command ini dan jalankan di server:`, 'info');
    trLog(document.getElementById('trCmdPreview')?.textContent || '', 'accent');
    trStartPolling(modelName, dataPath);
    document.getElementById('trPollBtn').style.display = 'inline-block';
  }
}

function trStartManualMode(modelName) {
  const dataPath = document.getElementById('trDatasetPath')?.value || 'dataset';
  state.trainingRunning = true;
  const btn = document.getElementById('trainBtn');
  btn.textContent = '⏹ STOP';
  btn.classList.add('running');
  trSetStatus('Mode Manual — menunggu hasil training...', 'var(--warn)');
  trActivateStep(3);
  trLog(`=== MODE MANUAL: ${modelName} ===`, 'accent');
  trLog(`1. Copy command di Step 2 dan jalankan di terminal`, 'info');
  trLog(`2. Polling otomatis akan cek file weight setiap 10 detik`, 'info');
  trLog(`3. Atau klik "Load Weight Manual" di Step 4 jika training selesai`, 'info');
  document.getElementById('trPollBtn').style.display = 'inline-block';
  trStartPolling(modelName, dataPath);
}

/* Poll /train_status atau cek file weight langsung */
let _pollCount = 0;
function trStartPolling(modelName, dataPath, jobId = null) {
  trState.polling   = true;
  _pollCount = 0;
  const expectedWeight = `runs/detect/${modelName}/weights/best.pt`;
  trState.weightPath   = expectedWeight;

  const poll = async () => {
    if (!state.trainingRunning || !trState.polling) return;
    _pollCount++;

    const url = beGetUrl();

    // Try /train_status endpoint
    try {
      const endpoint = jobId ? `${url}/train_status?job_id=${jobId}` : `${url}/train_status`;
      const r = await fetch(endpoint, { signal: AbortSignal.timeout(3000) });
      if (r.ok) {
        const d = await r.json();
        const epoch   = d.epoch || 0;
        const total   = d.total_epochs || state.trainingTotal;
        const map50   = d.map50   || 0;
        const precision = d.precision || 0;
        const recall  = d.recall  || 0;
        const loss    = d.box_loss || 0;
        const done    = d.done || d.status === 'finished';

        state.trainingEpoch = epoch;
        state.trainingTotal = total;

        document.getElementById('progressFill').style.width  = ((epoch/total)*100) + '%';
        document.getElementById('epochDisplay').textContent  = `${epoch} / ${total} Epoch`;
        document.getElementById('mPrecision').textContent    = precision.toFixed(3);
        document.getElementById('mRecall').textContent       = recall.toFixed(3);
        document.getElementById('mMap50').textContent        = map50.toFixed(3);
        document.getElementById('mLoss').textContent         = loss.toFixed(4);

        if (map50 > trState.bestMap50) { trState.bestMap50 = map50; trState.bestEpoch = epoch; }

        if (epoch % 5 === 0 || epoch <= 3) {
          trLog(`[EP ${String(epoch).padStart(3,'0')}/${total}] P=${precision.toFixed(3)} R=${recall.toFixed(3)} mAP50=${map50.toFixed(3)} loss=${loss.toFixed(4)}`,
            map50 > 0.8 ? 'ok' : 'info');
        }

        if (done || (d.weight_path && d.weight_path !== trState.weightPath)) {
          trState.weightPath = d.weight_path || expectedWeight;
          stopTraining(true);
          return;
        }
      }
    } catch(_) {
      // Backend tidak punya /train_status — tampilkan dots saja
      if (_pollCount % 6 === 0) trLog(`Polling... (${_pollCount * 10}s) Menunggu backend`, 'info');
    }

    if (state.trainingRunning) trState.pollTimer = setTimeout(poll, 10000);
  };

  trState.pollTimer = setTimeout(poll, 5000);
}

function trTogglePoll() {
  const btn = document.getElementById('trPollBtn');
  if (trState.polling) {
    trState.polling = false;
    clearTimeout(trState.pollTimer);
    if (btn) btn.textContent = '▶ Resume Poll';
    trLog('Polling dijeda', 'warn');
  } else {
    trState.polling = true;
    if (btn) btn.textContent = '⏸ Pause Poll';
    trLog('Polling dilanjutkan', 'info');
    const modelName = document.getElementById('modelName')?.value || 'Clutch_v4';
    const dataPath  = document.getElementById('trDatasetPath')?.value || 'dataset';
    trStartPolling(modelName, dataPath);
  }
}

function stopTraining(done = false) {
  clearTimeout(trState.pollTimer);
  trState.polling = false;
  state.trainingRunning = false;

  const btn = document.getElementById('trainBtn');
  btn.classList.remove('running');
  btn.textContent = done ? '✓ TRAINING SELESAI' : '⚡ MULAI TRAINING';
  setTimeout(() => { if (!state.trainingRunning) btn.textContent = '⚡ MULAI TRAINING'; }, 4000);

  document.getElementById('trPollBtn').style.display = 'none';

  const color = done ? 'var(--accent3)' : 'var(--accent2)';
  trSetStatus(done ? 'Training selesai!' : 'Training dihentikan', color);

  if (done) {
    trLog(`=== SELESAI! Best mAP@50: ${trState.bestMap50.toFixed(3)} @ Epoch ${trState.bestEpoch} ===`, 'ok');
    trLog(`Weight: ${trState.weightPath}`, 'ok');

    // Update Step 4
    const weightEl = document.getElementById('trLastWeight');
    const metricsEl = document.getElementById('trLastMetrics');
    if (weightEl) weightEl.innerHTML = `<span style="color:var(--accent)">${trState.weightPath}</span>`;
    if (metricsEl) metricsEl.textContent = `mAP@50: ${trState.bestMap50.toFixed(3)} · Best epoch: ${trState.bestEpoch}`;

    const loadBtn = document.getElementById('trLoadWeightBtn');
    if (loadBtn) loadBtn.disabled = false;

    // Auto-fill manual weight path
    const manualInp = document.getElementById('trManualWeightPath');
    if (manualInp) manualInp.value = trState.weightPath;

    trActivateStep(4);
    notify('✓ Training selesai! Weight siap di-deploy.');
  } else {
    trLog(`Training dihentikan di epoch ${state.trainingEpoch}`, 'warn');
  }
}

/* ── Step 4: Deploy ── */
async function trLoadWeightToBackend() {
  await trLoadWeightPath(trState.weightPath);
}

async function trLoadManualWeight() {
  const path = document.getElementById('trManualWeightPath')?.value?.trim();
  if (!path) { notify('Masukkan path weight!', 'warn'); return; }
  await trLoadWeightPath(path);
}

async function trLoadWeightPath(path) {
  const url = beGetUrl();
  trLog(`Memuat weight: ${path}`, 'info');
  try {
    const r = await fetch(`${url}/load_model`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_path: path })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Gagal load model');

    trLog(`✓ Model dimuat: ${d.model_name} | ${d.num_classes} kelas | device: ${d.device}`, 'ok');

    const statusEl = document.getElementById('trDeployStatus');
    const statusText = document.getElementById('trDeployStatusText');
    if (statusEl) statusEl.style.display = 'block';
    if (statusText) statusText.innerHTML =
      `✓ Model aktif: <strong>${d.model_name}</strong> · ${d.num_classes} kelas · ${d.device} · load ${d.load_time_ms}ms`;

    // Sync backend dot di panel kiri juga
    beSetDot('connected');
    beSetStatus(`✓ ${d.model_name} (${d.num_classes} kelas)`, 'ok');
    beSetBtnsEnabled(true);

    trActivateStep(4);
    notify(`✓ ${d.model_name} siap untuk auto-label!`);
  } catch(e) {
    trLog(`✗ Gagal load weight: ${e.message}`, 'warn');
    notify('Gagal load model: ' + e.message, 'warn');
  }
}

async function trAutoLabelAll() {
  notify('Beralih ke halaman Labeling → jalankan Auto-Label All');
  // Switch to labeling page and trigger auto-label all
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-labeling')?.classList.add('active');
  document.querySelectorAll('.tab-btn')[0]?.classList.add('active');
  setTimeout(() => backendDetectAll(), 300);
}

async function trAutoLabelUnlabeled() {
  notify('Beralih ke halaman Labeling → jalankan Auto-Label Gambar Baru');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-labeling')?.classList.add('active');
  document.querySelectorAll('.tab-btn')[0]?.classList.add('active');
  setTimeout(() => backendDetectUnlabeled(), 300);
}

/* ── Config inputs update cmd ── */
['modelName','architecture','trBaseWeights','epochs','batchSize','trImgSize','trPatience','trDatasetPath'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', trUpdateCmd);
  document.getElementById(id)?.addEventListener('change', trUpdateCmd);
});

function scrollToStep(n) {
  trActivateStep(n);
  document.getElementById(`stepCard${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ─── RESULTS CHARTS ─── */
let chartsInited = false;

function initCharts() {
  if (chartsInited) return;
  chartsInited = true;
  renderModelTable();
  const epochs = Array.from({length: 100}, (_, i) => i + 1);
  function smooth(arr, factor = 0.1) {
    let s = arr[0];
    return arr.map(v => { s = s * (1 - factor) + v * factor; return parseFloat(s.toFixed(4)); });
  }
  const mapRaw = epochs.map(e => 0.5 + (e/100) * 0.43 + (Math.random()-0.5)*0.04);
  const map5095 = epochs.map(e => 0.35 + (e/100) * 0.35 + (Math.random()-0.5)*0.04);
  const lossBox = epochs.map(e => 1.8 - (e/100) * 1.4 + (Math.random()-0.5)*0.08);
  const lossCls = epochs.map(e => 1.4 - (e/100) * 1.1 + (Math.random()-0.5)*0.06);
  const chartDefaults = {
    responsive: true, animation: { duration: 1200 },
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: '#242830' }, ticks: { color: '#6b7280', font: { family: 'Space Mono', size: 9 }, maxTicksLimit: 10 } },
      y: { grid: { color: '#242830' }, ticks: { color: '#6b7280', font: { family: 'Space Mono', size: 9 } } }
    }
  };
  new Chart(document.getElementById('mapChart'), {
    type: 'line',
    data: { labels: epochs, datasets: [
      { data: smooth(mapRaw, 0.15), borderColor: '#00e5ff', borderWidth: 2, pointRadius: 0, tension: 0.4, fill: false },
      { data: smooth(map5095, 0.15), borderColor: '#ff6b35', borderWidth: 2, pointRadius: 0, tension: 0.4, fill: false }
    ]},
    options: { ...chartDefaults, scales: { ...chartDefaults.scales, y: { ...chartDefaults.scales.y, min: 0, max: 1 } } }
  });
  new Chart(document.getElementById('lossChart'), {
    type: 'line',
    data: { labels: epochs, datasets: [
      { data: smooth(lossBox, 0.15), borderColor: '#ffd600', borderWidth: 2, pointRadius: 0, tension: 0.4, fill: false },
      { data: smooth(lossCls, 0.15), borderColor: '#ff3d5a', borderWidth: 2, pointRadius: 0, tension: 0.4, fill: false }
    ]},
    options: chartDefaults
  });
  const classNames = state.classes.map(c => c.name);
  const classMAP = [0.98, 0.87, 0.85, 0.91, 0.89, 0.76, 0.94, 0.82];
  new Chart(document.getElementById('classChart'), {
    type: 'bar',
    data: { labels: classNames, datasets: [{ data: classMAP, backgroundColor: state.classes.map(c => c.color + '99'), borderColor: state.classes.map(c => c.color), borderWidth: 1 }]},
    options: { ...chartDefaults, scales: { ...chartDefaults.scales, y: { ...chartDefaults.scales.y, min: 0, max: 1 } }, plugins: { legend: { display: false } } }
  });
  new Chart(document.getElementById('compareChart'), {
    type: 'bar',
    data: { labels: ['Clutch_v1', 'Clutch_v2', 'Clutch_v3'], datasets: [
      { label: 'mAP@50', data: [0.781, 0.851, 0.923], backgroundColor: '#00e5ff66', borderColor: '#00e5ff', borderWidth: 1 },
      { label: 'Precision', data: [0.762, 0.882, 0.911], backgroundColor: '#ff6b3566', borderColor: '#ff6b35', borderWidth: 1 },
      { label: 'Recall', data: [0.710, 0.843, 0.897], backgroundColor: '#39ff1466', borderColor: '#39ff14', borderWidth: 1 }
    ]},
    options: { ...chartDefaults, plugins: { legend: { display: true, labels: { color: '#6b7280', font: { family: 'Space Mono', size: 9 }, boxWidth: 10 } } }, scales: { ...chartDefaults.scales, y: { ...chartDefaults.scales.y, min: 0, max: 1 } } }
  });
}

function renderModelTable() {
  const models = [
    { name: 'Clutch_v3', arch: 'YOLOv8s', epoch: 100, map50: 0.923, prec: 0.911, rec: 0.897, status: 'deployed', date: '2026-02-28' },
    { name: 'Clutch_v2', arch: 'YOLOv8n', epoch: 80, map50: 0.851, prec: 0.882, rec: 0.843, status: 'ready', date: '2026-02-10' },
    { name: 'Clutch_v1', arch: 'YOLOv8n', epoch: 60, map50: 0.781, prec: 0.762, rec: 0.710, status: 'ready', date: '2026-01-20' },
  ];
  document.getElementById('modelTableBody').innerHTML = models.map(m => `
    <tr>
      <td class="model-name-cell">${m.name}</td><td>${m.arch}</td><td>${m.epoch}</td>
      <td><div class="map-bar">${m.map50.toFixed(3)}<div class="map-mini-bar"><div class="map-mini-fill" style="width:${m.map50*100}%"></div></div></div></td>
      <td>${m.prec.toFixed(3)}</td><td>${m.rec.toFixed(3)}</td>
      <td><span class="status-badge ${m.status}">${m.status}</span></td><td>${m.date}</td>
      <td class="action-cell"><button onclick="notify('Deploy ${m.name}')">Deploy</button><button onclick="notify('Download ${m.name}.pt')">↓</button></td>
    </tr>
  `).join('');
}

/* ─── UI HELPERS ─── */
function toggleShortcutPanel() {
  const p = document.getElementById('shortcutPanel');
  p.classList.toggle('collapsed');
  p.classList.toggle('expanded');
}

function notify(msg, type = 'ok') {
  const el = document.getElementById('notification');
  el.textContent = msg;
  el.style.display = 'block';
  el.style.borderColor = type === 'warn' ? 'var(--warn)' : 'var(--accent3)';
  el.style.color = type === 'warn' ? 'var(--warn)' : 'var(--accent3)';
  clearTimeout(notify._t);
  notify._t = setTimeout(() => el.style.display = 'none', 3500);
}

function showModal(title, msg, onConfirm, confirmStyle = 'confirm', confirmLabel = 'OK', onAlt = null, altLabel = null) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalMsg').textContent = msg;
  document.getElementById('modal').classList.add('open');
  const actions  = document.getElementById('modalActions');
  const btnClass = confirmStyle === 'danger' ? 'btn-danger'
                 : confirmStyle === 'warn'   ? 'btn-warn'
                 : 'btn-confirm';

  const altBtn = onAlt
    ? `<button id="modalAlt" style="padding:7px 14px;background:var(--surface2);border:1px solid var(--border);
         color:var(--muted);font-family:var(--mono);font-size:10px;border-radius:4px;cursor:pointer">${altLabel}</button>`
    : '';

  actions.innerHTML = `
    <button class="btn-cancel" onclick="closeModal()">Batal</button>
    ${altBtn}
    <button class="${btnClass}" id="modalConfirm">${confirmLabel}</button>
  `;
  document.getElementById('modalConfirm').onclick = onConfirm;
  if (onAlt) document.getElementById('modalAlt').onclick = onAlt;
}

function closeModal() {
  document.getElementById('modal').classList.remove('open');
}

/* ═══════════════════════════════════════════════════════════
   PYTHON BACKEND — YOLO INFERENCE ENGINE
═══════════════════════════════════════════════════════════ */
const beState = {
  connected: false,
  modelLoaded: false,
  baseUrl: 'http://localhost:5000',
  modelPath: 'best.pt',
  modelInfo: null,
};

function beGetUrl()   { return (document.getElementById('backendUrl')?.value || 'http://localhost:5000').replace(/\/+$/, ''); }
function beGetConf()  { return parseFloat(document.getElementById('beConfThresh')?.value || 25) / 100; }
function beGetIou()   { return parseFloat(document.getElementById('beIouThresh')?.value  || 45) / 100; }

function beSetStatus(msg, type = '') {
  const el = document.getElementById('backendStatus');
  if (!el) return;
  el.textContent = msg;
  el.className = 'backend-status' + (type ? ' ' + type : '');
}

function beSetDot(state) {
  const dot   = document.getElementById('backendDot');
  const label = document.getElementById('backendConnLabel');
  if (!dot) return;
  dot.className = 'backend-conn-dot' + (state ? ' ' + state : '');
  const labels = { connected: 'Online', connecting: 'Connecting...', error: 'Error' };
  if (label) label.textContent = labels[state] || 'Offline';
  if (label) label.style.color = state === 'connected' ? 'var(--accent3)' : state === 'error' ? 'var(--danger)' : state === 'connecting' ? 'var(--warn)' : 'var(--muted)';
}

function beSetBtnsEnabled(enabled) {
  ['beRunBtn','beRunAllBtn','beRunUnlabeledBtn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !enabled;
  });
}

function beSetProgress(pct, hide = false) {
  const wrap = document.getElementById('backendProgress');
  const fill = document.getElementById('backendProgressFill');
  if (!wrap || !fill) return;
  if (hide) { wrap.style.display = 'none'; fill.style.width = '0%'; return; }
  wrap.style.display = 'block';
  fill.style.width = pct + '%';
}

function backendUrlChanged() {
  if (beState.connected) {
    beState.connected = false;
    beState.modelLoaded = false;
    beSetDot('');
    beSetStatus('URL berubah — hubungkan kembali');
    beSetBtnsEnabled(false);
  }
}

async function backendConnect() {
  const url = beGetUrl();
  beState.baseUrl = url;
  beSetDot('connecting');
  beSetStatus('Menghubungkan ke ' + url + '...');
  const connectBtn = document.querySelector('.backend-btn.connect');
  if (connectBtn) { connectBtn.classList.add('loading'); connectBtn.innerHTML = '<span>⏳</span> Menghubungkan...'; }
  try {
    const resp = await fetch(url + '/status', { method: 'GET', signal: AbortSignal.timeout(5000) });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    beState.connected = true;
    beState.modelLoaded = !!data.model_loaded;
    beSetDot('connected');
    if (data.model_loaded) {
      beSetStatus(`✓ ${data.model_name} · ${data.num_classes} kelas`, 'ok');
      beSetBtnsEnabled(true);
      showBeModelInfo(data);
    } else {
      beSetStatus('✓ Server OK — belum ada model', 'warn');
      beSetBtnsEnabled(false);
    }
    notify(`✓ Terhubung ke YOLO Backend`);
    // Auto-scan models folder after connecting
    beRefreshModels();
  } catch (err) {
    beState.connected = false;
    beSetDot('error');
    beSetStatus((err.name === 'TimeoutError' ? 'Timeout! ' : 'Gagal: ') + err.message, 'error');
    notify('⚠ Gagal konek backend', 'warn');
  } finally {
    if (connectBtn) { connectBtn.classList.remove('loading'); connectBtn.innerHTML = '<span>⚡</span> Hubungkan Server'; }
  }
}

/** Scan server's models/ folder and populate the model picker dropdown */
async function beRefreshModels() {
  if (!beState.connected) { notify('Hubungkan server dulu!', 'warn'); return; }
  const statusEl = document.getElementById('beModelScanStatus');
  const refreshBtn = document.getElementById('beRefreshBtn');
  const sel = document.getElementById('beModelSelect');

  if (refreshBtn) refreshBtn.textContent = '⏳';
  if (statusEl)  { statusEl.style.display = 'block'; statusEl.textContent = 'Scanning models/...'; }

  try {
    const resp = await fetch(beGetUrl() + '/list_models', { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    const models = data.models || [];

    if (!sel) return;
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">— Pilih model .pt —</option>';
    if (!models.length) {
      sel.innerHTML += '<option value="" disabled>Tidak ada .pt di folder models/</option>';
      if (statusEl) statusEl.textContent = `⚠ Tidak ada model di folder "${data.models_dir || 'models/'}"`;
    } else {
      models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.path;
        opt.textContent = m.name + (m.size_mb ? ` (${m.size_mb} MB)` : '');
        if (data.loaded_model && m.name === data.loaded_model) {
          opt.textContent += ' ✓ aktif';
          opt.selected = true;
        }
        sel.appendChild(opt);
      });
      if (statusEl) statusEl.textContent = `${models.length} model ditemukan di "${data.models_dir || 'models/'}"`;
      // Restore previous selection if still available
      if (currentVal) {
        const found = models.find(m => m.path === currentVal);
        if (found) sel.value = currentVal;
      }
    }
  } catch(err) {
    if (statusEl) statusEl.textContent = '⚠ Gagal scan: ' + err.message;
  } finally {
    if (refreshBtn) refreshBtn.textContent = '↺';
  }
}

/** When user picks from dropdown, copy path to manual input */
function beModelSelectChanged() {
  const sel = document.getElementById('beModelSelect');
  const inp = document.getElementById('backendModelPath');
  if (sel && inp && sel.value) {
    inp.value = sel.value;
    inp.style.color = 'var(--text)';
  }
}

async function backendLoadModel() {
  if (!beState.connected) { notify('Hubungkan server terlebih dahulu!', 'warn'); return; }
  const modelPath = document.getElementById('backendModelPath')?.value?.trim();
  if (!modelPath) { notify('Masukkan path model .pt!', 'warn'); return; }
  beSetStatus('⏳ Memuat model: ' + modelPath + '...', 'warn');
  beSetDot('connecting');
  try {
    const resp = await fetch(beGetUrl() + '/load_model', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_path: modelPath }),
      signal: AbortSignal.timeout(60000),
    });
    const data = await resp.json();
    if (!resp.ok || data.error) throw new Error(data.error || 'HTTP ' + resp.status);
    beState.modelLoaded = true;
    beSetDot('connected');
    beSetStatus(`✓ ${data.model_name} · ${data.num_classes} kelas`, 'ok');
    beSetBtnsEnabled(true);
    showBeModelInfo(data);
    notify(`✓ Model dimuat: ${data.model_name}`);
  } catch(err) {
    beSetDot('connected');
    beSetStatus('✗ Gagal: ' + err.message, 'error');
    notify('⚠ ' + err.message, 'warn');
  }
}

function showBeModelInfo(data) {
  const wrap = document.getElementById('beModelInfo');
  const text = document.getElementById('beModelInfoText');
  if (!wrap || !text) return;
  wrap.style.display = 'block';
  const classes = (data.class_names || []).slice(0, 10).join(', ') + (data.num_classes > 10 ? ` ... +${data.num_classes - 10} lagi` : '');
  text.innerHTML = `<b style="color:var(--text)">${data.model_name || '—'}</b><br>Kelas: ${data.num_classes || '?'} · Device: ${data.device || 'cpu'}<br><span style="opacity:0.7">${classes}</span>`;
}

async function imgUrlToBase64(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png').split(',')[1]);
    };
    img.onerror = () => reject(new Error('Gagal load gambar'));
    img.src = url;
  });
}

function mapServerBoxes(serverBoxes) {
  const classNames = state.classes.map(c => c.name.toLowerCase());
  return serverBoxes.map(b => {
    let classIdx = b.class_id;
    if (b.class_name) {
      const nameMatch = classNames.indexOf(b.class_name.toLowerCase());
      if (nameMatch >= 0) classIdx = nameMatch;
      else {
        const fuzzy = classNames.findIndex(n => n.includes(b.class_name.toLowerCase()) || b.class_name.toLowerCase().includes(n.split('_')[0]));
        if (fuzzy >= 0) classIdx = fuzzy;
      }
    }
    classIdx = Math.max(0, Math.min(state.classes.length - 1, classIdx));
    return { id: Date.now() + Math.random(), classIdx, x: b.x, y: b.y, w: b.w, h: b.h, source: 'yolo', score: b.confidence };
  });
}

async function backendDetectCurrent() {
  if (!beState.connected || !beState.modelLoaded) { notify('Hubungkan server & load model!', 'warn'); return; }
  if (state.activeImg === null || !state.images[state.activeImg]) { notify('Pilih gambar!', 'warn'); return; }
  const btn = document.getElementById('beRunBtn');
  if (btn) { btn.disabled = true; btn.classList.add('loading'); btn.innerHTML = '<span>⏳</span> Mendeteksi...'; }
  beSetProgress(30);
  try {
    const img = state.images[state.activeImg];
    const b64 = await imgUrlToBase64(img.url);
    const resp = await fetch(beGetUrl() + '/detect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: b64, filename: img.name, conf: beGetConf(), iou: beGetIou() }),
      signal: AbortSignal.timeout(30000),
    });
    beSetProgress(80);
    const data = await resp.json();
    if (!resp.ok || data.error) throw new Error(data.error || 'HTTP ' + resp.status);
    const boxes = mapServerBoxes(data.detections || []);
    if (!boxes.length) { notify('Tidak ada objek terdeteksi', 'warn'); }
    else {
      pushHistory();
      boxes.forEach(b => state.annotations.push(b));
      redrawCanvas(); renderAnnotations(); renderClasses();
      triggerAutosave();
      notify(`🐍 YOLO: ${boxes.length} objek`);
    }
  } catch(err) { notify('⚠ Deteksi gagal: ' + err.message, 'warn'); }
  finally {
    beSetProgress(0, true);
    if (btn) { btn.disabled = false; btn.classList.remove('loading'); btn.innerHTML = '<span>▶</span> Deteksi Gambar Ini'; }
  }
}

async function backendDetectAll() {
  const alreadyLabeled = state.images.filter(im => im.annotations && im.annotations.length > 0);
  if (alreadyLabeled.length > 0) {
    const total = state.images.length;
    showModal(
      '⚠ Konfirmasi Auto-Label Semua',
      `${alreadyLabeled.length} dari ${total} gambar SUDAH memiliki anotasi.\n\nDeteksi batch akan MENAMBAHKAN hasil AI di atas anotasi yang sudah ada.\n\nLanjutkan?\n\n• Gunakan "◎ Belum Dilabeli" untuk hanya memproses gambar kosong.`,
      () => { closeModal(); _backendDetectBatch(state.images, 'Semua'); },
      'danger'
    );
  } else {
    await _backendDetectBatch(state.images, 'Semua');
  }
}
async function backendDetectUnlabeled() {
  const targets = state.images.filter(im => !im.annotations || im.annotations.length === 0);
  if (!targets.length) { notify('Semua gambar sudah dilabeli!', 'warn'); return; }
  await _backendDetectBatch(targets, 'Belum Dilabeli');
}

async function _backendDetectBatch(targets, label) {
  if (!beState.connected || !beState.modelLoaded) { notify('Hubungkan server & load model!', 'warn'); return; }
  if (!targets.length) { notify('Tidak ada gambar!', 'warn'); return; }
  ['beRunBtn','beRunAllBtn','beRunUnlabeledBtn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.disabled = true; el.classList.add('loading'); }
  });
  let totalBoxes = 0, processed = 0, errors = 0;
  const conf = beGetConf(), iou = beGetIou();
  for (const img of targets) {
    processed++;
    beSetProgress(Math.round(processed / targets.length * 100));
    beSetStatus(`⏳ ${processed}/${targets.length}: ${img.name}`);
    try {
      const b64 = await imgUrlToBase64(img.url);
      const resp = await fetch(beGetUrl() + '/detect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: b64, filename: img.name, conf, iou }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || 'HTTP ' + resp.status);
      const boxes = mapServerBoxes(data.detections || []);
      if (boxes.length) {
        img.annotations = [...(img.annotations || []), ...boxes];
        img.natW = data.image_width || img.natW || 640;
        img.natH = data.image_height || img.natH || 640;
        try {
          const _packed = `# ${img.natW} ${img.natH}\n${annotationsToYOLO(img.annotations, img.natW, img.natH)}`;
          localStorage.setItem('vl_' + img.name, _packed);
        } catch(_) {}
        totalBoxes += boxes.length;
      }
    } catch(err) { errors++; }
    await new Promise(r => setTimeout(r, 5));
  }
  if (state.activeImg !== null) {
    const cur = state.images[state.activeImg];
    if (targets.includes(cur)) {
      state.annotations = (cur.annotations || []).map(a=>({...a}));
      redrawCanvas(); renderAnnotations(); renderClasses();
    }
  }
  renderImgList();
  updateAISampleBadge();
  updateFolderCount();
  beSetProgress(0, true);
  beSetStatus(`✓ ${label}: ${processed} gambar, ${totalBoxes} box${errors ? ` · ${errors} error` : ''}`, 'ok');
  ['beRunBtn','beRunAllBtn','beRunUnlabeledBtn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.disabled = false; el.classList.remove('loading'); }
  });
  notify(`🐍 Batch selesai: ${totalBoxes} box dari ${processed} gambar`);
}

function beLoadSavedUrl() {
  try {
    const saved = localStorage.getItem('vl_backend_url');
    if (saved) { const inp = document.getElementById('backendUrl'); if (inp) inp.value = saved; }
  } catch(_) {}
}

function beSaveUrl(val) { try { localStorage.setItem('vl_backend_url', val); } catch(_) {} }

/* ═══════════════════════════════════════════════════════════
   CTRL+F — FIND BOX BY NUMBER
═══════════════════════════════════════════════════════════ */
const findState = { query: '', matches: [], cursor: 0 };

function openFindPanel() {
  const panel = document.getElementById('findPanel');
  const input = document.getElementById('findInput');
  if (!panel || !input) return;
  panel.classList.add('open');
  input.value = '';
  input.focus();
  findState.matches = [];
  findState.cursor  = 0;
  setFindStatus('Ketik nomor box untuk mencari');
  hideFindRing();
}

function closeFindPanel() {
  const panel = document.getElementById('findPanel');
  if (panel) panel.classList.remove('open');
  hideFindRing();
}

function toggleFindPanel() {
  const panel = document.getElementById('findPanel');
  if (!panel) return;
  if (panel.classList.contains('open')) closeFindPanel();
  else openFindPanel();
}

function handleFindKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); closeFindPanel(); return; }
  if (e.key === 'Enter')  { e.preventDefault(); findNavigate(e.shiftKey ? -1 : +1); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); findNavigate(+1); return; }
  if (e.key === 'ArrowUp')   { e.preventDefault(); findNavigate(-1); return; }
}

function findBoxByNumber() {
  const input = document.getElementById('findInput');
  const raw = input?.value?.trim();
  if (!raw) {
    findState.matches = [];
    setFindStatus('Ketik nomor box untuk mencari');
    document.getElementById('findPrevBtn').disabled = true;
    document.getElementById('findNextBtn').disabled = true;
    hideFindRing();
    return;
  }
  const num = parseInt(raw);
  if (isNaN(num) || num < 1) { setFindStatus('Masukkan angka valid', 'notfound'); hideFindRing(); return; }
  const exactIdx = num - 1;
  if (exactIdx >= 0 && exactIdx < state.annotations.length) {
    findState.matches = [exactIdx];
    findState.cursor  = 0;
    jumpToAnnotation(exactIdx);
    const cls = state.classes[state.annotations[exactIdx].classIdx]?.name || '?';
    setFindStatus(`Box #${num}: ${cls}`, 'found');
    document.getElementById('findPrevBtn').disabled = false;
    document.getElementById('findNextBtn').disabled = false;
  } else {
    findState.matches = [];
    setFindStatus(`Box #${num} tidak ada (total: ${state.annotations.length})`, 'notfound');
    hideFindRing();
    document.getElementById('findPrevBtn').disabled = true;
    document.getElementById('findNextBtn').disabled = true;
  }
}

function findNavigate(dir) {
  if (!findState.matches.length) return;
  findState.cursor = (findState.cursor + dir + findState.matches.length) % findState.matches.length;
  const annoIdx = findState.matches[findState.cursor];
  jumpToAnnotation(annoIdx);
  const cls = state.classes[state.annotations[annoIdx].classIdx]?.name || '?';
  setFindStatus(`Box #${annoIdx + 1}: ${cls}`, 'found');
}

function jumpToAnnotation(annoIdx) {
  const a = state.annotations[annoIdx];
  if (!a) return;
  const canvas = document.getElementById('labelCanvas');
  const cw = canvas.width, ch = canvas.height;
  const imgCX = a.x + a.w / 2;
  const imgCY = a.y + a.h / 2;
  const padFactor = 4;
  const targetZoom = Math.max(1, Math.min(8, Math.min(cw/(a.w*padFactor), ch/(a.h*padFactor))));
  const startZoom = state.zoom, startPanX = state.panX, startPanY = state.panY;
  const endPanX = cw / 2 - imgCX * targetZoom;
  const endPanY = ch / 2 - imgCY * targetZoom;
  const DURATION = 280;
  const startTime = performance.now();
  function easeInOut(t) { return t < 0.5 ? 2*t*t : -1+(4-2*t)*t; }
  function animateFrame(now) {
    const t = Math.min(1, (now - startTime) / DURATION);
    const e = easeInOut(t);
    state.zoom = startZoom + (targetZoom - startZoom) * e;
    state.panX = startPanX + (endPanX - startPanX) * e;
    state.panY = startPanY + (endPanY - startPanY) * e;
    updateZoomDisplay();
    redrawCanvas();
    showFindRing(annoIdx);
    if (t < 1) requestAnimationFrame(animateFrame);
    else {
      state.selectedAnnos.clear();
      state.selectedAnnos.add(annoIdx);
      renderAnnotations();
      redrawCanvas();
      showFindRing(annoIdx);
      updateSelInfo();
    }
  }
  requestAnimationFrame(animateFrame);
}

function showFindRing(annoIdx) {
  const ring = document.getElementById('findHighlightRing');
  const a    = state.annotations[annoIdx];
  if (!ring || !a) return;
  const {sx, sy, sw, sh} = imgToScreen(a);
  const pad = 4;
  ring.style.display = 'block';
  ring.style.left    = (sx - pad) + 'px';
  ring.style.top     = (sy - pad) + 'px';
  ring.style.width   = (sw + pad*2) + 'px';
  ring.style.height  = (sh + pad*2) + 'px';
  ring.style.animation = 'none';
  void ring.offsetWidth;
  ring.style.animation = 'findPulse 0.8s ease 2';
}

function hideFindRing() {
  const ring = document.getElementById('findHighlightRing');
  if (ring) ring.style.display = 'none';
}

function setFindStatus(msg, type = '') {
  const el = document.getElementById('findStatus');
  if (!el) return;
  el.textContent = msg;
  el.className = 'find-status' + (type ? ' ' + type : '');
}

/* ═══════════════════════════════════════════════════════════
   MARQUEE SELECTION HELPERS
═══════════════════════════════════════════════════════════ */
function getMarqueeRect() {
  const x1 = Math.min(state.marqueeX, state.marqueeCurX);
  const y1 = Math.min(state.marqueeY, state.marqueeCurY);
  const x2 = Math.max(state.marqueeX, state.marqueeCurX);
  const y2 = Math.max(state.marqueeY, state.marqueeCurY);
  return { x1, y1, x2, y2, w: x2-x1, h: y2-y1 };
}

function getAnnotationsInMarquee() {
  const { x1, y1, x2, y2 } = getMarqueeRect();
  const result = new Set();
  if ((x2 - x1) < 4 && (y2 - y1) < 4) return result;
  state.annotations.forEach((a, i) => {
    const { sx, sy, sw, sh } = imgToScreen(a);
    if (sx < x2 && (sx + sw) > x1 && sy < y2 && (sy + sh) > y1) result.add(i);
  });
  return result;
}

function drawMarqueeRect() {
  if (!state.marquee) return;
  const canvas = document.getElementById('labelCanvas');
  const ctx    = canvas.getContext('2d');
  const { x1, y1, w, h } = getMarqueeRect();
  if (w < 2 && h < 2) return;

  const preview = getAnnotationsInMarquee();
  preview.forEach(i => {
    const a = state.annotations[i];
    const { sx, sy, sw, sh } = imgToScreen(a);
    const cls = state.classes[a.classIdx] || { color: '#888' };
    ctx.save();
    ctx.fillStyle   = cls.color + '35';
    ctx.strokeStyle = cls.color;
    ctx.lineWidth   = 2.5;
    ctx.fillRect(sx, sy, sw, sh);
    ctx.strokeRect(sx, sy, sw, sh);
    ctx.restore();
  });

  ctx.save();
  ctx.fillStyle   = 'rgba(0, 184, 255, 0.08)';
  ctx.fillRect(x1, y1, w, h);
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.9)';
  ctx.lineWidth   = 1.5;
  ctx.setLineDash([5, 3]);
  ctx.strokeRect(x1, y1, w, h);
  ctx.fillStyle = 'rgba(0, 229, 255, 0.8)';
  ctx.setLineDash([]);
  [[x1,y1],[x1+w,y1],[x1,y1+h],[x1+w,y1+h]].forEach(([cx,cy]) => {
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI*2); ctx.fill();
  });
  if (preview.size > 0) {
    const label = `${preview.size} box`;
    ctx.font = 'bold 11px Space Mono, monospace';
    const tw = ctx.measureText(label).width;
    const lx = x1 + w / 2 - tw / 2;
    const ly = y1 - 8;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(lx - 4, ly - 12, tw + 8, 16);
    ctx.fillStyle = 'rgba(0, 229, 255, 1)';
    ctx.fillText(label, lx, ly);
  }
  ctx.restore();
}

/* ── Custom model store — declared here (before init IIFE) to avoid TDZ ── */
const CUSTOM_MODELS_KEY = 'vl_custom_models';
let _customModels    = {};
let _cmEditingModel  = null;

/* ═══════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════ */
(function init() {
  // Restore saved part number / model selection
  const savedModel = localStorage.getItem('vl_active_model');
  if (savedModel) {
    const sel = document.getElementById('pretrainedModel');
    if (sel) sel.value = savedModel;
    if (savedModel !== 'none' && !savedModel.startsWith('__yolo_') && MODEL_CLASSES[savedModel]) {
      activeModelFilter = savedModel;
    }
    // Custom models are loaded later by cmInit() — activeModelFilter will be set there
  }

  renderClasses();
  renderImgList();
  renderClassDist();

  loadApiKey();
  const savedKey = localStorage.getItem('vl_gemini_key');
  if (!savedKey) {
    const inp = document.getElementById('apiKeyInput');
    if (inp) { inp.value = 'AIzaSyA0rlK0edkp7rEJdJX3ocQZKCUtvyv7uKo'; saveApiKey(inp.value); }
  }

  beLoadSavedUrl();
  updateAIBtnState();
  updateAISampleBadge();

  // One-time migration: clean up old redundant keys from previous versions
  _migrateLocalStorage();

  // Show initial storage usage
  setTimeout(updateStorageBar, 500);

  // Init autosave dot
  const dot = document.getElementById('autosaveStatusDot');
  if (dot) dot.style.background = 'var(--accent3)';

  // Check FS API support
  checkFSAPI();

  resizeCanvas();
  attachWheelHandler();

  window.addEventListener('resize', () => {
    resizeCanvas();
    if (state.imgEl && state.imgEl.complete && state.imgNatW) redrawCanvas();
  });

  // Load Chart.js
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
  document.head.appendChild(s);
})();

/* ═══════════════════════════════════════════════════════════
   CUSTOM MODEL MANAGER
   (Variables declared before init() to avoid TDZ errors)
═══════════════════════════════════════════════════════════ */

/* ── Load / Save custom models ── */
function cmLoad() {
  try {
    const raw = localStorage.getItem(CUSTOM_MODELS_KEY);
    _customModels = raw ? JSON.parse(raw) : {};
  } catch(e) { _customModels = {}; }
  cmMergeIntoModelClasses();
}

function cmSave() {
  try { localStorage.setItem(CUSTOM_MODELS_KEY, JSON.stringify(_customModels)); } catch(e) {}
  cmMergeIntoModelClasses();
}

/** Merge _customModels into the global MODEL_CLASSES object */
function cmMergeIntoModelClasses() {
  // Remove previously merged custom models (those not in the original hardcoded set)
  const hardcoded = Object.keys(MODEL_CLASSES);
  // We track which keys were added by custom to avoid removing builtins
  Object.keys(_customModels).forEach(name => {
    MODEL_CLASSES[name] = { ..._customModels[name] };
  });
  // Remove stale custom keys that were deleted
  Object.keys(MODEL_CLASSES).forEach(name => {
    if (!hardcoded.includes(name) && !_customModels[name]) {
      delete MODEL_CLASSES[name];
    }
  });
  cmRebuildDropdown();
}

/* ── Rebuild the <select> dropdown to include custom models ── */
function cmRebuildDropdown() {
  const sel = document.getElementById('pretrainedModel');
  if (!sel) return;

  // Remove old custom optgroup if present
  const oldGrp = document.getElementById('customModelsOptgroup');
  if (oldGrp) oldGrp.remove();

  const customNames = Object.keys(_customModels);
  if (!customNames.length) return;

  const grp = document.createElement('optgroup');
  grp.label = '── Custom Models ──';
  grp.id = 'customModelsOptgroup';

  customNames.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name + ' ✦';
    grp.appendChild(opt);
  });

  // Insert before the YOLO optgroup (last child)
  const yoloGrp = sel.querySelector('optgroup:last-of-type');
  if (yoloGrp) sel.insertBefore(grp, yoloGrp);
  else sel.appendChild(grp);

  // Also rebuild training page part filter if needed
  cmRebuildTrainingFilter();
}

/** Sync custom models into the training page part filter */
function cmRebuildTrainingFilter() {
  const sel = document.getElementById('trPartFilter');
  if (!sel) return;

  // Remove old custom options
  sel.querySelectorAll('.cm-custom-option').forEach(o => o.remove());

  Object.keys(_customModels).forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name + ' ✦';
    opt.className = 'cm-custom-option';
    sel.appendChild(opt);
  });
}

/* ═══════════════════════════════════════════════════
   MODAL: Custom Model List
═══════════════════════════════════════════════════ */
function openCustomModelListModal() {
  cmRenderList();
  document.getElementById('customModelListModal').style.display = 'flex';
}

function closeCustomModelListModal() {
  document.getElementById('customModelListModal').style.display = 'none';
}

let _cmActiveTab = 'custom'; // 'custom' | 'builtin'

function cmSwitchTab(tab) {
  _cmActiveTab = tab;
  // Update tab styles
  const tabCustom  = document.getElementById('cmTabCustom');
  const tabBuiltin = document.getElementById('cmTabBuiltin');
  if (tabCustom) {
    tabCustom.style.background    = tab === 'custom'  ? 'rgba(0,229,255,0.06)' : 'transparent';
    tabCustom.style.borderBottom  = tab === 'custom'  ? '2px solid var(--accent)' : '2px solid transparent';
    tabCustom.style.color         = tab === 'custom'  ? 'var(--accent)' : 'var(--muted)';
  }
  if (tabBuiltin) {
    tabBuiltin.style.background   = tab === 'builtin' ? 'rgba(0,229,255,0.06)' : 'transparent';
    tabBuiltin.style.borderBottom = tab === 'builtin' ? '2px solid var(--accent)' : '2px solid transparent';
    tabBuiltin.style.color        = tab === 'builtin' ? 'var(--accent)' : 'var(--muted)';
  }
  cmRenderList();
}

function cmRenderList() {
  const body = document.getElementById('customModelListBody');
  if (!body) return;

  if (_cmActiveTab === 'custom') {
    _cmRenderCustomList(body);
  } else {
    _cmRenderBuiltinList(body);
  }
}

function _cmModelCardHTML(name, bom, isCustom) {
  const entries    = Object.entries(bom);
  const totalParts = entries.reduce((s, [,v]) => s + v, 0);
  const bomText    = entries.map(([cls, qty]) => {
    const color = state.classes.find(c => c.name === cls)?.color || '#888';
    return `<span style="color:${color}">${cls}</span>×${qty}`;
  }).join('  ');
  const isActive = activeModelFilter === name;
  const hasOverride = !isCustom && _customModels[name]; // built-in overridden by custom

  return `
    <div class="cm-list-item ${isActive ? 'active-model' : ''}">
      <div style="flex:1;min-width:0">
        <div class="cm-list-name">
          ${name}
          ${isActive ? '<span style="font-size:8px;color:var(--accent3);margin-left:6px">● AKTIF</span>' : ''}
          ${hasOverride ? '<span style="font-size:8px;color:var(--warn);margin-left:6px">★ DIEDIT</span>' : ''}
        </div>
        <div class="cm-list-meta">
          ${entries.length} kelas · ${totalParts} komponen total<br>
          <span style="line-height:2">${bomText}</span>
        </div>
      </div>
      <div class="cm-list-actions">
        <button class="cm-action-btn use"  onclick="cmUseModel('${name}')">▶ Pakai</button>
        <button class="cm-action-btn edit" onclick="cmOpenEdit('${name}')">✎ Edit</button>
        ${isCustom && !MODEL_CLASSES._hardcoded?.includes(name)
          ? `<button class="cm-action-btn del" onclick="cmConfirmDelete('${name}')">✕ Hapus</button>`
          : hasOverride
            ? `<button class="cm-action-btn del" style="font-size:8px" onclick="cmResetBuiltin('${name}')">↺ Reset</button>`
            : ''}
      </div>
    </div>`;
}

function _cmRenderCustomList(body) {
  const names = Object.keys(_customModels).filter(n => !_BUILTIN_MODEL_NAMES.has(n));

  if (!names.length) {
    body.innerHTML = `<div class="cm-empty">
      Belum ada model custom.<br>
      Klik <strong style="color:var(--accent)">TAMBAH MODEL BARU</strong> untuk membuat model clutch baru<br>
      dengan daftar komponen dan jumlah yang kamu tentukan sendiri.
    </div>`;
    return;
  }

  body.innerHTML = names.map(name =>
    _cmModelCardHTML(name, _customModels[name], true)
  ).join('');
}

function _cmRenderBuiltinList(body) {
  // Show all built-in models; if user has edited one it's in _customModels as an override
  body.innerHTML = _BUILTIN_MODEL_NAMES_ARR.map(name => {
    const bom = _customModels[name] || _BUILTIN_MODEL_BOMS[name];
    return _cmModelCardHTML(name, bom, false);
  }).join('');
}

function cmUseModel(name) {
  const sel = document.getElementById('pretrainedModel');
  if (sel) {
    sel.value = name;
    onModelChange();
  }
  closeCustomModelListModal();
  notify(`📦 Model "${name}" diaktifkan`);
}

function cmConfirmDelete(name) {
  showModal(
    'Hapus Model Custom',
    `Hapus model "${name}"? Aksi ini tidak bisa di-undo.`,
    () => {
      delete _customModels[name];
      cmSave();
      // If this was active, reset to none
      if (activeModelFilter === name) {
        activeModelFilter = null;
        const sel = document.getElementById('pretrainedModel');
        if (sel) sel.value = 'none';
        renderClasses();
      }
      cmRenderList();
      closeModal();
      notify(`🗑 Model "${name}" dihapus`);
    },
    'danger'
  );
}

/* ═══════════════════════════════════════════════════
   MODAL: Add / Edit Custom Model
═══════════════════════════════════════════════════ */
function openCustomModelModal(editName = null) {
  _cmEditingModel = editName;

  const title = document.getElementById('customModelModalTitle');
  const nameInp = document.getElementById('cmModelName');
  const isBuiltinEdit = editName && _BUILTIN_MODEL_NAMES.has(editName);
  if (title) {
    title.textContent = editName
      ? (isBuiltinEdit ? `⚙ Edit Model Bawaan: ${editName}` : `✎ Edit Model: ${editName}`)
      : '⊕ Tambah Model Baru';
  }
  if (nameInp) {
    nameInp.value = editName || '';
    nameInp.disabled = !!editName; // always lock name when editing
    nameInp.style.opacity = editName ? '0.6' : '1';
  }
  // Show reset-to-default button only for built-in overrides
  const resetBtn = document.getElementById('cmResetBuiltinBtn');
  if (resetBtn) {
    resetBtn.style.display = isBuiltinEdit ? 'inline-flex' : 'none';
    if (isBuiltinEdit) resetBtn.onclick = () => { closeCustomModelModal(); cmResetBuiltin(editName); };
  }

  // Close list modal, open add modal
  closeCustomModelListModal();
  document.getElementById('customModelModal').style.display = 'flex';

  // Build class grid — pass existing BOM so _cmCurrentBom is initialised correctly
  const existingBom = editName ? (_customModels[editName] || {}) : {};
  cmBuildClassGrid(existingBom);

  // Clear search (after grid build, so filter starts empty)
  const search = document.getElementById('cmClassSearch');
  if (search) search.value = '';

  const nameErr = document.getElementById('cmNameError');
  if (nameErr) nameErr.style.display = 'none';

  setTimeout(() => nameInp?.focus(), 100);
}

function cmOpenEdit(name) {
  // For built-in models: pre-fill with existing BOM (from override or original)
  // openCustomModelModal handles both — if name already in _customModels it edits in place,
  // otherwise it clones the built-in BOM into a new custom entry with the same name
  if (_BUILTIN_MODEL_NAMES.has(name) && !_customModels[name]) {
    // Clone the built-in BOM into _customModels as an editable override
    _customModels[name] = { ..._BUILTIN_MODEL_BOMS[name] };
    cmSave();
  }
  openCustomModelModal(name);
}

function closeCustomModelModal() {
  document.getElementById('customModelModal').style.display = 'none';
  _cmEditingModel = null;
}

/* ─── Live BOM state for the modal — source of truth while modal is open ─── */
let _cmCurrentBom = {}; // { className: qty }

/**
 * Build / rebuild the class grid.
 * Reads from _cmCurrentBom (checked = in BOM) and state.classes (master class list).
 * Grid has two sections:
 *   A) Classes currently IN the BOM (checked, shown first)
 *   B) Classes available to add (unchecked, shown below a divider)
 * Each row has: color dot · name · qty input · ✕ remove button
 * Bottom row: inline "+ New Class" input
 */
function cmBuildClassGrid(existingBom) {
  // Initialise live BOM from caller-supplied snapshot
  _cmCurrentBom = { ...existingBom };
  _cmRenderGrid();
}

function _cmRenderGrid() {
  const grid = document.getElementById('cmClassGrid');
  if (!grid) return;

  const q = (document.getElementById('cmClassSearch')?.value || '').toLowerCase().trim();

  // Split into: in-BOM and available
  const inBom      = [];
  const available  = [];

  state.classes.forEach((cls, i) => {
    const inModel = _cmCurrentBom[cls.name] !== undefined;
    const visible  = !q || cls.name.toLowerCase().includes(q);
    if (visible) (inModel ? inBom : available).push({ cls, i });
  });

  // Row builder
  const row = ({ cls, i }, inModel) => {
    const qty = _cmCurrentBom[cls.name] || 1;
    if (inModel) {
      return `
        <div class="cm-class-item active" id="cmItem_${i}">
          <span class="cm-class-dot" style="background:${cls.color};flex-shrink:0"></span>
          <span class="cm-class-name" title="${cls.name}" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${cls.name}</span>
          <input type="number" class="cm-class-qty" id="cmQty_${i}"
            value="${qty}" min="1" max="999"
            onclick="event.stopPropagation()"
            onchange="_cmQtyChange('${cls.name}', this.value)"
            oninput="_cmQtyChange('${cls.name}', this.value)"
            style="width:42px;flex-shrink:0">
          <button onclick="cmRemoveFromBom('${cls.name}')" title="Hapus dari model"
            style="background:none;border:none;color:var(--danger);font-size:13px;cursor:pointer;
                   padding:0 2px;line-height:1;flex-shrink:0;opacity:0.7"
            onmouseenter="this.style.opacity='1'" onmouseleave="this.style.opacity='0.7'">✕</button>
        </div>`;
    } else {
      return `
        <div class="cm-class-item" id="cmItem_${i}" style="opacity:0.55;cursor:pointer"
             onclick="cmAddToBom('${cls.name}',${i})" title="Klik untuk tambahkan ke model">
          <span class="cm-class-dot" style="background:${cls.color};flex-shrink:0"></span>
          <span class="cm-class-name" title="${cls.name}" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${cls.name}</span>
          <span style="font-family:var(--mono);font-size:9px;color:var(--accent);margin-right:4px">+ tambah</span>
        </div>`;
    }
  };

  let html = '';

  // Section: in BOM
  if (inBom.length) {
    html += inBom.map(e => row(e, true)).join('');
  }

  // Divider between sections
  if (inBom.length && available.length) {
    html += `<div style="grid-column:1/-1;border-top:1px dashed var(--border);margin:4px 0;
             font-family:var(--mono);font-size:8px;color:var(--muted);padding:2px 4px;letter-spacing:0.5px">
             ── TERSEDIA ──</div>`;
  }

  // Section: available (not yet in BOM)
  if (available.length) {
    html += available.map(e => row(e, false)).join('');
  }

  // Add new class row (always last)
  html += `
    <div style="grid-column:1/-1;margin-top:6px;display:flex;gap:5px;align-items:center;
                padding:6px 6px;background:rgba(0,229,255,0.03);border:1px dashed rgba(0,229,255,0.2);
                border-radius:4px">
      <span style="font-family:var(--mono);font-size:9px;color:var(--accent);flex-shrink:0">+</span>
      <input id="cmNewClassName" type="text" placeholder="Nama kelas baru..."
        style="flex:1;background:transparent;border:none;color:var(--text);font-family:var(--mono);
               font-size:10px;outline:none;min-width:0"
        onkeydown="if(event.key==='Enter'){event.preventDefault();cmCreateAndAddClass();}"
        oninput="cmValidateNewClassName()">
      <span id="cmNewClassError" style="font-size:8px;color:var(--danger);display:none">!</span>
      <input id="cmNewClassQty" type="number" value="1" min="1" max="999"
        style="width:40px;background:var(--surface2);border:1px solid var(--border);color:var(--text);
               font-family:var(--mono);font-size:10px;padding:3px 4px;border-radius:3px;text-align:center"
        title="Jumlah">
      <button onclick="cmCreateAndAddClass()"
        style="padding:4px 10px;background:rgba(0,229,255,0.12);border:1px solid rgba(0,229,255,0.35);
               color:var(--accent);font-family:var(--mono);font-size:9px;border-radius:3px;cursor:pointer;
               white-space:nowrap">
        ✓ Tambah
      </button>
    </div>`;

  grid.innerHTML = html;
  cmUpdateSummary();
}

/** Called when user changes qty input directly */
function _cmQtyChange(clsName, val) {
  const n = Math.max(1, parseInt(val) || 1);
  if (_cmCurrentBom[clsName] !== undefined) _cmCurrentBom[clsName] = n;
  cmUpdateSummary();
}

/** Add existing class to BOM */
function cmAddToBom(clsName, idx) {
  _cmCurrentBom[clsName] = 1;
  _cmRenderGrid();
  // Focus qty for this class after render
  const qtyEl = document.getElementById('cmQty_' + idx);
  if (qtyEl) { qtyEl.focus(); qtyEl.select(); }
}

/** Remove class from BOM (does NOT delete from state.classes) */
function cmRemoveFromBom(clsName) {
  delete _cmCurrentBom[clsName];
  _cmRenderGrid();
}

/** Create a brand-new class and add it to BOM + state.classes */
function cmCreateAndAddClass() {
  const inp = document.getElementById('cmNewClassName');
  const qtyInp = document.getElementById('cmNewClassQty');
  const name = inp?.value?.trim() || '';
  if (!name) { inp?.focus(); return; }

  const errEl = document.getElementById('cmNewClassError');

  if (state.classes.find(c => c.name === name)) {
    // Class already exists — just add to BOM
    if (_cmCurrentBom[name] !== undefined) {
      if (errEl) { errEl.textContent = '⚠ Sudah ada di model'; errEl.style.display = 'inline'; }
      setTimeout(() => { if (errEl) errEl.style.display = 'none'; }, 2000);
      return;
    }
    const qty = Math.max(1, parseInt(qtyInp?.value) || 1);
    _cmCurrentBom[name] = qty;
    if (inp) inp.value = '';
    if (qtyInp) qtyInp.value = 1;
    _cmRenderGrid();
    notify(`✓ "${name}" ditambahkan ke model`);
    return;
  }

  // Validate name
  if (name.length < 2) {
    if (errEl) { errEl.textContent = '⚠ Min 2 karakter'; errEl.style.display = 'inline'; }
    return;
  }

  // Create new class globally in state.classes
  const COLORS = ['#e040fb','#69f0ae','#ff8a65','#80d8ff','#f4ff81','#ea80fc','#ccff90',
                  '#a7ffeb','#ffe57f','#d500f9','#00bfa5','#64ffda','#ff6e40','#c6ff00'];
  const color = COLORS[state.classes.length % COLORS.length];
  state.classes.push({ name, color });

  // Add to BOM with qty
  const qty = Math.max(1, parseInt(qtyInp?.value) || 1);
  _cmCurrentBom[name] = qty;

  if (inp) inp.value = '';
  if (qtyInp) qtyInp.value = 1;
  if (errEl) errEl.style.display = 'none';

  _cmRenderGrid();

  // Write classes.txt if folder open
  if (_folderHandle) writeClassesTxtToFolder();
  notify(`✓ Kelas baru "${name}" (indeks ${state.classes.length - 1}) ditambahkan`);
}

function cmValidateNewClassName() {
  const val = document.getElementById('cmNewClassName')?.value?.trim() || '';
  const errEl = document.getElementById('cmNewClassError');
  if (!errEl) return;
  if (val.length > 1 && _cmCurrentBom[val] !== undefined) {
    errEl.textContent = '⚠ Sudah di model';
    errEl.style.display = 'inline';
  } else {
    errEl.style.display = 'none';
  }
}

function cmToggleClass(i) {
  // Legacy — no longer used by new grid, kept for safety
  const cls = state.classes[i];
  if (!cls) return;
  if (_cmCurrentBom[cls.name] !== undefined) {
    cmRemoveFromBom(cls.name);
  } else {
    cmAddToBom(cls.name, i);
  }
}

function cmSelectAll() {
  const q = (document.getElementById('cmClassSearch')?.value || '').toLowerCase().trim();
  state.classes.forEach(cls => {
    if (!q || cls.name.toLowerCase().includes(q)) {
      if (_cmCurrentBom[cls.name] === undefined) _cmCurrentBom[cls.name] = 1;
    }
  });
  _cmRenderGrid();
}

function cmClearAll() {
  const q = (document.getElementById('cmClassSearch')?.value || '').toLowerCase().trim();
  if (!q) {
    _cmCurrentBom = {};
  } else {
    state.classes.forEach(cls => {
      if (cls.name.toLowerCase().includes(q)) delete _cmCurrentBom[cls.name];
    });
  }
  _cmRenderGrid();
}

function cmFilterClasses() {
  // Re-render grid with new filter — state preserved in _cmCurrentBom
  _cmRenderGrid();
}

function cmUpdateSummary() {
  const selected = cmGetSelected();
  const count    = Object.keys(selected).length;
  const countEl  = document.getElementById('cmSelectedCount');
  if (countEl) countEl.textContent = `${count} dipilih`;

  const wrap  = document.getElementById('cmSummaryWrap');
  const sumEl = document.getElementById('cmSummary');
  if (!wrap || !sumEl) return;

  if (!count) { wrap.style.display = 'none'; return; }

  wrap.style.display = 'block';
  const total     = Object.values(selected).reduce((s, v) => s + v, 0);
  const modelName = document.getElementById('cmModelName')?.value?.trim() || '—';

  sumEl.innerHTML =
    `<span style="color:var(--accent);font-weight:bold">${modelName}</span>` +
    ` &nbsp;·&nbsp; ${count} kelas &nbsp;·&nbsp; ${total} komponen total<br>` +
    Object.entries(selected).map(([name, qty]) => {
      const color = state.classes.find(c => c.name === name)?.color || '#888';
      return `<span style="color:${color}">■</span> ${name} <strong style="color:var(--text)">×${qty}</strong>`;
    }).join('&nbsp;&nbsp; ');
}

function cmGetSelected() {
  // Read directly from _cmCurrentBom (live state), validated against state.classes
  const result = {};
  Object.entries(_cmCurrentBom).forEach(([name, qty]) => {
    result[name] = Math.max(1, qty || 1);
  });
  return result;
}

function cmValidateName() {
  const nameInp = document.getElementById('cmModelName');
  const errEl   = document.getElementById('cmNameError');
  const val = nameInp?.value?.trim() || '';
  if (!errEl) return true;

  if (!val) {
    errEl.textContent = '⚠ Nama model tidak boleh kosong';
    errEl.style.display = 'block';
    return false;
  }
  if (val.length < 2) {
    errEl.textContent = '⚠ Nama terlalu pendek (min 2 karakter)';
    errEl.style.display = 'block';
    return false;
  }
  // Check duplicate only for new model (not editing, and not a built-in override)
  if (!_cmEditingModel && _customModels[val] && !_BUILTIN_MODEL_NAMES.has(val)) {
    errEl.textContent = `⚠ Model custom "${val}" sudah ada`;
    errEl.style.display = 'block';
    return false;
  }
  if (!_cmEditingModel && !_customModels[val] && !_BUILTIN_MODEL_NAMES.has(val) && MODEL_CLASSES[val]) {
    errEl.textContent = `⚠ Model "${val}" sudah ada`;
    errEl.style.display = 'block';
    return false;
  }
  errEl.style.display = 'none';
  return true;
}

function cmSaveModel() {
  if (!cmValidateName()) return;

  const name = _cmEditingModel || document.getElementById('cmModelName')?.value?.trim();
  if (!name) return;

  const selected = cmGetSelected();
  if (!Object.keys(selected).length) {
    notify('⚠ Pilih minimal 1 komponen kelas!', 'warn');
    return;
  }

  const isEdit = !!_cmEditingModel;
  _customModels[name] = selected;
  cmSave();

  // If editing the currently active model, re-render classes
  if (isEdit && activeModelFilter === name) {
    renderClasses();
  }

  closeCustomModelModal();
  openCustomModelListModal();

  const total = Object.values(selected).reduce((s, v) => s + v, 0);
  notify(`✓ Model "${name}" ${isEdit ? 'diperbarui' : 'ditambahkan'} · ${Object.keys(selected).length} kelas · ${total} komponen`);
}

/* ── Hook into existing init to load custom models ── */
(function cmInit() {
  function runCmLoad() {
    cmLoad();
    // Restore active model if it's a custom model (init() ran before we existed)
    const savedModel = localStorage.getItem('vl_active_model');
    if (savedModel && _customModels[savedModel]) {
      activeModelFilter = savedModel;
      const sel = document.getElementById('pretrainedModel');
      if (sel) sel.value = savedModel;
      renderClasses();
    }
  }
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', runCmLoad);
  } else {
    runCmLoad();
  }
})();

/* ═══════════════════════════════════════════════════════════
   RESET & RELOAD FROM TXT
   Hapus data localStorage lalu muat ulang dari file .txt
   di folder yang sudah dipilih.
═══════════════════════════════════════════════════════════ */

/** Hapus semua memori localStorage untuk semua gambar yang ada di list */
function clearAllLocalStorage() {
  const count = state.images.length;
  if (!count) { notify('Tidak ada gambar di list', 'warn'); return; }

  showModal(
    '🗑 Hapus Semua Memori',
    `Hapus data localStorage untuk ${count} gambar?\n\nAnotasi yang ada di canvas TIDAK akan hilang — hanya memori sesi sebelumnya yang dihapus. Aksi ini tidak bisa di-undo.`,
    () => {
      let cleared = 0;
      state.images.forEach(img => {
        if (_clearImageMemory(img.name)) cleared++;
      });
      closeModal();
      notify(`🗑 ${cleared} memori gambar dihapus dari localStorage`);
    },
    'danger'
  );
}

/** Helper: hapus semua localStorage key milik satu gambar */
function _clearImageMemory(imgName) {
  try {
    localStorage.removeItem('vl_' + imgName);
    localStorage.removeItem('vl_' + imgName + '_meta');
    localStorage.removeItem(quickKey(imgName));
    // Hapus semua versi juga
    const versKey = verKey(imgName);
    localStorage.removeItem(versKey);
    return true;
  } catch(e) { return false; }
}

/**
 * Reset gambar aktif saat ini:
 * 1. Hapus localStorage
 * 2. Hapus anotasi in-memory
 * 3. Reload dari .txt di folder (jika ada)
 */
function resetCurrentFromTxt() {
  if (state.activeImg === null) { notify('Pilih gambar terlebih dahulu!', 'warn'); return; }
  const img = state.images[state.activeImg];

  const hasTxt = !!_folderHandle;
  const msg = hasTxt
    ? `Reset anotasi "${img.name}" dan muat ulang dari file .txt?\n\nLangkah:\n• Hapus memori localStorage\n• Reload dari ${img.name.replace(/\.[^.]+$/, '')}.txt\n• Jika .txt tidak ada, canvas akan kosong`
    : `Reset anotasi "${img.name}"?\n\nFolder belum dipilih — anotasi akan dihapus tanpa reload.\nPilih folder terlebih dahulu agar bisa reload dari .txt.`;

  showModal(
    '↺ Reset Gambar Ini',
    msg,
    async () => {
      closeModal();
      _clearImageMemory(img.name);
      img.annotations = [];
      img._hasTxtFile = undefined; // force re-check
      state.annotations = [];
      renderAnnotations();
      renderImgList();

      if (!_folderHandle) {
        notify(`🗑 Memori "${img.name}" dihapus (tanpa folder)`);
        return;
      }

      // Try to reload from txt
      const txtName = img.name.replace(/\.[^.]+$/, '') + '.txt';
      try {
        const fh      = await _folderHandle.getFileHandle(txtName, { create: false });
        const file    = await fh.getFile();
        const content = await file.text();
        const parsed  = _parseTxtFileToAnnotations(content, state.imgNatW, state.imgNatH);
        if (parsed && parsed.length > 0) {
          state.annotations = parsed;
          img.annotations   = parsed.map(a => ({...a}));
          // Re-save clean version to localStorage
          try {
            localStorage.setItem('vl_' + img.name,
              `# ${state.imgNatW} ${state.imgNatH}\n${annotationsToYOLO(parsed, state.imgNatW, state.imgNatH)}`);
          } catch(e) {}
          renderAnnotations();
          renderClasses();
          renderImgList();
          redrawCanvas();
          notify(`✓ "${img.name}" di-reset dan reload ${parsed.length} anotasi dari ${txtName}`);
        } else {
          notify(`↺ "${img.name}" di-reset — ${txtName} kosong atau tidak valid`, 'warn');
        }
      } catch(e) {
        if (e.name === 'NotFoundError') {
          notify(`↺ "${img.name}" di-reset — ${txtName} tidak ditemukan di folder`, 'warn');
        } else {
          notify(`⚠ Gagal baca ${txtName}: ${e.message}`, 'warn');
        }
      }
    },
    'danger'
  );
}

/**
 * Reset per-gambar dari tombol di image list (tanpa modal — langsung dengan confirm singkat)
 */
function resetSingleFromTxt(idx, e) {
  if (e) e.stopPropagation();
  const img = state.images[idx];
  if (!img) return;

  showModal(
    `↺ Reset "${img.name}"`,
    `Hapus memori localStorage gambar ini dan muat ulang dari file .txt di folder?\n\nJika file .txt tidak ditemukan, canvas akan kosong.`,
    async () => {
      closeModal();

      // If not currently active, select it first so imgNatW/H is set
      const wasActive = state.activeImg === idx;
      if (!wasActive) {
        // Clear without switching — just wipe memory
        _clearImageMemory(img.name);
        img.annotations = [];
        img._hasTxtFile = undefined;
        renderImgList();
        notify(`↺ Memori "${img.name}" dihapus — buka gambar untuk reload .txt`);
        return;
      }

      // It's the active image — we can reload immediately
      _clearImageMemory(img.name);
      img.annotations = [];
      img._hasTxtFile = undefined;
      state.annotations = [];
      renderAnnotations();

      if (!_folderHandle) {
        renderImgList();
        notify(`🗑 Memori "${img.name}" dihapus (folder belum dipilih)`, 'warn');
        return;
      }

      const txtName = img.name.replace(/\.[^.]+$/, '') + '.txt';
      try {
        const fh      = await _folderHandle.getFileHandle(txtName, { create: false });
        const file    = await fh.getFile();
        const content = await file.text();
        const parsed  = _parseTxtFileToAnnotations(content, state.imgNatW, state.imgNatH);
        if (parsed && parsed.length > 0) {
          state.annotations = parsed;
          img.annotations   = parsed.map(a => ({...a}));
          try {
            localStorage.setItem('vl_' + img.name,
              `# ${state.imgNatW} ${state.imgNatH}\n${annotationsToYOLO(parsed, state.imgNatW, state.imgNatH)}`);
          } catch(_) {}
          renderAnnotations();
          renderClasses();
          redrawCanvas();
          notify(`✓ Reload ${parsed.length} anotasi dari ${txtName}`);
        } else {
          notify(`↺ "${img.name}" di-reset — .txt kosong`, 'warn');
        }
      } catch(e) {
        notify(e.name === 'NotFoundError'
          ? `↺ "${img.name}" di-reset — .txt tidak ditemukan`
          : `⚠ ${e.message}`, 'warn');
      }
      renderImgList();
    },
    'danger'
  );
}

/**
 * Reset SEMUA gambar di list:
 * 1. Hapus localStorage semua gambar
 * 2. Reload masing-masing dari .txt (jika ada di folder)
 * Dilakukan secara batch — progress ditampilkan via notify
 */
function resetAllFromTxt() {
  const count = state.images.length;
  if (!count) { notify('Tidak ada gambar di list', 'warn'); return; }

  const hasTxt = !!_folderHandle;
  showModal(
    '↺ Reset Semua Gambar',
    hasTxt
      ? `Reset anotasi ${count} gambar dan muat ulang dari file .txt?\n\n• Semua memori localStorage akan dihapus\n• Setiap gambar akan di-reload dari .txt yang ada di folder\n• Gambar yang tidak punya .txt akan menjadi kosong\n\nAksi ini TIDAK BISA di-undo!`
      : `Reset anotasi ${count} gambar?\n\nFolder belum dipilih — semua memori localStorage akan dihapus tanpa reload.\nPilih folder terlebih dahulu agar bisa reload dari .txt.`,
    async () => {
      closeModal();
      const activeImg = state.images[state.activeImg];

      let cleared = 0, reloaded = 0, notFound = 0;

      for (const img of state.images) {
        _clearImageMemory(img.name);
        img.annotations = [];
        img._hasTxtFile = undefined;
        cleared++;

        if (!_folderHandle) continue;

        const txtName = img.name.replace(/\.[^.]+$/, '') + '.txt';
        try {
          const fh      = await _folderHandle.getFileHandle(txtName, { create: false });
          const file    = await fh.getFile();
          const content = await file.text();

          // Use stored dimensions if available, else 0 (will be recalculated on open)
          const natW = img.natW || 0;
          const natH = img.natH || 0;

          if (natW && natH) {
            const parsed = _parseTxtFileToAnnotations(content, natW, natH);
            if (parsed && parsed.length > 0) {
              img.annotations = parsed;
              img._hasTxtFile = false;
              // Save to localStorage
              try {
                localStorage.setItem('vl_' + img.name, `# ${natW} ${natH}\n${annotationsToYOLO(parsed, natW, natH)}`);
              } catch(_) {}
              reloaded++;
            }
          } else {
            // Dimensions unknown — mark for lazy load when opened
            img._hasTxtFile = true;
            reloaded++;
          }
        } catch(e) {
          if (e.name === 'NotFoundError') notFound++;
        }
      }

      // Reload the active image on canvas
      if (activeImg && state.activeImg !== null) {
        state.annotations = (activeImg.annotations || []).map(a => ({...a}));
        renderAnnotations();
        redrawCanvas();
      } else {
        state.annotations = [];
        renderAnnotations();
      }

      renderClasses();
      renderImgList();
      updateFolderCount();

      const parts = [`${cleared} gambar di-reset`];
      if (_folderHandle) {
        if (reloaded) parts.push(`${reloaded} reload dari .txt`);
        if (notFound) parts.push(`${notFound} .txt tidak ditemukan`);
      }
      notify(`✓ ${parts.join(' · ')}`);
    },
    'danger'
  );
}

/* ── Toggle reset panel visibility ── */
function toggleResetPanel() {
  const panel    = document.getElementById('resetPanel');
  const chevron  = document.getElementById('resetPanelChevron');
  const toggle   = document.getElementById('resetPanelToggle');
  if (!panel) return;
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
  if (toggle)  toggle.style.background = isOpen
    ? 'rgba(255,61,90,0.06)'
    : 'rgba(255,61,90,0.12)';
}

/* ═══════════════════════════════════════════════════════════
   LOCALSTORAGE MIGRATION & DIAGNOSTICS
═══════════════════════════════════════════════════════════ */

/**
 * One-time migration from old multi-key format to new single-key packed format.
 * Removes: vl_*_meta, vlv2_quick_* keys
 * Upgrades: vl_* entries that don't yet have embedded # natW natH meta
 */
function _migrateLocalStorage() {
  try {
    const toDelete = [];
    const toUpgrade = []; // [key, oldYolo, metaStr]

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;

      // Remove old _meta keys
      if (k.endsWith('_meta') && k.startsWith('vl_')) {
        toDelete.push(k);
        continue;
      }
      // Remove old quickKey entries
      if (k.startsWith('vlv2_quick_')) {
        toDelete.push(k);
        continue;
      }
      // Upgrade vl_ entries that don't have embedded meta
      if (k.startsWith('vl_') && !k.includes('_meta') && !k.includes('vlv2') &&
          k !== 'vl_active_model' && k !== 'vl_gemini_key' && k !== 'vl_backend_url') {
        const val = localStorage.getItem(k);
        if (val && val.trim() && !val.startsWith('#')) {
          // Old format — try to find matching _meta
          const metaRaw = localStorage.getItem(k + '_meta');
          toUpgrade.push([k, val, metaRaw]);
        }
      }
    }

    // Delete old keys
    toDelete.forEach(k => localStorage.removeItem(k));

    // Upgrade old format entries
    toUpgrade.forEach(([k, oldYolo, metaRaw]) => {
      try {
        let natW = 0, natH = 0;
        if (metaRaw) {
          const m = JSON.parse(metaRaw);
          natW = m.natW || 0; natH = m.natH || 0;
        }
        const packed = natW && natH ? `# ${natW} ${natH}\n${oldYolo}` : oldYolo;
        localStorage.setItem(k, packed);
      } catch(_) {}
    });

    if (toDelete.length || toUpgrade.length) {
      console.log(`[VL] localStorage migrated: ${toDelete.length} old keys removed, ${toUpgrade.length} entries upgraded`);
    }
  } catch(e) {
    console.warn('[VL] Migration error:', e);
  }
}

/**
 * Get localStorage usage stats.
 * Returns { usedKB, totalKB, usedPct, keys, vlKeys }
 */
function getStorageStats() {
  let used = 0;
  let vlKeys = 0;
  const keys = localStorage.length;
  try {
    for (let i = 0; i < keys; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      used += k.length + (localStorage.getItem(k) || '').length;
      if (k.startsWith('vl_') || k.startsWith('vlv2_')) vlKeys++;
    }
  } catch(e) {}
  const usedKB  = (used * 2 / 1024).toFixed(1); // UTF-16 = 2 bytes/char
  const totalKB = 5120; // typical 5MB limit
  const usedPct = Math.round(used * 2 / 1024 / totalKB * 100);
  return { usedKB, totalKB, usedPct, keys, vlKeys };
}

/**
 * Show storage stats in a notify — callable from console or a button.
 */
function showStorageStats() {
  const s = getStorageStats();
  notify(`💾 localStorage: ${s.usedKB}KB / ${s.totalKB}KB (${s.usedPct}%) · ${s.vlKeys} label keys`);
  console.log('[VL] Storage stats:', s);
}

/**
 * Purge ALL vl_ annotation keys for images no longer in the current session.
 * Safe: only removes keys whose image name is not in state.images.
 */
function purgeOrphanedStorage() {
  try {
    const activeNames = new Set(state.images.map(im => 'vl_' + im.name));
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if ((k.startsWith('vl_') || k.startsWith('vlv2_')) &&
          k !== 'vl_active_model' && k !== 'vl_gemini_key' &&
          k !== 'vl_backend_url' && k !== 'vl_custom_models') {
        // Check if it's an annotation key for an image not in current session
        if (k.startsWith('vl_') && !k.startsWith('vlv2_') &&
            !activeNames.has(k) && !k.endsWith('_meta')) {
          toRemove.push(k);
        }
        if (k.startsWith('vlv2_')) {
          // Old quick keys — always safe to remove
          toRemove.push(k);
        }
      }
    }
    toRemove.forEach(k => localStorage.removeItem(k));
    const s = getStorageStats();
    notify(`🧹 ${toRemove.length} entri lama dihapus · ${s.usedKB}KB tersisa`);
    return toRemove.length;
  } catch(e) {
    notify('⚠ Gagal membersihkan storage: ' + e.message, 'warn');
    return 0;
  }
}

/** Update the storage usage bar in the Save panel */
function updateStorageBar() {
  try {
    const s = getStorageStats();
    const fill  = document.getElementById('storageFill');
    const label = document.getElementById('storageLabel');
    if (!fill || !label) return;
    const pct   = Math.min(100, s.usedPct);
    fill.style.width      = pct + '%';
    fill.style.background = pct > 80 ? 'var(--danger)' : pct > 55 ? 'var(--warn)' : 'var(--accent3)';
    label.textContent     = `${s.usedKB}KB / ${s.totalKB}KB  (${s.vlKeys} label)`;
    label.style.color     = pct > 80 ? 'var(--danger)' : pct > 55 ? 'var(--warn)' : 'var(--muted)';
  } catch(e) {}
}

/* ═══════════════════════════════════════════════════════════
   EDIT CLASS MODAL
   Allows rename + recolor of any class in state.classes[].
   Syncs: renderClasses, classes.txt to folder, custom model grid if open.
═══════════════════════════════════════════════════════════ */

let _editClassIdx = -1;

const PALETTE_COLORS = [
  '#00e5ff','#ff6b35','#39ff14','#ff3d5a','#ff1744','#ff6d75','#2979ff','#82b1ff',
  '#00e676','#69f0ae','#eceff1','#cfd8dc','#546e7a','#78909c','#ffd600','#ffff8d',
  '#90a4ae','#b0bec5','#ffab40','#b9f6ca','#f5f5f5','#424242','#9e9e9e','#40c4ff',
  '#ff80ab','#ea80fc','#f48fb1','#ff9100','#e040fb','#ff8a65','#80d8ff','#f4ff81',
  '#ccff90','#a7ffeb','#ffe57f','#d500f9','#00bfa5','#64ffda','#ff6e40','#c6ff00',
];

function openEditClassModal(idx) {
  _editClassIdx = idx;
  const cls = state.classes[idx];
  if (!cls) return;

  const modal = document.getElementById('editClassModal');
  if (!modal) return;

  document.getElementById('ecClassName').value = cls.name;
  document.getElementById('ecClassIndex').textContent = `Indeks YOLO: ${idx}`;
  document.getElementById('ecNameError').style.display = 'none';

  // Build color palette
  _renderEcPalette(cls.color);

  // Count annotations using this class
  const count = state.annotations.filter(a => a.classIdx === idx).length;
  const usageEl = document.getElementById('ecUsageNote');
  if (usageEl) {
    usageEl.textContent = count
      ? `⚠ ${count} anotasi di gambar ini menggunakan kelas ini.`
      : 'Tidak ada anotasi aktif untuk kelas ini.';
    usageEl.style.color = count ? 'var(--warn)' : 'var(--muted)';
  }

  // Delete button — warn if used in any image
  const totalUsed = state.images.reduce((n, im) => {
    return n + (im.annotations || []).filter(a => a.classIdx === idx).length;
  }, count);
  const delBtn = document.getElementById('ecDeleteBtn');
  if (delBtn) {
    delBtn.title = totalUsed
      ? `⚠ Kelas ini digunakan di ${totalUsed} anotasi — menghapus akan merusak label!`
      : 'Hapus kelas ini';
    delBtn.style.opacity = totalUsed ? '0.5' : '1';
  }

  modal.style.display = 'flex';
  setTimeout(() => document.getElementById('ecClassName')?.focus(), 80);
}

function closeEditClassModal() {
  document.getElementById('editClassModal').style.display = 'none';
  _editClassIdx = -1;
}

function _renderEcPalette(selectedColor) {
  const grid = document.getElementById('ecPaletteGrid');
  if (!grid) return;
  grid.innerHTML = PALETTE_COLORS.map(c => `
    <div class="ec-swatch ${c === selectedColor ? 'selected' : ''}"
         style="background:${c}"
         onclick="ecSelectColor('${c}')"
         title="${c}"></div>
  `).join('');

  // Custom hex input
  const hexInp = document.getElementById('ecHexInput');
  if (hexInp) hexInp.value = selectedColor;
}

function ecSelectColor(hex) {
  // Update swatch selection
  document.querySelectorAll('#ecPaletteGrid .ec-swatch').forEach(el => {
    el.classList.toggle('selected', el.style.background === hex ||
      el.style.background === hexToRgb(hex));
  });
  const hexInp = document.getElementById('ecHexInput');
  if (hexInp) hexInp.value = hex;
  // Live preview dot in the name row
  const preview = document.getElementById('ecColorPreview');
  if (preview) preview.style.background = hex;
}

function ecHexChanged() {
  const val = document.getElementById('ecHexInput')?.value?.trim() || '';
  if (/^#[0-9a-fA-F]{6}$/.test(val)) {
    ecSelectColor(val);
    document.getElementById('ecColorPreview').style.background = val;
  }
}

function hexToRgb(hex) {
  // CSS may report as rgb(r,g,b) - helper for comparison
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgb(${r}, ${g}, ${b})`;
}

function saveEditClass() {
  const idx = _editClassIdx;
  if (idx < 0 || idx >= state.classes.length) return;

  const newName = document.getElementById('ecClassName')?.value?.trim() || '';
  const newColor = document.getElementById('ecHexInput')?.value?.trim() || state.classes[idx].color;
  const errEl = document.getElementById('ecNameError');

  // Validate name
  if (!newName) {
    errEl.textContent = '⚠ Nama tidak boleh kosong'; errEl.style.display = 'block'; return;
  }
  const duplicate = state.classes.findIndex((c, i) => c.name === newName && i !== idx);
  if (duplicate >= 0) {
    errEl.textContent = `⚠ Kelas "${newName}" sudah ada di indeks ${duplicate}`;
    errEl.style.display = 'block'; return;
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(newColor)) {
    errEl.textContent = '⚠ Warna harus format #RRGGBB'; errEl.style.display = 'block'; return;
  }

  const oldName = state.classes[idx].name;
  state.classes[idx].name  = newName;
  state.classes[idx].color = newColor;

  // Update all annotations classIdx references (idx stays the same, only name/color changes)
  // If name changed, update custom model BOMs that reference oldName
  if (oldName !== newName) {
    // Update _customModels BOM keys
    let cmChanged = false;
    Object.keys(_customModels).forEach(modelName => {
      const bom = _customModels[modelName];
      if (bom[oldName] !== undefined) {
        bom[newName] = bom[oldName];
        delete bom[oldName];
        cmChanged = true;
      }
    });
    if (cmChanged) cmSave();

    // Update MODEL_CLASSES built-in keys in memory (runtime only)
    Object.keys(MODEL_CLASSES).forEach(modelName => {
      const m = MODEL_CLASSES[modelName];
      if (m[oldName] !== undefined) {
        m[newName] = m[oldName];
        delete m[oldName];
      }
    });
  }

  closeEditClassModal();
  renderClasses();

  // Rebuild custom model dropdown/grid if modal is open
  if (document.getElementById('customModelModal')?.style.display === 'flex') {
    cmBuildClassGrid(cmGetSelected());
  }

  // Write updated classes.txt to folder
  if (_folderHandle) {
    writeClassesTxtToFolder().then(() =>
      notify(`✓ Kelas diperbarui · classes.txt ditulis ke folder`)
    );
  } else {
    notify(`✓ Kelas diperbarui${oldName !== newName ? ` ("${oldName}" → "${newName}")` : ''}`);
  }
}

function deleteEditClass() {
  const idx = _editClassIdx;
  if (idx < 0) return;
  const cls = state.classes[idx];

  const totalUsed = state.images.reduce((n, im) => {
    return n + (im.annotations || []).filter(a => a.classIdx === idx).length;
  }, 0) + state.annotations.filter(a => a.classIdx === idx).length;

  const msg = totalUsed
    ? `Hapus kelas "${cls.name}"?\n\n⚠ PERINGATAN: ${totalUsed} anotasi menggunakan kelas ini.\nAnnotasi tersebut akan kehilangan referensi kelas (menjadi classIdx=${idx} tapi nama hilang).\n\nLanjutkan?`
    : `Hapus kelas "${cls.name}"? Indeks kelas di atas ini akan bergeser.\n\nAksi ini tidak bisa di-undo.`;

  showModal('Hapus Kelas', msg, () => {
    state.classes.splice(idx, 1);

    // Remap annotations: classIdx > idx shifts down by 1
    state.annotations.forEach(a => {
      if (a.classIdx > idx) a.classIdx--;
    });
    state.images.forEach(im => {
      (im.annotations || []).forEach(a => {
        if (a.classIdx > idx) a.classIdx--;
      });
    });

    // Remove from custom models BOMs
    const clsName = cls.name;
    Object.keys(_customModels).forEach(modelName => {
      if (_customModels[modelName][clsName] !== undefined) {
        delete _customModels[modelName][clsName];
      }
    });
    cmSave();

    if (state.activeClass >= state.classes.length) {
      state.activeClass = Math.max(0, state.classes.length - 1);
    }

    closeModal();
    closeEditClassModal();
    renderClasses();
    redrawCanvas();

    if (_folderHandle) {
      writeClassesTxtToFolder().then(() =>
        notify(`🗑 Kelas "${clsName}" dihapus · classes.txt diperbarui`)
      );
    } else {
      notify(`🗑 Kelas "${clsName}" dihapus`);
    }
  }, 'danger');
}

/* ── Open edit modal directly from the ✎ button next to the dropdown ── */
function openEditModelModal() {
  const val = document.getElementById('pretrainedModel')?.value;
  if (!val || val === 'none' || val.startsWith('__yolo_')) return;
  openCustomModelListModal();
  // Switch to the right tab
  if (_BUILTIN_MODEL_NAMES.has(val) && !_customModels[val]) {
    cmSwitchTab('builtin');
  } else {
    cmSwitchTab(_BUILTIN_MODEL_NAMES.has(val) ? 'builtin' : 'custom');
  }
  // Short delay to let modal render, then open edit
  setTimeout(() => cmOpenEdit(val), 80);
}

/* ── Reset a built-in model override back to factory defaults ── */
function cmResetBuiltin(name) {
  showModal(
    '↺ Reset ke Default',
    `Reset model "${name}" ke BOM bawaan?\n\nPerubahan yang kamu buat akan dihapus dan BOM asli dikembalikan.\n\nAksi ini tidak bisa di-undo.`,
    () => {
      delete _customModels[name];
      cmSave(); // removes override → MODEL_CLASSES will use built-in again

      // Re-sync MODEL_CLASSES (cmMergeIntoModelClasses removes deleted custom keys)
      cmMergeIntoModelClasses();

      // Re-render active model if this was active
      if (activeModelFilter === name) renderClasses();

      closeModal();
      cmRenderList();
      notify(`↺ "${name}" direset ke BOM bawaan`);
    },
    'danger'
  );
}

/* ═══════════════════════════════════════════════════════════
   MODEL JSON EXPORT / IMPORT
═══════════════════════════════════════════════════════════ */

/**
 * Export ALL models (built-in + any custom overrides + custom-only) to JSON.
 * Format:
 * {
 *   "version": 1,
 *   "exportedAt": "2026-03-...",
 *   "classes": ["hub", "rivet_big", ...],   // full master class list
 *   "models": {
 *     "DTX-164A": {
 *       "source": "builtin",          // "builtin" | "builtin_overridden" | "custom"
 *       "bom": { "hub": 1, "rivet_big": 16, ... }
 *     },
 *     "MY_CUSTOM": {
 *       "source": "custom",
 *       "bom": { ... }
 *     }
 *   }
 * }
 */
function exportModelsJSON() {
  const models = {};

  // All built-in models
  _BUILTIN_MODEL_NAMES_ARR.forEach(name => {
    const isOverridden = !!_customModels[name];
    models[name] = {
      source: isOverridden ? 'builtin_overridden' : 'builtin',
      bom:    isOverridden ? { ..._customModels[name] } : { ..._BUILTIN_MODEL_BOMS[name] },
    };
  });

  // Custom-only models (not overrides)
  Object.keys(_customModels).forEach(name => {
    if (!_BUILTIN_MODEL_NAMES.has(name)) {
      models[name] = {
        source: 'custom',
        bom:    { ..._customModels[name] },
      };
    }
  });

  const payload = {
    version:    1,
    exportedAt: new Date().toISOString(),
    appVersion: 'VisionLabel Pro',
    classes:    state.classes.map(c => ({ name: c.name, color: c.color })),
    models,
  };

  const json     = JSON.stringify(payload, null, 2);
  const filename = `visionlabel_models_${new Date().toISOString().slice(0,10)}.json`;
  downloadText(json, filename);

  const total   = Object.keys(models).length;
  const custom  = Object.values(models).filter(m => m.source === 'custom').length;
  const edited  = Object.values(models).filter(m => m.source === 'builtin_overridden').length;
  notify(`⬇ Export: ${total} model (${custom} custom · ${edited} diedit) → ${filename}`);
}

/**
 * Import models from a JSON file produced by exportModelsJSON().
 * Merge strategy:
 *   - "builtin" entries: skip (no override needed) unless the BOM differs from factory
 *   - "builtin_overridden" entries: apply as override in _customModels
 *   - "custom" entries: add to _customModels (confirm overwrite if name exists)
 *   - New classes in payload.classes: added to state.classes if not already present
 */
function importModelsJSON(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  // Reset file input so re-importing same file works
  event.target.value = '';

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const payload = JSON.parse(e.target.result);

      if (!payload.models || typeof payload.models !== 'object') {
        notify('⚠ File JSON tidak valid: field "models" tidak ditemukan', 'warn');
        return;
      }

      // ── 1. Merge classes ──
      let newClassCount = 0;
      if (Array.isArray(payload.classes)) {
        payload.classes.forEach(({ name, color }) => {
          if (!name) return;
          if (!state.classes.find(c => c.name === name)) {
            state.classes.push({ name, color: color || '#888888' });
            newClassCount++;
          }
        });
        if (newClassCount > 0) {
          renderClasses();
          if (_folderHandle) writeClassesTxtToFolder();
        }
      }

      // ── 2. Merge models ──
      const entries     = Object.entries(payload.models);
      let added         = 0;
      let overwritten   = 0;
      let skipped       = 0;
      const conflicts   = []; // { name, source, incoming, existing }

      entries.forEach(([name, { source, bom }]) => {
        if (!bom || typeof bom !== 'object') return;

        if (source === 'builtin') {
          // Only apply if BOM differs from factory default
          const factory = _BUILTIN_MODEL_BOMS[name];
          if (factory && JSON.stringify(bom) === JSON.stringify(factory)) {
            skipped++; return; // identical to factory — nothing to do
          }
          // Falls through to override logic
        }

        const alreadyCustom = !!_customModels[name];
        if (alreadyCustom) {
          conflicts.push({ name, source, bom, existing: _customModels[name] });
        } else {
          _customModels[name] = { ...bom };
          added++;
        }
      });

      // ── 3. Handle conflicts ──
      if (conflicts.length > 0) {
        _resolveImportConflicts(conflicts, added, overwritten, skipped, newClassCount);
      } else {
        _finaliseImport(added, overwritten, skipped, newClassCount);
      }

    } catch (err) {
      notify('⚠ Gagal membaca JSON: ' + err.message, 'warn');
    }
  };
  reader.readAsText(file);
}

/**
 * Show a modal asking what to do with conflicting model names.
 */
function _resolveImportConflicts(conflicts, added, overwritten, skipped, newClassCount) {
  const names = conflicts.map(c => `"${c.name}"`).join(', ');
  showModal(
    '⚠ Konflik Import',
    `${conflicts.length} model sudah ada:\n${names}\n\nPilih tindakan:`,
    () => {
      // "Timpa Semua" — overwrite all conflicts
      conflicts.forEach(({ name, bom }) => {
        _customModels[name] = { ...bom };
        overwritten++;
      });
      _finaliseImport(added, overwritten, skipped, newClassCount);
      closeModal();
    },
    'warn',
    'Timpa Semua',
    () => {
      // "Lewati" — keep existing, skip conflicts
      skipped += conflicts.length;
      _finaliseImport(added, overwritten, skipped, newClassCount);
      closeModal();
    },
    'Lewati'
  );
}

function _finaliseImport(added, overwritten, skipped, newClassCount) {
  cmSave(); // persist to localStorage
  cmRebuildDropdown();
  cmRenderList();
  if (activeModelFilter && MODEL_CLASSES[activeModelFilter]) renderClasses();

  const parts = [];
  if (added)        parts.push(`${added} ditambahkan`);
  if (overwritten)  parts.push(`${overwritten} ditimpa`);
  if (skipped)      parts.push(`${skipped} dilewati`);
  if (newClassCount) parts.push(`${newClassCount} kelas baru`);
  notify(`⬆ Import selesai: ${parts.join(' · ')}`);
}