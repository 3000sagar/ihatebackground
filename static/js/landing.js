(() => {
  document.documentElement.classList.add("is-loaded");

  if (window.gsap) {
    gsap.from(".hero-copy", { y: 20, opacity: 0, duration: 1.2, ease: "power3.out" });
    gsap.from(".scan-frame", { scale: 0.96, opacity: 0, duration: 1.1, ease: "power3.out" });
    gsap.from(".hero-badges .badge", { y: 10, opacity: 0, duration: 0.9, stagger: 0.08, delay: 0.3, ease: "power3.out" });
    gsap.from(".hero-proof > div", { y: 8, opacity: 0, duration: 0.8, stagger: 0.1, delay: 0.35, ease: "power3.out" });
  }

  const slider = document.getElementById("hero-slider-overlay");
  const sliderTrack = document.getElementById("hero-slider-track");
  const after = document.querySelector(".scan-after");
  const handle = document.getElementById("hero-handle");
  const caption = document.getElementById("hero-caption");

  const hasHeroSlider = slider && after && handle;

  const setPosition = (value) => {
    after.style.width = `${value}%`;
    handle.style.left = `${value}%`;
  };

  if (hasHeroSlider) {
    slider.disabled = true;
    if (sliderTrack) {
      sliderTrack.disabled = true;
    }
    setPosition(0);
  }

  const sweep = (toValue, duration, delay = 0) =>
    new Promise((resolve) => {
      if (!window.gsap) {
        setPosition(toValue);
        return resolve();
      }
      gsap.to(
        { v: parseFloat(after.style.width) || 0 },
        {
          v: toValue,
          duration,
          delay,
          ease: "power2.inOut",
          onUpdate() {
            setPosition(this.targets()[0].v);
          },
          onComplete: resolve,
        }
      );
    });

  const runIntro = async () => {
    if (!hasHeroSlider) return;
    await sweep(100, 1.4, 0.2);
    await sweep(0, 1.2, 0.1);
    await sweep(100, 1.1, 0.1);
    await sweep(50, 0.8, 0.1);
    slider.disabled = false;
    if (sliderTrack) {
      sliderTrack.disabled = false;
    }
    if (caption) {
      caption.textContent = "Drag to compare";
    }
  };

  const revealItems = Array.from(document.querySelectorAll("[data-reveal]"));
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    revealItems.forEach((el) => observer.observe(el));
  } else {
    revealItems.forEach((el) => el.classList.add("is-visible"));
  }

  runIntro();

  if (hasHeroSlider) {
    const onInput = (e) => setPosition(e.target.value);
    slider.addEventListener("input", onInput);
    if (sliderTrack) {
      sliderTrack.addEventListener("input", (e) => {
        slider.value = e.target.value;
        setPosition(e.target.value);
      });
    }
  }

  const uploadCard = document.querySelector(".upload-card");
  const fileInput = document.getElementById("image-input");
  const fileClear = document.getElementById("file-clear");
  const fileDrop = document.querySelector(".file-drop");

  const setUploadActive = (isActive) => {
    if (!uploadCard) return;
    uploadCard.classList.toggle("is-active", isActive);
  };

  if (fileInput) {
    fileInput.addEventListener("change", () => {
      setUploadActive(Boolean(fileInput.files && fileInput.files.length));
    });
  }

  if (fileClear) {
    fileClear.addEventListener("click", () => {
      setUploadActive(false);
    });
  }

  if (fileDrop) {
    fileDrop.addEventListener("dragover", () => setUploadActive(true));
    fileDrop.addEventListener("dragleave", () => {
      if (!fileInput || !fileInput.files || !fileInput.files.length) {
        setUploadActive(false);
      }
    });
    fileDrop.addEventListener("drop", () => {
      setUploadActive(true);
    });
  }
})();
