(() => {
  const frame = document.getElementById("result-preview-frame");
  if (!frame) return;
  const slider = document.getElementById("preview-slider");
  const stateText = document.getElementById("result-state-text");
  const isReady = frame.dataset.ready === "1";
  const processingSource = document.querySelector(".processing-source-img");
  const beforeImg = document.querySelector(".preview-before");
  const toolShowBefore = document.getElementById("tool-show-before");
  const toolShowAfter = document.getElementById("tool-show-after");
  const toolCenterSplit = document.getElementById("tool-center-split");
  const toolAutoSweep = document.getElementById("tool-auto-sweep");
  const toolMagicEraser = document.getElementById("tool-magic-eraser");
  const toolRestoreMode = document.getElementById("tool-restore-mode");
  const toolUndo = document.getElementById("tool-undo");
  const toolRedo = document.getElementById("tool-redo");
  const toolBrushSize = document.getElementById("tool-brush-size");
  const afterImg = document.getElementById("preview-after-img");
  const editCanvas = document.getElementById("preview-edit-canvas");
  const downloadTransparentLink = document.getElementById("download-transparent-link") || document.getElementById("tool-download-png");
  const statusUrl = frame.dataset.statusUrl || "";
  const streamUrl = frame.dataset.streamUrl || "";
  const resultUrl = frame.dataset.resultUrl || "";
  const processingLog = document.getElementById("processing-log");

  const fitFrameToViewport = (img) => {
    if (!img || !img.naturalWidth || !img.naturalHeight) return;
    const shell = frame.closest(".result-preview-shell");
    const card = frame.closest(".result-card-static") || frame.closest(".result-card");
    if (!shell) return;

    const ratio = img.naturalWidth / img.naturalHeight;
    const shellWidth = Math.max(260, shell.clientWidth - 6);
    const viewportHeight = window.innerHeight || 900;
    const viewportBottom = viewportHeight - 12;
    const cardTop = card ? card.getBoundingClientRect().top : frame.getBoundingClientRect().top;
    const cardMaxHeight = Math.max(280, viewportBottom - cardTop);

    let nonShellHeight = 0;
    if (card) {
      nonShellHeight = Array.from(card.children)
        .filter((el) => el !== shell)
        .reduce((sum, el) => sum + el.getBoundingClientRect().height, 0);
    }

    const shellChrome = Math.max(0, shell.offsetHeight - frame.offsetHeight);
    const maxHeight = Math.max(220, cardMaxHeight - nonShellHeight - shellChrome - 20);

    let width = shellWidth;
    let height = width / ratio;
    if (height > maxHeight) {
      height = maxHeight;
      width = height * ratio;
    }

    if (card) {
      card.classList.toggle("result-compact", maxHeight < 330 || cardMaxHeight < 640);
    }

    frame.style.width = `${Math.floor(Math.min(width, shellWidth))}px`;
    frame.style.height = `${Math.floor(height)}px`;
    frame.style.maxWidth = "100%";
  };

  const applyAspectRatio = (img) => {
    if (!img) return;
    const setFromNatural = () => {
      if (!img.naturalWidth || !img.naturalHeight) return;
      frame.style.setProperty("--preview-ratio", `${img.naturalWidth} / ${img.naturalHeight}`);
      fitFrameToViewport(img);
    };
    if (img.complete) setFromNatural();
    img.addEventListener("load", setFromNatural, { once: true });
    window.addEventListener("resize", () => fitFrameToViewport(img));
  };

  applyAspectRatio(beforeImg || processingSource);
  if (!slider) {
    if (!isReady && statusUrl && resultUrl) {
      const appendLog = (line) => {
        if (!processingLog) return;
        const current = processingLog.textContent ? `${processingLog.textContent}\n` : "";
        const lines = `${current}${line}`.split("\n").slice(-8);
        processingLog.textContent = lines.join("\n");
      };

      const stamp = () => {
        const d = new Date();
        const hh = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        const ss = String(d.getSeconds()).padStart(2, "0");
        return `${hh}:${mm}:${ss}`;
      };

      let pollTimer = null;
      let eventSource = null;
      let usingPolling = false;
      let lastStageKey = "";

      const stageText = (data) => {
        const stage = (data.stage || "").trim();
        const progress = Number.isFinite(Number(data.progress)) ? Number(data.progress) : null;
        if (stage && progress !== null) return `${stage} (${Math.max(0, Math.min(100, progress))}%)`;
        if (stage) return stage;
        return "";
      };

      const handleStatus = (data) => {
        const status = data.status || "queued";
        const currentStage = stageText(data);
        if (stateText) {
          if (status === "queued") stateText.textContent = currentStage || "Queued in worker...";
          if (status === "processing") stateText.textContent = currentStage || "Removing background...";
        }
        if (currentStage) {
          const stageKey = `${status}:${currentStage}`;
          if (stageKey !== lastStageKey) {
            appendLog(`[${stamp()}] [stage] ${currentStage}`);
            lastStageKey = stageKey;
          }
        }

        if (status === "done") {
          if (stateText) stateText.textContent = "Done. Opening preview...";
          appendLog(`[${stamp()}] [done] render complete`);
          window.location.replace(`${resultUrl}${window.location.search || ""}`);
          return true;
        }
        if (status === "failed") {
          if (stateText) stateText.textContent = data.error || "Processing failed.";
          appendLog(`[${stamp()}] [error] ${data.error || "processing failed"}`);
          return true;
        }
        return false;
      };

      const startPolling = async () => {
        usingPolling = true;
        try {
          const res = await fetch(statusUrl, { cache: "no-store" });
          let data = null;
          try {
            data = await res.json();
          } catch (e) {
            data = {};
          }
          if (res.status === 404) {
            const msg = data.error || "Job expired or not found. Please upload again.";
            if (stateText) stateText.textContent = msg;
            appendLog(`[${stamp()}] [expired] ${msg}`);
            return;
          }
          if (!res.ok) throw new Error("status request failed");
          if (handleStatus(data)) return;
        } catch (err) {
          appendLog(`[${stamp()}] [retry] waiting for status endpoint`);
        }
        pollTimer = window.setTimeout(startPolling, 1300);
      };

      const startSSE = () => {
        if (!streamUrl || typeof window.EventSource === "undefined") {
          startPolling();
          return;
        }
        eventSource = new EventSource(streamUrl);
        appendLog(`[${stamp()}] [stream] live connection open`);
        eventSource.onmessage = (event) => {
          let data = null;
          try {
            data = JSON.parse(event.data || "{}");
          } catch (e) {
            return;
          }
          if (handleStatus(data)) {
            eventSource.close();
          }
        };
        eventSource.onerror = () => {
          if (eventSource) eventSource.close();
          if (!usingPolling) {
            appendLog(`[${stamp()}] [stream] disconnected, switching to polling`);
            startPolling();
          }
        };
      };

      startSSE();
      window.addEventListener("beforeunload", () => {
        if (pollTimer) window.clearTimeout(pollTimer);
        if (eventSource) eventSource.close();
      });
    }
    return;
  }

  const clamp = (n) => Math.max(0, Math.min(100, Number(n)));
  const setPosition = (value) => {
    const pct = clamp(value);
    frame.style.setProperty("--split", String(pct));
    slider.value = String(pct);
  };

  const updateFromPointer = (clientX) => {
    const rect = frame.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPosition(pct);
  };

  slider.addEventListener("input", (e) => setPosition(e.target.value));

  let dragging = false;
  let interactive = !isReady;
  let eraserMode = false;
  let erasing = false;
  let eraseLastPoint = null;
  let editedBlobUrl = null;
  let brushSizePx = Number(toolBrushSize?.value || 22);
  let brushMode = "erase";
  const sourceCanvas = document.createElement("canvas");
  const sourceCtx = sourceCanvas.getContext("2d");
  const pristineCanvas = document.createElement("canvas");
  const pristineCtx = pristineCanvas.getContext("2d");
  const editCtx = editCanvas ? editCanvas.getContext("2d") : null;
  const editUndoStack = [];
  const editRedoStack = [];
  const HISTORY_LIMIT = 25;

  const pushEditHistory = () => {
    if (!sourceCanvas.width || !sourceCanvas.height) return;
    editUndoStack.push(sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height));
    if (editUndoStack.length > HISTORY_LIMIT) editUndoStack.shift();
    editRedoStack.length = 0;
  };

  const restoreFromHistory = (imageData) => {
    if (!imageData || !sourceCanvas.width || !sourceCanvas.height) return;
    sourceCtx.putImageData(imageData, 0, 0);
    renderEditCanvas();
    updateEditedDownload();
  };

  const renderEditCanvas = () => {
    if (!editCanvas || !editCtx || !sourceCanvas.width || !sourceCanvas.height) return;
    const rect = editCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.max(1, Math.floor(rect.width));
    const ch = Math.max(1, Math.floor(rect.height));
    editCanvas.width = Math.floor(cw * dpr);
    editCanvas.height = Math.floor(ch * dpr);
    editCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    editCtx.clearRect(0, 0, cw, ch);
    const scale = Math.min(cw / sourceCanvas.width, ch / sourceCanvas.height);
    const drawW = sourceCanvas.width * scale;
    const drawH = sourceCanvas.height * scale;
    const offsetX = (cw - drawW) / 2;
    const offsetY = (ch - drawH) / 2;
    editCtx.drawImage(sourceCanvas, 0, 0, sourceCanvas.width, sourceCanvas.height, offsetX, offsetY, drawW, drawH);
  };

  const canvasClientToSource = (clientX, clientY) => {
    if (!editCanvas || !sourceCanvas.width || !sourceCanvas.height) return null;
    const rect = editCanvas.getBoundingClientRect();
    const cw = Math.max(1, rect.width);
    const ch = Math.max(1, rect.height);
    const scale = Math.min(cw / sourceCanvas.width, ch / sourceCanvas.height);
    const drawW = sourceCanvas.width * scale;
    const drawH = sourceCanvas.height * scale;
    const offsetX = (cw - drawW) / 2;
    const offsetY = (ch - drawH) / 2;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < offsetX || y < offsetY || x > offsetX + drawW || y > offsetY + drawH) return null;
    return {
      x: (x - offsetX) / scale,
      y: (y - offsetY) / scale,
      scale,
    };
  };

  const eraseAtSourcePoint = (p) => {
    if (!p || !sourceCtx || !pristineCtx) return;
    const radius = brushSizePx / Math.max(0.001, p.scale);
    sourceCtx.save();
    sourceCtx.beginPath();
    sourceCtx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    sourceCtx.clip();
    if (brushMode === "restore") {
      sourceCtx.globalCompositeOperation = "source-over";
      sourceCtx.drawImage(pristineCanvas, 0, 0);
    } else {
      sourceCtx.globalCompositeOperation = "destination-out";
      sourceCtx.fillRect(p.x - radius - 2, p.y - radius - 2, radius * 2 + 4, radius * 2 + 4);
    }
    sourceCtx.restore();
  };

  const eraseStroke = (from, to) => {
    if (!from || !to) return;
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const step = Math.max(1, brushSizePx * 0.35);
    const steps = Math.max(1, Math.ceil(distance / step));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const p = {
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
        scale: from.scale,
      };
      eraseAtSourcePoint(p);
    }
  };

  const updateEditedDownload = () => {
    if (!downloadTransparentLink || !sourceCanvas.width) return;
    sourceCanvas.toBlob((blob) => {
      if (!blob) return;
      if (editedBlobUrl) URL.revokeObjectURL(editedBlobUrl);
      editedBlobUrl = URL.createObjectURL(blob);
      downloadTransparentLink.href = editedBlobUrl;
      downloadTransparentLink.download = "output-edited.png";
    }, "image/png");
  };
  window.addEventListener("beforeunload", () => {
    if (editedBlobUrl) URL.revokeObjectURL(editedBlobUrl);
  });

  const initEditSource = () => {
    if (!afterImg || !sourceCtx) return;
    const load = () => {
      if (!afterImg.naturalWidth || !afterImg.naturalHeight) return;
      sourceCanvas.width = afterImg.naturalWidth;
      sourceCanvas.height = afterImg.naturalHeight;
      pristineCanvas.width = afterImg.naturalWidth;
      pristineCanvas.height = afterImg.naturalHeight;
      sourceCtx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
      sourceCtx.drawImage(afterImg, 0, 0);
      pristineCtx.clearRect(0, 0, pristineCanvas.width, pristineCanvas.height);
      pristineCtx.drawImage(afterImg, 0, 0);
      editUndoStack.length = 0;
      editRedoStack.length = 0;
      renderEditCanvas();
    };
    if (afterImg.complete && afterImg.naturalWidth) load();
    afterImg.addEventListener("load", load);
  };

  initEditSource();
  window.addEventListener("resize", renderEditCanvas);

  frame.addEventListener("pointerdown", (e) => {
    if (eraserMode) return;
    if (!interactive) return;
    dragging = true;
    frame.classList.add("dragging");
    frame.setPointerCapture(e.pointerId);
    updateFromPointer(e.clientX);
  });
  frame.addEventListener("pointermove", (e) => {
    if (eraserMode) return;
    if (!dragging) return;
    updateFromPointer(e.clientX);
  });
  const endDrag = () => {
    dragging = false;
    frame.classList.remove("dragging");
  };
  frame.addEventListener("pointerup", endDrag);
  frame.addEventListener("pointercancel", endDrag);
  frame.addEventListener("lostpointercapture", endDrag);

  const animateSplit = (from, to, durationMs, done) => {
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const value = from + (to - from) * eased;
      setPosition(value);
      if (t < 1) {
        requestAnimationFrame(step);
      } else if (done) {
        done();
      }
    };
    requestAnimationFrame(step);
  };

  const runReveal = () => {
    if (!isReady) {
      setPosition(slider.value || 52);
      return;
    }

    slider.disabled = true;
    setPosition(0);
    if (stateText) stateText.textContent = "Scanning edges...";

    animateSplit(0, 100, 1300, () => {
      if (stateText) stateText.textContent = "Finalizing mask...";
      animateSplit(100, 52, 900, () => {
        interactive = true;
        slider.disabled = false;
        if (stateText) stateText.textContent = "Drag slider to compare";
      });
    });
  };

  runReveal();

  let sweepRaf = null;
  const stopSweep = () => {
    if (sweepRaf) cancelAnimationFrame(sweepRaf);
    sweepRaf = null;
  };
  const startSweep = () => {
    stopSweep();
    let direction = 1;
    let value = Number(slider?.value || 52);
    const tick = () => {
      value += direction * 0.75;
      if (value >= 100) {
        value = 100;
        direction = -1;
      } else if (value <= 0) {
        value = 0;
        direction = 1;
      }
      setPosition(value);
      sweepRaf = requestAnimationFrame(tick);
    };
    sweepRaf = requestAnimationFrame(tick);
  };

  toolShowBefore?.addEventListener("click", () => {
    stopSweep();
    setPosition(0);
  });
  toolShowAfter?.addEventListener("click", () => {
    stopSweep();
    setPosition(100);
  });
  toolCenterSplit?.addEventListener("click", () => {
    stopSweep();
    setPosition(52);
  });
  toolAutoSweep?.addEventListener("click", () => {
    if (sweepRaf) {
      stopSweep();
      return;
    }
    startSweep();
  });
  toolMagicEraser?.addEventListener("click", () => {
    eraserMode = !eraserMode;
    frame.classList.toggle("eraser-active", eraserMode);
    toolMagicEraser.classList.toggle("is-active", eraserMode);
    if (eraserMode) {
      stopSweep();
      setPosition(100);
    }
    if (stateText) {
      stateText.textContent = eraserMode
        ? "Magic Eraser enabled. Draw on the result area."
        : "Drag slider to compare";
    }
  });
  toolRestoreMode?.addEventListener("click", () => {
    brushMode = brushMode === "restore" ? "erase" : "restore";
    toolRestoreMode.classList.toggle("is-active", brushMode === "restore");
    if (stateText && eraserMode) {
      stateText.textContent = brushMode === "restore"
        ? "Restore mode enabled. Paint to recover removed area."
        : "Magic Eraser enabled. Draw on the result area.";
    }
  });
  toolBrushSize?.addEventListener("input", () => {
    brushSizePx = Number(toolBrushSize.value || 22);
  });
  toolUndo?.addEventListener("click", () => {
    if (!editUndoStack.length) return;
    editRedoStack.push(sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height));
    const prev = editUndoStack.pop();
    restoreFromHistory(prev);
  });
  toolRedo?.addEventListener("click", () => {
    if (!editRedoStack.length) return;
    editUndoStack.push(sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height));
    const next = editRedoStack.pop();
    restoreFromHistory(next);
  });

  editCanvas?.addEventListener("pointerdown", (e) => {
    if (!eraserMode) return;
    e.preventDefault();
    const p = canvasClientToSource(e.clientX, e.clientY);
    if (!p) return;
    pushEditHistory();
    erasing = true;
    eraseLastPoint = p;
    eraseAtSourcePoint(p);
    renderEditCanvas();
    editCanvas.setPointerCapture(e.pointerId);
  });

  editCanvas?.addEventListener("pointermove", (e) => {
    if (!eraserMode || !erasing) return;
    e.preventDefault();
    const p = canvasClientToSource(e.clientX, e.clientY);
    if (!p || !eraseLastPoint) return;
    eraseStroke(eraseLastPoint, p);
    eraseLastPoint = p;
    renderEditCanvas();
  });

  const finishErase = () => {
    if (!erasing) return;
    erasing = false;
    eraseLastPoint = null;
    updateEditedDownload();
  };
  editCanvas?.addEventListener("pointerup", finishErase);
  editCanvas?.addEventListener("pointercancel", finishErase);
  editCanvas?.addEventListener("lostpointercapture", finishErase);

  const setupEdgeEditor = () => {
    const openBtn = document.getElementById("open-editor");
    const modal = document.getElementById("edge-editor-modal");
    const closeBtn = document.getElementById("close-editor");
    const saveBtn = document.getElementById("save-edit-btn");
    const statusEl = document.getElementById("editor-status");
    const wrap = document.getElementById("editor-canvas-wrap");
    const canvas = document.getElementById("edge-editor-canvas");
    const brushCanvas = document.getElementById("brush-preview-canvas");
    const beforeLayer = document.getElementById("editor-before-img");
    const afterPreview = document.getElementById("preview-after-img");
    const downloadTransparent = document.getElementById("download-transparent-link");
    const downloadSolid = document.getElementById("download-solid-link");
    const toolButtons = Array.from(document.querySelectorAll(".tool-btn[data-tool]"));
    const sizeInput = document.getElementById("brush-size");
    const hardnessInput = document.getElementById("brush-hardness");
    const featherInput = document.getElementById("brush-feather");
    const undoBtn = document.getElementById("undo-btn");
    const redoBtn = document.getElementById("redo-btn");
    const toggleBeforeBtn = document.getElementById("toggle-before");
    const zoomInBtn = document.getElementById("zoom-in");
    const zoomOutBtn = document.getElementById("zoom-out");
    const zoomResetBtn = document.getElementById("zoom-reset");
    const dock = document.getElementById("result-tool-dock");
    if (
      !openBtn ||
      !modal ||
      !closeBtn ||
      !saveBtn ||
      !wrap ||
      !canvas ||
      !brushCanvas ||
      !beforeLayer ||
      !afterPreview
    ) {
      return;
    }

    const getCookie = (name) => {
      const cookies = document.cookie ? document.cookie.split(";") : [];
      for (const raw of cookies) {
        const item = raw.trim();
        if (item.startsWith(`${name}=`)) return decodeURIComponent(item.slice(name.length + 1));
      }
      return "";
    };

    const setEditorStatus = (text) => {
      if (statusEl) statusEl.textContent = text;
    };

    const dpr = () => window.devicePixelRatio || 1;
    const ctx = canvas.getContext("2d");
    const brushCtx = brushCanvas.getContext("2d");
    const sourceCanvas = document.createElement("canvas");
    const sourceCtx = sourceCanvas.getContext("2d");
    let sourceImage = null;
    let baseAlpha = null;
    let tool = "erase";
    let brushSize = Number(sizeInput?.value || 28);
    let hardness = Number(hardnessInput?.value || 70);
    let feather = Number(featherInput?.value || 20);
    let zoom = 1;
    let panX = 0;
    let panY = 0;
    let isDrawing = false;
    let isPanning = false;
    let lastPoint = null;
    let hoverPoint = null;
    let undoStack = [];
    let redoStack = [];

    const pushHistory = () => {
      if (!sourceCanvas.width || !sourceCanvas.height) return;
      undoStack.push(sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height));
      if (undoStack.length > 30) undoStack.shift();
      redoStack = [];
    };

    const updateCanvasResolution = () => {
      const rect = wrap.getBoundingClientRect();
      const scale = dpr();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(w * scale);
      canvas.height = Math.floor(h * scale);
      brushCanvas.width = Math.floor(w * scale);
      brushCanvas.height = Math.floor(h * scale);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      brushCtx.setTransform(scale, 0, 0, scale, 0, 0);
      render();
      drawBrushCursor();
    };

    const getFitMetrics = () => {
      const rect = wrap.getBoundingClientRect();
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      const fitScale = Math.min(w / sourceCanvas.width, h / sourceCanvas.height);
      const drawScale = fitScale * zoom;
      const drawW = sourceCanvas.width * drawScale;
      const drawH = sourceCanvas.height * drawScale;
      const baseX = (w - drawW) / 2 + panX;
      const baseY = (h - drawH) / 2 + panY;
      return { w, h, fitScale, drawScale, drawW, drawH, baseX, baseY };
    };

    const screenToImage = (clientX, clientY) => {
      const rect = wrap.getBoundingClientRect();
      const { drawScale, baseX, baseY } = getFitMetrics();
      return {
        x: (clientX - rect.left - baseX) / drawScale,
        y: (clientY - rect.top - baseY) / drawScale,
      };
    };

    const render = () => {
      if (!sourceCanvas.width || !sourceCanvas.height) return;
      const { w, h, drawW, drawH, baseX, baseY } = getFitMetrics();
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(sourceCanvas, 0, 0, sourceCanvas.width, sourceCanvas.height, baseX, baseY, drawW, drawH);
    };

    const drawBrushCursor = () => {
      const rect = wrap.getBoundingClientRect();
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      brushCtx.clearRect(0, 0, w, h);
      if (!hoverPoint || tool === "pan") return;
      const { drawScale, baseX, baseY } = getFitMetrics();
      const cx = baseX + hoverPoint.x * drawScale;
      const cy = baseY + hoverPoint.y * drawScale;
      const outer = (brushSize + feather) * drawScale;
      const inner = Math.max(1, brushSize * drawScale);
      brushCtx.strokeStyle = "rgba(127,255,249,0.9)";
      brushCtx.lineWidth = 1;
      brushCtx.beginPath();
      brushCtx.arc(cx, cy, inner, 0, Math.PI * 2);
      brushCtx.stroke();
      if (feather > 0) {
        brushCtx.strokeStyle = "rgba(127,255,249,0.35)";
        brushCtx.beginPath();
        brushCtx.arc(cx, cy, outer, 0, Math.PI * 2);
        brushCtx.stroke();
      }
    };

    const brushStrength = (dist, r, f, hard) => {
      const outer = r + f;
      if (dist > outer) return 0;
      let t = 1 - dist / Math.max(1, outer);
      const hardPow = 1 + (100 - hard) / 25;
      t = Math.pow(t, hardPow);
      if (dist > r && f > 0) t *= (outer - dist) / f;
      return Math.max(0, Math.min(1, t));
    };

    const applyBrushAt = (ix, iy) => {
      if (!sourceCanvas.width || !sourceCanvas.height || !baseAlpha) return;
      const r = brushSize;
      const f = feather;
      const x0 = Math.max(0, Math.floor(ix - (r + f)));
      const y0 = Math.max(0, Math.floor(iy - (r + f)));
      const x1 = Math.min(sourceCanvas.width - 1, Math.ceil(ix + (r + f)));
      const y1 = Math.min(sourceCanvas.height - 1, Math.ceil(iy + (r + f)));
      const w = x1 - x0 + 1;
      const h = y1 - y0 + 1;
      if (w <= 0 || h <= 0) return;

      const patch = sourceCtx.getImageData(x0, y0, w, h);
      const data = patch.data;
      for (let py = 0; py < h; py += 1) {
        for (let px = 0; px < w; px += 1) {
          const gx = x0 + px;
          const gy = y0 + py;
          const dx = gx - ix;
          const dy = gy - iy;
          const dist = Math.hypot(dx, dy);
          const s = brushStrength(dist, r, f, hardness);
          if (s <= 0) continue;
          const idx = (py * w + px) * 4 + 3;
          const baseIdx = (gy * sourceCanvas.width + gx) * 4 + 3;
          const currentAlpha = data[idx];
          if (tool === "erase") {
            data[idx] = Math.max(0, Math.round(currentAlpha * (1 - s)));
          } else if (tool === "restore") {
            data[idx] = Math.min(255, Math.round(currentAlpha + (baseAlpha[baseIdx] - currentAlpha) * s));
          }
        }
      }
      sourceCtx.putImageData(patch, x0, y0);
    };

    const drawSegment = (a, b) => {
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      const step = Math.max(1, brushSize * 0.22);
      const count = Math.max(1, Math.ceil(distance / step));
      for (let i = 0; i <= count; i += 1) {
        const t = i / count;
        applyBrushAt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
      }
      render();
    };

    const setTool = (name) => {
      tool = name;
      toolButtons.forEach((btn) => btn.classList.toggle("is-active", btn.dataset.tool === name));
      wrap.style.cursor = name === "pan" ? "grab" : "crosshair";
    };

    const zoomBy = (delta) => {
      zoom = Math.max(0.35, Math.min(6, zoom + delta));
      render();
      drawBrushCursor();
    };

    const resetView = () => {
      zoom = 1;
      panX = 0;
      panY = 0;
      render();
      drawBrushCursor();
    };

    const undo = () => {
      if (!undoStack.length) return;
      redoStack.push(sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height));
      const state = undoStack.pop();
      sourceCtx.putImageData(state, 0, 0);
      render();
    };

    const redo = () => {
      if (!redoStack.length) return;
      undoStack.push(sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height));
      const state = redoStack.pop();
      sourceCtx.putImageData(state, 0, 0);
      render();
    };

    const loadEditorImage = () => {
      const finalizeFromImage = (img) => {
        if (!img || !img.naturalWidth || !img.naturalHeight) {
          setEditorStatus("Image not ready yet. Close and reopen editor.");
          return;
        }
        sourceCanvas.width = img.naturalWidth;
        sourceCanvas.height = img.naturalHeight;
        sourceCtx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
        sourceCtx.drawImage(img, 0, 0);
        baseAlpha = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height).data.slice();
        undoStack = [];
        redoStack = [];
        beforeLayer.src = beforeImg ? beforeImg.src : beforeLayer.src;
        updateCanvasResolution();
        setEditorStatus("Use Magic Eraser for edge cleanup.");
      };

      const src = (afterPreview.src || "").trim();
      if (!src) {
        setEditorStatus("Result image not found.");
        return;
      }

      setEditorStatus("Loading image...");
      if (afterPreview.complete && afterPreview.naturalWidth > 0) {
        finalizeFromImage(afterPreview);
        return;
      }

      sourceImage = new Image();
      sourceImage.onload = () => finalizeFromImage(sourceImage);
      sourceImage.onerror = () => {
        setEditorStatus("Could not load result image.");
      };
      sourceImage.src = src;
    };

    const openEditor = () => {
      modal.hidden = false;
      document.body.style.overflow = "hidden";
      loadEditorImage();
    };

    const closeEditor = () => {
      modal.hidden = true;
      document.body.style.overflow = "";
      wrap.classList.remove("show-before");
    };

    openBtn.addEventListener("click", openEditor);
    closeBtn.addEventListener("click", closeEditor);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeEditor();
    });

    toolButtons.forEach((btn) => {
      btn.addEventListener("click", () => setTool(btn.dataset.tool || "erase"));
    });

    sizeInput?.addEventListener("input", () => {
      brushSize = Number(sizeInput.value);
      drawBrushCursor();
    });
    hardnessInput?.addEventListener("input", () => {
      hardness = Number(hardnessInput.value);
    });
    featherInput?.addEventListener("input", () => {
      feather = Number(featherInput.value);
      drawBrushCursor();
    });

    zoomInBtn?.addEventListener("click", () => zoomBy(0.2));
    zoomOutBtn?.addEventListener("click", () => zoomBy(-0.2));
    zoomResetBtn?.addEventListener("click", resetView);
    undoBtn?.addEventListener("click", undo);
    redoBtn?.addEventListener("click", redo);
    toggleBeforeBtn?.addEventListener("click", () => {
      wrap.classList.toggle("show-before");
    });

    wrap.addEventListener("wheel", (e) => {
      e.preventDefault();
      zoomBy(e.deltaY > 0 ? -0.1 : 0.1);
    });

    wrap.addEventListener("pointerdown", (e) => {
      const p = screenToImage(e.clientX, e.clientY);
      hoverPoint = p;
      if (tool === "pan") {
        isPanning = true;
        wrap.style.cursor = "grabbing";
        lastPoint = { x: e.clientX, y: e.clientY };
        return;
      }
      isDrawing = true;
      lastPoint = p;
      pushHistory();
      applyBrushAt(p.x, p.y);
      render();
      drawBrushCursor();
    });

    wrap.addEventListener("pointermove", (e) => {
      const p = screenToImage(e.clientX, e.clientY);
      hoverPoint = p;
      if (isPanning && lastPoint) {
        panX += e.clientX - lastPoint.x;
        panY += e.clientY - lastPoint.y;
        lastPoint = { x: e.clientX, y: e.clientY };
        render();
        drawBrushCursor();
        return;
      }
      if (!isDrawing || tool === "pan" || !lastPoint) {
        drawBrushCursor();
        return;
      }
      drawSegment(lastPoint, p);
      lastPoint = p;
      drawBrushCursor();
    });

    const endPointer = () => {
      if (isPanning) wrap.style.cursor = tool === "pan" ? "grab" : "crosshair";
      isDrawing = false;
      isPanning = false;
      lastPoint = null;
    };
    wrap.addEventListener("pointerup", endPointer);
    wrap.addEventListener("pointerleave", () => {
      hoverPoint = null;
      drawBrushCursor();
      endPointer();
    });
    wrap.addEventListener("pointercancel", endPointer);

    saveBtn.addEventListener("click", async () => {
      if (!sourceCanvas.width || !sourceCanvas.height) return;
      const saveUrl = saveBtn.dataset.saveUrl;
      if (!saveUrl) return;
      setEditorStatus("Saving edits...");
      saveBtn.disabled = true;
      try {
        const blob = await new Promise((resolve) => sourceCanvas.toBlob(resolve, "image/png"));
        if (!blob) throw new Error("No image blob");
        const form = new FormData();
        form.append("edited_image", blob, "edited.png");
        const res = await fetch(saveUrl, {
          method: "POST",
          headers: { "X-CSRFToken": getCookie("csrftoken") },
          body: form,
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setEditorStatus(data.error || "Could not save edits.");
          saveBtn.disabled = false;
          return;
        }
        if (data.after_url) {
          afterPreview.src = data.after_url;
        }
        if (downloadTransparent && data.download_transparent_url) {
          downloadTransparent.href = data.download_transparent_url;
        }
        if (downloadSolid && data.download_solid_url) {
          downloadSolid.href = data.download_solid_url;
        }
        setEditorStatus("Saved.");
        if (stateText) stateText.textContent = "Edited. Drag slider to compare";
        closeEditor();
      } catch (err) {
        setEditorStatus("Could not save edits.");
      } finally {
        saveBtn.disabled = false;
      }
    });

    window.addEventListener("resize", () => {
      if (!modal.hidden) updateCanvasResolution();
    });

    if (dock) {
      const dockOpen = document.getElementById("dock-open-editor");
      dockOpen?.addEventListener("click", openEditor);

      dock.querySelectorAll(".dock-btn[data-forward]").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (modal.hidden) openEditor();
          const target = document.querySelector(btn.getAttribute("data-forward") || "");
          if (target) target.click();
        });
      });
    }
  };

  setupEdgeEditor();
})();
