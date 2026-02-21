(() => {
  const form = document.getElementById("upload-form");
  if (!form) return;

  const progress = document.getElementById("progress");
  const progressFill = document.getElementById("progress-fill");
  const progressText = document.getElementById("progress-text");
  const resultCard = document.getElementById("result-card");
  const resultTerminal = document.getElementById("result-terminal");
  const terminalBody = document.getElementById("terminal-body");
  const terminalStatus = document.getElementById("terminal-status");
  const compareLine = document.getElementById("result-compare-line");
  const compareOverlay = document.getElementById("result-slider-overlay");
  const compareSlider = document.getElementById("compare-slider");
  const resultActions = document.getElementById("result-actions");
  const beforeImg = document.getElementById("before-img");
  const afterImg = document.getElementById("after-img");
  const downloadTransparent = document.getElementById("download-transparent");
  const downloadSolid = document.getElementById("download-solid");
  const bgColor = document.getElementById("bg-color");
  const bgColorValue = document.getElementById("bg-color-value");
  const fileInput = document.getElementById("image-input");
  const fileDrop = document.querySelector(".file-drop");
  const fileName = document.getElementById("file-name");
  const fileSize = document.getElementById("file-size");
  const fileThumb = document.getElementById("file-thumb");
  const fileClear = document.getElementById("file-clear");
  const range = document.getElementById("range");

  let previewObjectUrl = null;
  let progressFloor = 0;
  let progressTick = null;
  let terminalLines = [];

  const setProgress = (value, label) => {
    if (progressFill) progressFill.style.width = `${Math.max(0, Math.min(100, value))}%`;
    if (progressText) progressText.textContent = label;
  };

  const showProgress = () => {
    progress.classList.remove("hidden");
  };

  const hideProgress = () => {
    progress.classList.add("hidden");
  };

  const startProgressTick = () => {
    stopProgressTick();
    progressTick = window.setInterval(() => {
      const current = parseFloat((progressFill && progressFill.style.width) || "0");
      if (current < progressFloor) {
        setProgress(progressFloor, progressText ? progressText.textContent : "");
        return;
      }
      if (current < 95) {
        setProgress(current + 1, progressText ? progressText.textContent : "");
      }
    }, 600);
  };

  const stopProgressTick = () => {
    if (progressTick) {
      clearInterval(progressTick);
      progressTick = null;
    }
  };

  const setComparePosition = (value) => {
    const pct = Math.max(0, Math.min(100, Number(value)));
    const split = 100 - pct;
    const afterWrap = document.querySelector(".after-wrap");
    if (afterWrap) afterWrap.style.clipPath = `inset(0 0 0 ${split}%)`;
    if (compareLine) compareLine.style.left = `${split}%`;
  };

  const hideResult = () => {
    if (!resultCard) return;
    resultCard.classList.add("hidden");
    if (resultActions) {
      resultActions.classList.add("hidden");
    }
    if (resultTerminal) resultTerminal.classList.add("hidden");
    if (compareSlider) {
      compareSlider.classList.add("hidden", "preview-hidden");
    }
  };

  const animateCompareToCenter = (durationMs = 1200) => {
    const start = performance.now();
    const from = 100;
    const to = 50;
    const step = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = from + (to - from) * eased;
      setComparePosition(value);
      if (compareOverlay) compareOverlay.value = String(value);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const showProcessingTerminal = () => {
    if (!resultCard) return;
    resultCard.classList.remove("hidden");
    if (resultTerminal) resultTerminal.classList.remove("hidden");
    if (compareSlider) compareSlider.classList.add("hidden", "preview-hidden");
    if (resultActions) resultActions.classList.add("hidden");
  };

  const showResult = () => {
    if (!resultCard) return;
    resultCard.classList.remove("hidden");
    if (resultTerminal) resultTerminal.classList.add("hidden");
    if (compareSlider) {
      compareSlider.classList.remove("hidden");
      compareSlider.classList.remove("preview-hidden");
    }
  };

  const syncSliderAspectRatio = () => {
    if (!compareSlider || !beforeImg) return;
    if (beforeImg.naturalWidth > 0 && beforeImg.naturalHeight > 0) {
      compareSlider.style.aspectRatio = `${beforeImg.naturalWidth} / ${beforeImg.naturalHeight}`;
    }
  };

  const showDownloadActions = () => {
    if (resultActions) resultActions.classList.remove("hidden");
  };

  const waitForImageReady = (img) =>
    new Promise((resolve) => {
      if (!img) return resolve();
      if (img.complete && img.naturalWidth > 0) return resolve();
      const done = () => {
        img.removeEventListener("load", done);
        img.removeEventListener("error", done);
        resolve();
      };
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
    });

  const waitForPreviewImages = async () => {
    // Prevent indefinite waits on slow networks.
    const timeout = new Promise((resolve) => setTimeout(resolve, 1500));
    await Promise.race([
      Promise.all([waitForImageReady(beforeImg), waitForImageReady(afterImg)]),
      timeout,
    ]);
  };

  const setTerminalStatus = (status) => {
    if (terminalStatus) terminalStatus.textContent = status;
  };

  const pushTerminalLine = (line) => {
    terminalLines.push(line);
    if (terminalLines.length > 14) terminalLines = terminalLines.slice(-14);
    if (terminalBody) terminalBody.textContent = terminalLines.join("\n");
  };

  const resetTerminal = () => {
    terminalLines = [];
    setTerminalStatus("Idle");
    pushTerminalLine("Waiting for your image...");
  };

  const formatSize = (bytes) => {
    if (!bytes && bytes !== 0) return "";
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) return `${mb.toFixed(2)} MB`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  const setFilePreview = (file) => {
    if (!file) {
      if (fileName) {
        fileName.textContent = "No file selected";
        fileName.removeAttribute("title");
      }
      if (fileSize) fileSize.textContent = "PNG / JPG / WEBP up to 15MB";
      if (fileThumb) fileThumb.style.backgroundImage = "";
      if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = null;
      }
      hideProgress();
      hideResult();
      setProgress(0, "Waiting for file...");
      resetTerminal();
      return;
    }

    if (fileName) {
      fileName.textContent = file.name;
      fileName.title = file.name;
    }
    if (fileSize) fileSize.textContent = `${formatSize(file.size)} · ${file.type || "image"}`;
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = URL.createObjectURL(file);
    if (fileThumb) fileThumb.style.backgroundImage = `url('${previewObjectUrl}')`;

    showProgress();
    setProgress(12, "Loading file...");
    showProcessingTerminal();
    setTerminalStatus("Ready");
    pushTerminalLine(`Image selected: ${file.name}`);
    pushTerminalLine("Ready when you click Remove background.");
  };

  const getCookie = (name) => {
    let value = null;
    if (document.cookie && document.cookie !== "") {
      const cookies = document.cookie.split(";");
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i].trim();
        if (cookie.substring(0, name.length + 1) === `${name}=`) {
          value = decodeURIComponent(cookie.substring(name.length + 1));
          break;
        }
      }
    }
    return value;
  };

  const pollStatus = (jobId) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/process/status/${jobId}/`);
        const data = await res.json();

        if (data.status === "queued") {
          progressFloor = 55;
          setProgress(Math.max(55, parseFloat(progressFill.style.width || "0")), "Now working on it...");
          setTerminalStatus("Queued");
          pushTerminalLine("Upload received.");
          pushTerminalLine("Your image is in line for processing.");
        }

        if (data.status === "processing") {
          progressFloor = 78;
          setProgress(Math.max(78, parseFloat(progressFill.style.width || "0")), "Processing...");
          setTerminalStatus("Processing");
          pushTerminalLine("Removing the background...");
          pushTerminalLine("Refining edges for a cleaner cut.");
          pushTerminalLine("Final touches in progress.");
        }

        if (data.status === "done") {
          clearInterval(interval);
          stopProgressTick();
          setProgress(100, "Ready to show");
          setTerminalStatus("Complete");
          pushTerminalLine("Done. Your image is ready.");
          pushTerminalLine("Preview is loading.");
          if (beforeImg) beforeImg.src = data.before_url;
          if (afterImg) afterImg.src = data.after_url;
          if (downloadTransparent) downloadTransparent.href = `${data.download_url}?bg=transparent`;
          if (downloadSolid) downloadSolid.href = `${data.download_url}?bg=${encodeURIComponent(bgColor.value)}`;
          setComparePosition(100);
          if (compareOverlay) compareOverlay.value = "100";
          window.setTimeout(async () => {
            await waitForPreviewImages();
            syncSliderAspectRatio();
            showResult();
            showDownloadActions();
            animateCompareToCenter(1500);
          }, 450);
          window.setTimeout(hideProgress, 800);
          return;
        }

        if (data.status === "failed") {
          clearInterval(interval);
          stopProgressTick();
          setProgress(100, "Failed");
          setTerminalStatus("Failed");
          pushTerminalLine("We could not process this image.");
          alert(data.error || "Processing failed.");
        }
      } catch (err) {
        clearInterval(interval);
        stopProgressTick();
        setProgress(100, "Failed");
        setTerminalStatus("Failed");
        pushTerminalLine("Connection issue while checking progress.");
        alert("Could not fetch processing status.");
      }
    }, 700);
  };

  if (compareOverlay) {
    compareOverlay.addEventListener("input", (e) => {
      setComparePosition(e.target.value);
    });
    setComparePosition(compareOverlay.value);
  }

  if (range) {
    range.classList.add("hidden");
    range.setAttribute("aria-hidden", "true");
    range.tabIndex = -1;
  }

  if (fileInput) {
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      setFilePreview(file);
    });
  }

  if (fileClear && fileInput) {
    fileClear.addEventListener("click", () => {
      fileInput.value = "";
      setFilePreview(null);
    });
  }

  if (fileDrop) {
    fileDrop.addEventListener("dragover", (e) => {
      e.preventDefault();
      fileDrop.classList.add("dragover");
    });
    fileDrop.addEventListener("dragleave", () => fileDrop.classList.remove("dragover"));
    fileDrop.addEventListener("drop", (e) => {
      e.preventDefault();
      fileDrop.classList.remove("dragover");
      if (fileInput && e.dataTransfer.files && e.dataTransfer.files[0]) {
        fileInput.files = e.dataTransfer.files;
        setFilePreview(e.dataTransfer.files[0]);
      }
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const selectedFile = fileInput && fileInput.files ? fileInput.files[0] : null;
    if (!selectedFile) {
      alert("Select an image first.");
      return;
    }

    const formData = new FormData(form);
    formData.append("bg_color", bgColor.value);

    hideResult();
    showProgress();
    showProcessingTerminal();
    progressFloor = 30;
    setProgress(30, "Loading file...");
    setTerminalStatus("Uploading");
    pushTerminalLine("Uploading your image...");
    startProgressTick();

    try {
      const res = await fetch("/process/upload/", {
        method: "POST",
        headers: { "X-CSRFToken": getCookie("csrftoken") },
        body: formData,
      });
      const data = await res.json();
      if (data.job_id) {
        progressFloor = 50;
        setProgress(50, "Now working on it...");
        setTerminalStatus("Queued");
        pushTerminalLine("Upload complete.");
        pushTerminalLine("Starting background removal.");
        pollStatus(data.job_id);
      } else {
        stopProgressTick();
        setProgress(100, "Failed");
        setTerminalStatus("Failed");
        pushTerminalLine("Upload failed. Please try again.");
        alert(data.error || "Upload failed.");
      }
    } catch (err) {
      stopProgressTick();
      setProgress(100, "Failed");
      setTerminalStatus("Failed");
      pushTerminalLine("Upload failed due to a network issue.");
      alert("Upload failed.");
    }
  });

  if (bgColor && bgColorValue) {
    const updateColor = () => {
      bgColorValue.textContent = bgColor.value.toUpperCase();
    };
    updateColor();
    bgColor.addEventListener("input", updateColor);
  }

  hideProgress();
  hideResult();
  setProgress(0, "Waiting for file...");
  resetTerminal();
})();
