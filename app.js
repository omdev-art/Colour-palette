/* ==========================================================================
   OMEXLA CREATIVITY STUDIO v5.0 - ENTERPRISE RENDER & APP LOGIC BUNDLE
   ========================================================================== */

const canvas = document.getElementById('paintCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

// Application State Matrix
let currentTool = 'brush';
let currentShape = 'none';
let brushSize = 5;
let brushColor = '#38bdf8';
let isDrawing = false;
let startX = 0;
let startY = 0;
let snapshot = null;

// History Stack for Enterprise Undo/Redo
let historyStack = [];
let redoStack = [];
const MAX_HISTORY = 30;

// Session Timer Tracking
let sessionSeconds = 0;
setInterval(() => {
  sessionSeconds++;
  const mins = String(Math.floor(sessionSeconds / 60)).padStart(2, '0');
  const secs = String(sessionSeconds % 60).padStart(2, '0');
  const timerEl = document.getElementById('sessionTimer');
  if (timerEl) timerEl.innerText = `${mins}:${secs}`;
}, 1000);

// Initialize High-Resolution Backing Canvas & Responsive Matrix
function initStudioCanvas() {
  const container = document.getElementById('canvasContainer');
  if (!container) return;
  
  const rect = container.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  
  // Set default solid white / canvas background
  ctx.fillStyle = document.documentElement.classList.contains('dark') ? '#07090e' : '#ffffff';
  ctx.fillRect(0, 0, rect.width, rect.height);
  
  const resIndicator = document.getElementById('canvasResIndicator');
  if (resIndicator) resIndicator.innerText = `${Math.round(rect.width)}x${Math.round(rect.height)}px`;
  
  saveState();
}

window.addEventListener('load', initStudioCanvas);
window.addEventListener('resize', () => {
  const dataURL = canvas.toDataURL();
  const container = document.getElementById('canvasContainer');
  const rect = container.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  
  const img = new Image();
  img.src = dataURL;
  img.onload = () => {
    ctx.drawImage(img, 0, 0, rect.width, rect.height);
  };
  
  const resIndicator = document.getElementById('canvasResIndicator');
  if (resIndicator) resIndicator.innerText = `${Math.round(rect.width)}x${Math.round(rect.height)}px`;
});

// ==========================================================================
// TOOL & UI STATE MANAGERS
// ==========================================================================
function setTool(toolName) {
  currentTool = toolName;
  document.querySelectorAll('.tool-card').forEach(btn => {
    if (btn.dataset.tool === toolName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  // If selecting an explicit utility tool, reset shape to freehand
  if (toolName === 'eraser' || toolName === 'bucket') {
    setShape('none');
  }
}

function setShape(shapeName) {
  currentShape = shapeName;
  document.querySelectorAll('.shape-card').forEach(btn => {
    if (btn.dataset.shape === shapeName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

function updateBrushSize(val) {
  brushSize = parseInt(val);
  const label = document.getElementById('sizeValLabel');
  if (label) label.innerText = `${brushSize}px`;
}

function updateColor(hex) {
  brushColor = hex;
  const colorInput = document.getElementById('brushColor');
  const hexInput = document.getElementById('hexInput');
  const badge = document.getElementById('colorPreviewBadge');
  
  if (colorInput) colorInput.value = hex;
  if (hexInput) hexInput.value = hex;
  if (badge) badge.style.background = hex;
}

function updateColorHex(hexStr) {
  if (/^#[0-9A-F]{6}$/i.test(hexStr)) {
    updateColor(hexStr);
  }
}

// ==========================================================================
// HISTORY STACK (UNDO / REDO)
// ==========================================================================
function saveState() {
  if (historyStack.length >= MAX_HISTORY) historyStack.shift();
  historyStack.push(canvas.toDataURL());
  redoStack = []; // Clear redo chain on new action
}

function undoCanvas() {
  if (historyStack.length <= 1) {
    showToast("Beginning of history stack reached.");
    return;
  }
  redoStack.push(historyStack.pop());
  const previousState = historyStack[historyStack.length - 1];
  restoreCanvasState(previousState);
  showToast("Undo executed successfully.");
}

function redoCanvas() {
  if (redoStack.length === 0) {
    showToast("No forward actions to redo.");
    return;
  }
  const nextState = redoStack.pop();
  historyStack.push(nextState);
  restoreCanvasState(nextState);
  showToast("Redo executed successfully.");
}

function restoreCanvasState(dataUrl) {
  const img = new Image();
  img.src = dataUrl;
  img.onload = () => {
    const container = document.getElementById('canvasContainer');
    const rect = container.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.drawImage(img, 0, 0, rect.width, rect.height);
  };
}

// Keyboard shortcuts for Undo/Redo
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    undoCanvas();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    redoCanvas();
  }
});

// ==========================================================================
// DRAWING & SHAPE RENDERING ENGINE
// ==========================================================================
function getCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: clientX - rect.left,
    y: clientY - rect.top
  };
}

function startAction(e) {
  isDrawing = true;
  const coords = getCanvasCoords(e);
  startX = coords.x;
  startY = coords.y;
  
  const container = document.getElementById('canvasContainer');
  const rect = container.getBoundingClientRect();
  snapshot = ctx.getImageData(0, 0, rect.width, rect.height);

  if (currentTool === 'bucket') {
    executeFloodFill(Math.floor(coords.x), Math.floor(coords.y), brushColor);
    isDrawing = false;
    saveState();
    return;
  }

  if (currentShape === 'none') {
    ctx.beginPath();
    ctx.moveTo(startX, startY);
  }
}

function executeDrawing(e) {
  if (!isDrawing) return;
  e.preventDefault();
  
  const coords = getCanvasCoords(e);
  const container = document.getElementById('canvasContainer');
  const rect = container.getBoundingClientRect();

  if (currentShape !== 'none') {
    // Shape preview using stored snapshot
    ctx.putImageData(snapshot, 0, 0);
    ctx.strokeStyle = brushColor;
    ctx.fillStyle = brushColor;
    ctx.lineWidth = brushSize;
    ctx.beginPath();

    if (currentShape === 'rectangle') {
      ctx.strokeRect(startX, startY, coords.x - startX, coords.y - startY);
    } else if (currentShape === 'fill-rect') {
      ctx.fillRect(startX, startY, coords.x - startX, coords.y - startY);
    } else if (currentShape === 'circle') {
      let radius = Math.hypot(coords.x - startX, coords.y - startY);
      ctx.arc(startX, startY, radius, 0, Math.PI * 2);
      ctx.stroke();
    } else if (currentShape === 'fill-circle') {
      let radius = Math.hypot(coords.x - startX, coords.y - startY);
      ctx.arc(startX, startY, radius, 0, Math.PI * 2);
      ctx.fill();
    } else if (currentShape === 'line') {
      ctx.moveTo(startX, startY);
      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();
    }
    return;
  }

  // Freehand Brush & Tool Mechanics
  ctx.lineTo(coords.x, coords.y);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowBlur = 0;

  if (currentTool === 'eraser') {
    const isDark = document.documentElement.classList.contains('dark');
    ctx.strokeStyle = isDark ? '#07090e' : '#ffffff';
    ctx.lineWidth = brushSize * 2.5;
    ctx.globalAlpha = 1.0;
  } else if (currentTool === 'pen') {
    ctx.strokeStyle = brushColor;
    ctx.lineWidth = Math.max(1, brushSize * 0.5);
    ctx.globalAlpha = 1.0;
  } else if (currentTool === 'marker') {
    ctx.strokeStyle = brushColor;
    ctx.lineWidth = brushSize * 2;
    ctx.globalAlpha = 0.85;
  } else if (currentTool === 'calligraphy') {
    ctx.strokeStyle = brushColor;
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'square';
    ctx.globalAlpha = 1.0;
  } else if (currentTool === 'highlighter') {
    ctx.strokeStyle = brushColor;
    ctx.lineWidth = brushSize * 3;
    ctx.globalAlpha = 0.25;
  } else if (currentTool === 'glow') {
    ctx.strokeStyle = brushColor;
    ctx.lineWidth = brushSize;
    ctx.shadowColor = brushColor;
    ctx.shadowBlur = 18;
    ctx.globalAlpha = 1.0;
  } else if (currentTool === 'airbrush') {
    ctx.fillStyle = brushColor;
    ctx.shadowBlur = 0;
    for (let i = 0; i < 18; i++) {
      let offsetX = (Math.random() - 0.5) * brushSize * 3.5;
      let offsetY = (Math.random() - 0.5) * brushSize * 3.5;
      ctx.fillRect(coords.x + offsetX, coords.y + offsetY, 1.5, 1.5);
    }
    return;
  } else {
    // Standard Brush
    ctx.strokeStyle = brushColor;
    ctx.lineWidth = brushSize;
    ctx.globalAlpha = 1.0;
  }

  ctx.stroke();
}

function stopAction() {
  if (!isDrawing) return;
  isDrawing = false;
  ctx.shadowBlur = 0;
  saveState();
}

// Mouse & Touch Bindings
canvas.addEventListener('mousedown', startAction);
canvas.addEventListener('mousemove', executeDrawing);
canvas.addEventListener('mouseup', stopAction);
canvas.addEventListener('mouseleave', stopAction);

canvas.addEventListener('touchstart', startAction, { passive: false });
canvas.addEventListener('touchmove', executeDrawing, { passive: false });
canvas.addEventListener('touchend', stopAction);

// ==========================================================================
// FLOOD FILL ALGORITHM (PAINT BUCKET)
// ==========================================================================
function executeFloodFill(startX, startY, fillColorHex) {
  const container = document.getElementById('canvasContainer');
  const rect = container.getBoundingClientRect();
  const imgData = ctx.getImageData(0, 0, rect.width, rect.height);
  const data = imgData.data;

  const targetIdx = (startY * Math.floor(rect.width) + startX) * 4;
  const targetR = data[targetIdx];
  const targetG = data[targetIdx + 1];
  const targetB = data[targetIdx + 2];
  const targetA = data[targetIdx + 3];

  // Convert fill color hex to RGB
  const rgb = hexToRgb(fillColorHex);
  if (!rgb) return;
  
  if (targetR === rgb.r && targetG === rgb.g && targetB === rgb.b) return;

  const queue = [[startX, startY]];
  const width = Math.floor(rect.width);
  const height = Math.floor(rect.height);

  while (queue.length > 0) {
    const [x, y] = queue.pop();
    const idx = (y * width + x) * 4;

    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    
    if (
      data[idx] === targetR &&
      data[idx + 1] === targetG &&
      data[idx + 2] === targetB &&
      data[idx + 3] === targetA
    ) {
      data[idx] = rgb.r;
      data[idx + 1] = rgb.g;
      data[idx + 2] = rgb.b;
      data[idx + 3] = 255;

      queue.push([x + 1, y]);
      queue.push([x - 1, y]);
      queue.push([x, y + 1]);
      queue.push([x, y - 1]);
    }
  }

  ctx.putImageData(imgData, 0, 0);
  showToast("Flood fill applied successfully.");
}

function hexToRgb(hex) {
  const bigint = parseInt(hex.replace('#', ''), 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255
  };
}

// ==========================================================================
// TEMPLATE ENGINE WITH AUTOMATIC ERROR FALLBACK
// ==========================================================================
function loadTemplate(type) {
  const container = document.getElementById('canvasContainer');
  const rect = container.getBoundingClientRect();
  
  let imageUrl = "";
  if (type === 'cyberpunk') {
    imageUrl = "https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=1000&auto=format&fit=crop";
  } else if (type === 'mandala') {
    imageUrl = "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=1000&auto=format&fit=crop";
  } else if (type === 'blueprint') {
    imageUrl = "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=1000&auto=format&fit=crop";
  }

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = imageUrl;

  img.onload = () => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.drawImage(img, 0, 0, rect.width, rect.height);
    saveState();
    showToast(`Template '${type.toUpperCase()}' loaded successfully.`);
  };

  img.onerror = () => {
    // Automated Error Telemetry Fallback
    showToast(`⚠️ Template sync failed. Defaulting to clean workspace.`);
  };
}

// ==========================================================================
// POST-PROCESSING FX FILTERS
// ==========================================================================
function applyFilter(filterName) {
  const container = document.getElementById('canvasContainer');
  const rect = container.getBoundingClientRect();
  const imgData = ctx.getImageData(0, 0, rect.width, rect.height);
  const data = imgData.data;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2];

    if (filterName === 'invert') {
      data[i] = 255 - r;
      data[i + 1] = 255 - g;
      data[i + 2] = 255 - b;
    } else if (filterName === 'grayscale') {
      let avg = 0.3 * r + 0.59 * g + 0.11 * b;
      data[i] = avg;
      data[i + 1] = avg;
      data[i + 2] = avg;
    } else if (filterName === 'sepia') {
      data[i] = Math.min(255, (r * 0.393) + (g * 0.769) + (b * 0.189));
      data[i + 1] = Math.min(255, (r * 0.349) + (g * 0.686) + (b * 0.168));
      data[i + 2] = Math.min(255, (r * 0.272) + (g * 0.534) + (b * 0.131));
    } else if (filterName === 'brightness') {
      data[i] = Math.min(255, r * 1.25);
      data[i + 1] = Math.min(255, g * 1.25);
      data[i + 2] = Math.min(255, b * 1.25);
    }
  }

  ctx.putImageData(imgData, 0, 0);
  saveState();
  showToast(`Filter '${filterName.toUpperCase()}' applied.`);
}

// ==========================================================================
// UTILITY ACTIONS & UI TOASTS
// ==========================================================================
function clearCanvasPrompt() {
  if (confirm("Are you sure you want to clear your current masterpiece?")) {
    const container = document.getElementById('canvasContainer');
    const rect = container.getBoundingClientRect();
    const isDark = document.documentElement.classList.contains('dark');
    ctx.fillStyle = isDark ? '#07090e' : '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    saveState();
    showToast("Workspace wiped clean.");
  }
}

function showToast(msg) {
  const banner = document.getElementById('toastBanner');
  const msgEl = document.getElementById('toastMessage');
  if (!banner || !msgEl) return;
  
  msgEl.innerText = msg;
  banner.classList.add('show');
  setTimeout(() => {
    banner.classList.remove('show');
  }, 3500);
}

// Theme & Fullscreen Toggles
function toggleTheme() {
  const html = document.documentElement;
  html.classList.toggle('dark');
  showToast(html.classList.contains('dark') ? "Dark theme enabled." : "Light theme enabled.");
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      showToast("Fullscreen mode restricted.");
    });
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
  }
}

// ==========================================================================
// ELITE EXPORT MODAL MANAGERS
// ==========================================================================
function openDownloadModal() {
  const modal = document.getElementById('downloadModal');
  if (modal) modal.style.display = 'flex';
}

function closeDownloadModal() {
  const modal = document.getElementById('downloadModal');
  if (modal) modal.style.display = 'none';
}

function executeDownload(format) {
  const link = document.createElement('a');
  link.download = `omexla-masterpiece.${format}`;
  link.href = canvas.toDataURL(`image/${format}`, 1.0);
  link.click();
  closeDownloadModal();
  showToast(`Artwork successfully exported as ${format.toUpperCase()}.`);
}
