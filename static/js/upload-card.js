(() => {
  const form = document.getElementById("upload-form");
  const fileInput = document.getElementById("image-input");
  const fileDrop = document.querySelector(".file-drop");
  const statusEl = document.getElementById("upload-status");
  if (!form || !fileInput || !fileDrop) return;

  const isAuthenticated = form.dataset.authenticated === "1";
  const loginUrl = form.dataset.loginUrl || "/auth/login/";

  const setStatus = (text) => {
    if (statusEl) statusEl.textContent = text;
  };

  const getCookie = (name) => {
    if (!document.cookie) return null;
    const cookies = document.cookie.split(";");
    for (let i = 0; i < cookies.length; i += 1) {
      const cookie = cookies[i].trim();
      if (cookie.startsWith(`${name}=`)) {
        return decodeURIComponent(cookie.slice(name.length + 1));
      }
    }
    return null;
  };

  const redirectToLogin = () => {
    const next = `${window.location.pathname}${window.location.search}#upload`;
    window.location.href = `${loginUrl}?next=${encodeURIComponent(next)}`;
  };

  const uploadSelectedFile = async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    if (!isAuthenticated) {
      redirectToLogin();
      return;
    }

    const formData = new FormData();
    formData.append("image", file);

    setStatus("Uploading image...");
    try {
      const res = await fetch("/process/upload/", {
        method: "POST",
        headers: { "X-CSRFToken": getCookie("csrftoken") || "" },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          redirectToLogin();
          return;
        }
        setStatus(data.error || "Upload failed.");
        return;
      }
      if (data.job_id) {
        setStatus("Upload complete. Redirecting...");
        window.location.href = `/process/result/${data.job_id}/?bg=transparent`;
        return;
      }
      setStatus(data.error || "Upload failed.");
    } catch (err) {
      setStatus("Upload failed. Please try again.");
    }
  };

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    uploadSelectedFile();
  });

  fileInput.addEventListener("change", () => {
    uploadSelectedFile();
  });

  fileDrop.addEventListener("click", (e) => {
    if (isAuthenticated) return;
    e.preventDefault();
    redirectToLogin();
  });

  fileDrop.addEventListener("dragover", (e) => {
    e.preventDefault();
    fileDrop.classList.add("dragover");
  });

  fileDrop.addEventListener("dragleave", () => {
    fileDrop.classList.remove("dragover");
  });

  fileDrop.addEventListener("drop", (e) => {
    e.preventDefault();
    fileDrop.classList.remove("dragover");
    if (!isAuthenticated) {
      redirectToLogin();
      return;
    }
    if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files[0]) return;
    fileInput.files = e.dataTransfer.files;
    uploadSelectedFile();
  });
})();
