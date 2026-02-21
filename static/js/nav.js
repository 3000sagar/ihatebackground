(() => {
  const button = document.querySelector(".mobile-menu-btn");
  const panel = document.getElementById("site-nav-panel");

  if (!button || !panel) return;

  const closeMenu = () => {
    button.setAttribute("aria-expanded", "false");
    panel.hidden = true;
  };

  const openMenu = () => {
    button.setAttribute("aria-expanded", "true");
    panel.hidden = false;
  };

  button.addEventListener("click", () => {
    const isOpen = button.getAttribute("aria-expanded") === "true";
    if (isOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  panel.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 680) {
      closeMenu();
    }
  });
})();
