const $ = (selector) => document.querySelector(selector);

const els = {
  file: $('#fileInput'), dropzone: $('#dropzone'), sourceThumb: $('#sourceThumb'),
  width: $('#widthRange'), widthOutput: $('#widthOutput'), color: $('#colorRange'),
  colorOutput: $('#colorOutput'), codes: $('#codeToggle'), generate: $('#generateButton'),
  canvas: $('#patternCanvas'), empty: $('#emptyState'), busy: $('#busy'), summary: $('#summary'),
  size: $('#sizeStat'), beads: $('#beadStat'), colorStat: $('#colorStat'), actions: $('#actions'),
  png: $('#downloadPng'), csv: $('#downloadCsv'), legendSection: $('#legendSection'),
  legend: $('#legendGrid'), toast: $('#toast')
};

const state = { image: null, fileName: '拼豆图纸', palette: [], cells: [], cols: 0, rows: 0, usage: [] };
let regenerateTimer;

function hexToRgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbToLab(rgb) {
  let [r, g, b] = rgb.map(v => v / 255).map(v => v > .04045 ? ((v + .055) / 1.055) ** 2.4 : v / 12.92);
  let x = (r * .4124 + g * .3576 + b * .1805) / .95047;
  let y = (r * .2126 + g * .7152 + b * .0722);
  let z = (r * .0193 + g * .1192 + b * .9505) / 1.08883;
  const f = v => v > .008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116;
  x = f(x); y = f(y); z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function distance(a, b) {
  const dl = a[0] - b[0], da = a[1] - b[1], db = a[2] - b[2];
  return dl * dl + da * da + db * db;
}

function nearestColor(lab, colors) {
  let best = colors[0], bestDistance = Infinity;
  for (const color of colors) {
    const score = distance(lab, color.lab);
    if (score < bestDistance) { bestDistance = score; best = color; }
  }
  return best;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove('show'), 2200);
}

async function loadPalette() {
  const response = await fetch('./data/mard-221.json');
  if (!response.ok) throw new Error('色卡加载失败');
  const colors = await response.json();
  state.palette = colors.map(item => {
    const rgb = item.rgb || hexToRgb(item.hex);
    return { code: item.code, hex: item.hex, rgb, lab: rgbToLab(rgb) };
  });
}

async function useFile(file) {
  if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) {
    showToast('请选择 JPG、PNG 或 WEBP 图片'); return;
  }
  if (file.size > 20 * 1024 * 1024) { showToast('图片请控制在 20 MB 以内'); return; }
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    if (state.image?.src?.startsWith('blob:')) URL.revokeObjectURL(state.image.src);
    state.image = image;
    state.fileName = file.name.replace(/\.[^.]+$/, '') || '拼豆图纸';
    els.sourceThumb.src = url;
    els.dropzone.classList.add('has-image');
    els.generate.disabled = false;
    generatePattern();
  };
  image.onerror = () => { URL.revokeObjectURL(url); showToast('这张图片无法读取，请换一张试试'); };
  image.src = url;
}

function getPixels() {
  const cols = Number(els.width.value);
  const ratio = state.image.naturalHeight / state.image.naturalWidth;
  const rows = Math.max(1, Math.min(260, Math.round(cols * ratio)));
  const sample = document.createElement('canvas');
  sample.width = cols; sample.height = rows;
  const context = sample.getContext('2d', { willReadFrequently: true });
  context.fillStyle = '#fff'; context.fillRect(0, 0, cols, rows);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(state.image, 0, 0, cols, rows);
  return { cols, rows, data: context.getImageData(0, 0, cols, rows).data };
}

function quantize({ cols, rows, data }) {
  const labs = new Array(cols * rows);
  const firstPass = new Array(cols * rows);
  const counts = new Map();
  for (let i = 0; i < labs.length; i++) {
    const offset = i * 4;
    const alpha = data[offset + 3] / 255;
    const rgb = [0, 1, 2].map(channel => Math.round(data[offset + channel] * alpha + 255 * (1 - alpha)));
    const lab = rgbToLab(rgb);
    labs[i] = lab;
    const match = nearestColor(lab, state.palette);
    firstPass[i] = match;
    counts.set(match.code, (counts.get(match.code) || 0) + 1);
  }
  const maxColors = Number(els.color.value);
  const selected = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxColors)
    .map(([code]) => state.palette.find(color => color.code === code));
  const cells = labs.map((lab, index) => selected.includes(firstPass[index]) ? firstPass[index] : nearestColor(lab, selected));
  const finalCounts = new Map();
  cells.forEach(color => finalCounts.set(color.code, (finalCounts.get(color.code) || 0) + 1));
  const usage = [...finalCounts.entries()].map(([code, count]) => ({
    ...state.palette.find(color => color.code === code), count
  })).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code, 'en', { numeric: true }));
  return { cols, rows, cells, usage };
}

async function generatePattern() {
  if (!state.image || !state.palette.length) return;
  els.busy.hidden = false;
  els.generate.disabled = true;
  await new Promise(resolve => setTimeout(resolve, 30));
  try {
    const result = quantize(getPixels());
    Object.assign(state, result);
    renderPattern();
    renderLegend();
    els.empty.hidden = true;
    els.canvas.style.display = 'block';
    els.summary.hidden = false;
    els.actions.hidden = false;
    els.legendSection.hidden = false;
    els.size.textContent = `${state.cols} × ${state.rows}`;
    els.beads.textContent = (state.cols * state.rows).toLocaleString('zh-CN');
    els.colorStat.textContent = `${state.usage.length} 色`;
  } catch (error) {
    console.error(error); showToast('生成失败，请换一张图片再试');
  } finally {
    els.busy.hidden = true;
    els.generate.disabled = false;
  }
}

function drawChart(canvas, cellSize, showCodes, includeTitle = false) {
  const labelSize = showCodes ? Math.max(28, Math.round(cellSize * 1.4)) : Math.max(20, cellSize);
  const titleHeight = includeTitle ? 66 : 0;
  canvas.width = labelSize + state.cols * cellSize + 1;
  canvas.height = titleHeight + labelSize + state.rows * cellSize + 1;
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
  if (includeTitle) {
    context.fillStyle = '#29425b'; context.font = '700 22px sans-serif';
    context.fillText(`${state.fileName} · MARD 拼豆图纸`, 16, 28);
    context.fillStyle = '#65706b'; context.font = '14px sans-serif';
    context.fillText(`${state.cols} × ${state.rows} · 共 ${(state.cols * state.rows).toLocaleString()} 颗 · ${state.usage.length} 色`, 16, 50);
  }
  const top = titleHeight + labelSize;
  context.textAlign = 'center'; context.textBaseline = 'middle';
  context.fillStyle = '#65706b'; context.font = `${Math.max(9, cellSize * .42)}px sans-serif`;
  for (let col = 0; col < state.cols; col++) if ((col + 1) % 5 === 0 || col === 0) context.fillText(col + 1, labelSize + col * cellSize + cellSize / 2, titleHeight + labelSize / 2);
  for (let row = 0; row < state.rows; row++) if ((row + 1) % 5 === 0 || row === 0) context.fillText(row + 1, labelSize / 2, top + row * cellSize + cellSize / 2);
  for (let row = 0; row < state.rows; row++) {
    for (let col = 0; col < state.cols; col++) {
      const color = state.cells[row * state.cols + col];
      const x = labelSize + col * cellSize, y = top + row * cellSize;
      context.fillStyle = color.hex;
      context.beginPath(); context.arc(x + cellSize / 2, y + cellSize / 2, cellSize * .42, 0, Math.PI * 2); context.fill();
      if (showCodes) {
        const luminance = color.rgb[0] * .299 + color.rgb[1] * .587 + color.rgb[2] * .114;
        context.fillStyle = luminance > 150 ? '#29425b' : '#fff';
        context.font = `700 ${Math.max(7, cellSize * .3)}px sans-serif`;
        context.fillText(color.code, x + cellSize / 2, y + cellSize / 2 + .5);
      }
    }
  }
  context.strokeStyle = 'rgba(41,66,91,.16)'; context.lineWidth = 1;
  for (let col = 0; col <= state.cols; col++) {
    context.beginPath(); context.moveTo(labelSize + col * cellSize + .5, top); context.lineTo(labelSize + col * cellSize + .5, top + state.rows * cellSize); context.stroke();
  }
  for (let row = 0; row <= state.rows; row++) {
    context.beginPath(); context.moveTo(labelSize, top + row * cellSize + .5); context.lineTo(labelSize + state.cols * cellSize, top + row * cellSize + .5); context.stroke();
  }
  context.strokeStyle = 'rgba(238,131,170,.78)'; context.lineWidth = Math.max(1, cellSize * .08);
  for (let col = 0; col <= state.cols; col += 10) {
    context.beginPath(); context.moveTo(labelSize + col * cellSize, top); context.lineTo(labelSize + col * cellSize, top + state.rows * cellSize); context.stroke();
  }
  for (let row = 0; row <= state.rows; row += 10) {
    context.beginPath(); context.moveTo(labelSize, top + row * cellSize); context.lineTo(labelSize + state.cols * cellSize, top + row * cellSize); context.stroke();
  }
}

function renderPattern() {
  const showCodes = els.codes.checked;
  drawChart(els.canvas, showCodes ? 20 : 14, showCodes);
}

function renderLegend() {
  const total = state.cols * state.rows;
  els.legend.innerHTML = state.usage.map(color => `
    <article class="legend-item">
      <span class="swatch" style="background:${color.hex}" aria-label="${color.hex}"></span>
      <span><b>${color.code}</b><small>${color.hex.toUpperCase()}</small></span>
      <strong>${color.count.toLocaleString()} 颗</strong>
    </article>`).join('');
}

function downloadBlob(blob, name) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob); link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function downloadPng() {
  const canvas = document.createElement('canvas');
  const longest = Math.max(state.cols, state.rows);
  const safeAreaSize = Math.floor(Math.sqrt(24000000 / (state.cols * state.rows)));
  const cellSize = Math.max(12, Math.min(30, Math.floor(5600 / longest), safeAreaSize));
  drawChart(canvas, cellSize, true, true);
  canvas.toBlob(blob => blob && downloadBlob(blob, `${state.fileName}-拼豆图纸-${state.cols}x${state.rows}.png`), 'image/png');
}

function downloadCsv() {
  const total = state.cols * state.rows;
  const rows = [['色号', 'HEX', '所需颗数', '占比'], ...state.usage.map(c => [c.code, c.hex.toUpperCase(), c.count, `${(c.count / total * 100).toFixed(2)}%`])];
  const csv = '\ufeff' + rows.map(row => row.join(',')).join('\r\n');
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${state.fileName}-拼豆用料表.csv`);
}

function scheduleRegenerate() {
  if (!state.image) return;
  clearTimeout(regenerateTimer);
  regenerateTimer = setTimeout(generatePattern, 260);
}

els.file.addEventListener('change', event => useFile(event.target.files[0]));
['dragenter', 'dragover'].forEach(type => els.dropzone.addEventListener(type, event => { event.preventDefault(); els.dropzone.classList.add('dragging'); }));
['dragleave', 'drop'].forEach(type => els.dropzone.addEventListener(type, event => { event.preventDefault(); els.dropzone.classList.remove('dragging'); }));
els.dropzone.addEventListener('drop', event => useFile(event.dataTransfer.files[0]));
els.width.addEventListener('input', () => { els.widthOutput.textContent = `${els.width.value} 颗`; scheduleRegenerate(); });
els.color.addEventListener('input', () => { els.colorOutput.textContent = `${els.color.value} 色`; scheduleRegenerate(); });
els.codes.addEventListener('change', () => state.cells.length && renderPattern());
els.generate.addEventListener('click', generatePattern);
els.png.addEventListener('click', downloadPng);
els.csv.addEventListener('click', downloadCsv);

function registerWebMcp() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  try {
    context.registerTool({
      name: 'configure_bead_pattern', title: '调整拼豆图纸',
      description: '调整当前拼豆图纸的横向豆数、最多用色数和色号显示方式。页面中必须已经上传照片。',
      inputSchema: { type: 'object', properties: {
        width: { type: 'integer', minimum: 12, maximum: 160 },
        maxColors: { type: 'integer', minimum: 6, maximum: 60 },
        showCodes: { type: 'boolean' }
      }, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input) {
        if (!state.image) throw new Error('请先在页面中上传照片');
        if (input.width !== undefined) els.width.value = input.width;
        if (input.maxColors !== undefined) els.color.value = input.maxColors;
        if (input.showCodes !== undefined) els.codes.checked = input.showCodes;
        els.widthOutput.textContent = `${els.width.value} 颗`; els.colorOutput.textContent = `${els.color.value} 色`;
        await generatePattern();
        return { width: state.cols, height: state.rows, totalBeads: state.cols * state.rows, colorsUsed: state.usage.length };
      }
    });
  } catch (error) { console.debug('WebMCP unavailable', error); }
}

loadPalette().then(registerWebMcp).catch(error => { console.error(error); showToast('标准色卡加载失败，请刷新页面'); });
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
