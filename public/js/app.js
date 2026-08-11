/**
 * Lógica global de la aplicación
 * Maneja: Auth state, Navbar scroll, Theme toggle, Hamburger menu, Toasts
 */

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  setupNavbar();
  checkAuthState();
  setupHamburger();
  
  const expiredMsg = localStorage.getItem('sw_expired_msg');
  if (expiredMsg) {
    setTimeout(() => {
      if (window.app && window.app.showToast) {
        window.app.showToast(expiredMsg, true);
      }
    }, 500);
    localStorage.removeItem('sw_expired_msg');
  }
});

/* ═══════════════════════════════════════
   TEMA CLARO / OSCURO
═══════════════════════════════════════ */
function initTheme() {
  const saved = localStorage.getItem("sw_theme") || "dark";
  applyTheme(saved, false);
  // Actualizar ícono una vez el DOM esté listo
  const btn = document.getElementById("theme-toggle");
  if (btn)
    btn.innerHTML =
      saved === "light"
        ? '<i class="fa-solid fa-moon"></i>'
        : '<i class="fa-solid fa-sun"></i>';
}

function applyTheme(theme, save = true) {
  if (theme === "light") {
    document.documentElement.classList.add("light-mode");
  } else {
    document.documentElement.classList.remove("light-mode");
  }
  if (save) localStorage.setItem("sw_theme", theme);
  // Actualizar ícono del botón
  const btn = document.getElementById("theme-toggle");
  if (btn)
    btn.innerHTML =
      theme === "light"
        ? '<i class="fa-solid fa-moon"></i>'
        : '<i class="fa-solid fa-sun"></i>';

  // Cambiar logo
  const logos = document.querySelectorAll(
    'img[src*="logo blanco.png"], img[src*="logo negro.png"]',
  );
  logos.forEach((img) => {
    img.src =
      theme === "light" ? "/img/logo negro.png" : "/img/logo blanco.png";
  });
}

function toggleTheme() {
  const current = localStorage.getItem("sw_theme") || "dark";
  applyTheme(current === "dark" ? "light" : "dark");
}

/* ═══════════════════════════════════════
   NAVBAR SCROLL
═══════════════════════════════════════ */
function setupNavbar() {
  const nav = document.querySelector(".sw-nav");
  if (!nav) return;

  // Siempre scrolled si la clase ya está presente (páginas internas)
  if (nav.classList.contains("scrolled")) return;

  function onScroll() {
    if (window.scrollY > 20) nav.classList.add("scrolled");
    else nav.classList.remove("scrolled");
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

/* ═══════════════════════════════════════
   HAMBURGUESA
═══════════════════════════════════════ */
function setupHamburger() {
  const hamburger = document.getElementById("sw-hamburger");
  const links = document.querySelector(".sw-nav__links");
  if (!hamburger || !links) return;

  hamburger.addEventListener("click", () => {
    const isOpen = links.classList.toggle("open");
    hamburger.classList.toggle("open", isOpen);
    hamburger.setAttribute("aria-expanded", isOpen);
  });

  // Cerrar al hacer click en un link
  links.querySelectorAll(".sw-nav__link").forEach((link) => {
    link.addEventListener("click", () => {
      links.classList.remove("open");
      hamburger.classList.remove("open");
    });
  });

  // Cerrar al hacer click fuera
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".sw-nav")) {
      links.classList.remove("open");
      hamburger.classList.remove("open");
    }
  });
}

/* ═══════════════════════════════════════
   AUTH STATE
═══════════════════════════════════════ */
function checkAuthState() {
  const token = localStorage.getItem("sw_token");
  const userStr = localStorage.getItem("sw_user");

  const guestLinks = document.querySelectorAll(".guest-only");
  const authLinks = document.querySelectorAll(".auth-only");
  const adminLinks = document.querySelectorAll(".admin-only");

  if (token && userStr) {
    // Validar expiración del token activamente
    try {
      let payloadBase64 = token.split('.')[1];
      // Convertir Base64Url a Base64 estándar
      payloadBase64 = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
      const pad = payloadBase64.length % 4;
      if (pad) {
        payloadBase64 += '='.repeat(4 - pad);
      }
      
      const decodedJson = atob(payloadBase64);
      const decoded = JSON.parse(decodedJson);
      
      console.log(`[AUTH] Inicio de sesión analizado para: ${decoded.email || decoded.id} | Expira: ${new Date(decoded.exp * 1000).toLocaleString()}`);

      if (decoded.exp && (Date.now() >= decoded.exp * 1000)) {
        console.warn(`[AUTH] Sesión expirada detectada. Expiró el: ${new Date(decoded.exp * 1000).toLocaleString()}`);
        logout(true);
        return;
      }
    } catch (e) {
      console.error('[AUTH] Token inválido o corrupto:', e);
      logout(true);
      return;
    }

    let user;
    try {
      user = JSON.parse(userStr);
    } catch (_) {
      return;
    }

    guestLinks.forEach((el) => (el.style.display = "none"));
    authLinks.forEach((el) => (el.style.display = "inline-flex"));

    if (user.role === "admin" || user.role === "ceo") {
      adminLinks.forEach((el) => (el.style.display = "inline-flex"));
    } else {
      adminLinks.forEach((el) => (el.style.display = "none"));
    }

    // Verificar si el usuario aceptó los TyC (ignorando la página de tyc)
    const isTermsPending =
      (user.accepted_terms === 0 ||
        user.accepted_terms === false ||
        user.accepted_terms === undefined) &&
      window.location.pathname !== "/terms.html";

    if (isTermsPending) {
      showTermsModal();
    } else {
      // Si el usuario no tiene aptitudes y aún no descartó el modal en esta sesión
      const hasNoTags = !user.tags || !Array.isArray(user.tags) || user.tags.length === 0;
      const alreadyDismissed = sessionStorage.getItem("sw_skills_modal_dismissed");
      const ignoredPages = ["/terms.html", "/register.html", "/login.html"];
      
      if (hasNoTags && !alreadyDismissed && !ignoredPages.includes(window.location.pathname)) {
        showInitialSkillsModal();
      }
    }
  } else {
    guestLinks.forEach((el) => (el.style.display = "inline-flex"));
    authLinks.forEach((el) => (el.style.display = "none"));
    adminLinks.forEach((el) => (el.style.display = "none"));
  }
}

/* ═══════════════════════════════════════
   LOGOUT
═══════════════════════════════════════ */
function logout(expired = false) {
  localStorage.removeItem("sw_token");
  localStorage.removeItem("sw_user");
  if (expired === true) {
    localStorage.setItem("sw_expired_msg", "Tu sesion ha expirado, por favor ingresa nuevamente.");
  }
  window.location.href = "/";
}

/* ═══════════════════════════════════════
   TOAST NOTIFICATIONS
═══════════════════════════════════════ */
function showToast(message, isError = false) {
  // Eliminar toasts anteriores
  document.querySelectorAll(".sw-toast").forEach((t) => t.remove());

  const toast = document.createElement("div");
  toast.className = "sw-toast";
  Object.assign(toast.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    zIndex: "99999",
    maxWidth: "320px",
    fontFamily: "var(--sw-font-m)",
    fontSize: "0.75rem",
    letterSpacing: "0.06em",
    padding: "0.75rem 1rem",
    border: `1px solid ${isError ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)"}`,
    background: `var(--sw-dark)`,
    color: isError ? "#f87171" : "#4ade80",
    boxShadow: `0 4px 24px ${isError ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)"}`,
    clipPath:
      "polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))",
    transition: "opacity 0.3s",
    opacity: "1",
  });
  toast.innerText = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function togglePassword(inputId, iconElement) {
  const input = document.getElementById(inputId);
  if (input.type === "password") {
    input.type = "text";
    iconElement.classList.remove("fa-eye");
    iconElement.classList.add("fa-eye-slash");
  } else {
    input.type = "password";
    iconElement.classList.remove("fa-eye-slash");
    iconElement.classList.add("fa-eye");
  }
}

/* ═══════════════════════════════════════
   MODAL UTILITIES
═══════════════════════════════════════ */
function openModalById(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add("open");
}

function closeModalById(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove("open");
}

function closeModal(event) {
  if (
    event &&
    event.target &&
    event.target.classList &&
    event.target.classList.contains("sw-modal-overlay")
  ) {
    event.target.classList.remove("open");
  }
}

window.openModalById = openModalById;
window.closeModalById = closeModalById;
window.closeModal = closeModal;

// Global scope
window.app = {
  logout,
  showToast,
  checkAuthState,
  toggleTheme,
  togglePassword,
  openModalById,
  closeModalById,
  closeModal,
  acceptTerms,
  openTermsTextModal,
  showInitialSkillsModal,
  dismissSkillsModal,
  saveInitialSkills,
};

/* ═══════════════════════════════════════
   TERMS AND CONDITIONS MODAL
═══════════════════════════════════════ */
function showTermsModal() {
  if (document.getElementById("sw-terms-modal")) return;

  const modalHtml = `
    <style id="sw-terms-modal-style">
      @keyframes sw-modal-fadein { from { opacity:0; } to { opacity:1; } }
      @keyframes sw-modal-slidein { from { opacity:0; transform:translateY(16px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }
      /* Variables adaptativas por modo */
      :root {
        --sw-mt-text:       rgba(245,245,245,0.60);
        --sw-mt-subtle:     rgba(245,245,245,0.42);
        --sw-mt-btn-ghost:  rgba(245,245,245,0.55);
        --sw-mt-btn-ghost-h:rgba(245,245,245,0.85);
      }
      :root.light-mode {
        --sw-mt-text:       rgba(26,26,26,0.70);
        --sw-mt-subtle:     rgba(26,26,26,0.55);
        --sw-mt-btn-ghost:  rgba(26,26,26,0.65);
        --sw-mt-btn-ghost-h:rgba(26,26,26,0.90);
      }
      #sw-terms-modal .sw-tm-btn-ghost {
        color: var(--sw-mt-btn-ghost);
      }
      #sw-terms-modal .sw-tm-btn-ghost:hover {
        color: var(--sw-mt-btn-ghost-h);
        border-color: rgba(163,0,0,0.7) !important;
      }
    </style>
    <div id="sw-terms-modal" style="
      position: fixed; inset: 0; z-index: 99999;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,0.85);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      padding: 1rem;
      animation: sw-modal-fadein 0.25s ease;
    ">
      <div style="
        background: var(--sw-dark, #121212);
        border: 1px solid var(--sw-red, #A30000);
        width: 100%; max-width: 480px;
        clip-path: polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px));
        box-shadow: 0 0 40px rgba(163,0,0,0.25), 0 20px 60px rgba(0,0,0,0.6);
        animation: sw-modal-slidein 0.3s ease;
      ">
        <!-- Header -->
        <div style="
          display: flex; align-items: center;
          padding: 0.85rem 1.25rem;
          border-bottom: 1px solid rgba(163,0,0,0.25);
          background: rgba(163,0,0,0.06);
        ">
          <div style="display:flex; align-items:center; gap:5px; flex:1;">
            <span style="width:9px;height:9px;border-radius:50%;background:#A30000;display:block;"></span>
            <span style="width:9px;height:9px;border-radius:50%;background:rgba(163,0,0,0.35);display:block;"></span>
            <span style="width:9px;height:9px;border-radius:50%;background:rgba(163,0,0,0.15);display:block;"></span>
          </div>
          <span style="font-family:var(--sw-font-m,'Share Tech Mono',monospace); font-size:0.58rem; color:rgba(163,0,0,0.9); letter-spacing:0.22em; text-transform:uppercase;">
            ACCIÓN REQUERIDA
          </span>
          <div style="flex:1;"></div>
        </div>

        <!-- Icono / Marca de alerta -->
        <div style="text-align:center; padding: 2rem 2rem 1rem;">
          <div style="
            display:inline-flex; align-items:center; justify-content:center;
            width:56px; height:56px; margin-bottom:1.25rem;
            background:rgba(163,0,0,0.12);
            border:1px solid rgba(163,0,0,0.35);
            clip-path:polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,8px 100%,0 calc(100% - 8px));
          ">
            <i class="fa-solid fa-file-contract" style="font-size:1.4rem; color:var(--sw-red,#A30000);"></i>
          </div>
          <h3 style="
            font-family:var(--sw-font-h,'Barlow Condensed',sans-serif);
            font-size:1.6rem; font-weight:800; letter-spacing:0.05em;
            text-transform:uppercase; color:var(--sw-white,#F5F5F5);
            margin:0 0 0.75rem;
          ">Actualización de Términos</h3>
          <p style="
            font-family:var(--sw-font-b,'Inter',sans-serif);
            font-size:0.88rem; color:var(--sw-mt-text); line-height:1.65;
            margin:0 0 0.5rem;
          ">
            Hemos actualizado nuestros <a href="#" onclick="window.app.openTermsTextModal(event)" style="color:var(--sw-red,#A30000); text-decoration:none; font-weight:600; border-bottom:1px solid rgba(163,0,0,0.4);">Términos y Condiciones</a>.
          </p>
          <p style="
            font-family:var(--sw-font-b,'Inter',sans-serif);
            font-size:0.83rem; color:var(--sw-mt-subtle); line-height:1.5;
            margin:0;
          ">
            Debes aceptarlos para continuar utilizando la plataforma.
          </p>
        </div>

        <!-- Separador -->
        <div style="height:1px; background:rgba(163,0,0,0.18); margin:0 1.25rem;"></div>

        <!-- Acciones -->
        <div style="display:flex; gap:0.75rem; padding:1.25rem 1.5rem 1.5rem;">
          <button
            class="sw-tm-btn-ghost"
            onclick="window.app.logout()"
            style="
              flex:1; font-family:var(--sw-font-m,'Share Tech Mono',monospace);
              font-size:0.72rem; letter-spacing:0.1em; text-transform:uppercase;
              background:transparent;
              border:1px solid rgba(163,0,0,0.3); cursor:pointer;
              padding:0.7rem 1rem;
              clip-path:polygon(0 0,calc(100% - 6px) 0,100% 6px,100% 100%,6px 100%,0 calc(100% - 6px));
              transition:all 0.2s;
            "
          >CANCELAR Y SALIR</button>
          <button
            id="btn-accept-terms"
            onclick="window.app.acceptTerms()"
            style="
              flex:1; font-family:var(--sw-font-m,'Share Tech Mono',monospace);
              font-size:0.72rem; letter-spacing:0.1em; text-transform:uppercase;
              background:var(--sw-red,#A30000); color:#F5F5F5;
              border:none; cursor:pointer;
              padding:0.7rem 1rem;
              clip-path:polygon(0 0,calc(100% - 6px) 0,100% 6px,100% 100%,6px 100%,0 calc(100% - 6px));
              transition:all 0.2s;
              box-shadow:0 0 18px rgba(163,0,0,0.35);
            "
            onmouseover="this.style.background='#c40000';this.style.boxShadow='0 0 24px rgba(163,0,0,0.5)';"
            onmouseout="this.style.background='var(--sw-red,#A30000)';this.style.boxShadow='0 0 18px rgba(163,0,0,0.35)';"
          >ACEPTAR TÉRMINOS</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHtml);
}

async function acceptTerms() {
  const btn = document.getElementById("btn-accept-terms");
  if (btn) {
    btn.innerText = "PROCESANDO...";
    btn.disabled = true;
  }
  try {
    const res = await window.api.fetch("/auth/accept-terms", {
      method: "POST",
    });
    const userStr = localStorage.getItem("sw_user");
    if (userStr) {
      let user = JSON.parse(userStr);
      user.accepted_terms = 1;
      localStorage.setItem("sw_user", JSON.stringify(user));
    }
    if (res.token) {
      localStorage.setItem("sw_token", res.token);
    }
    const modal = document.getElementById("sw-terms-modal");
    if (modal) modal.remove();
    showToast(res.message || "Términos aceptados.");
  } catch (err) {
    showToast(err.message || "Error al aceptar términos", true);
    if (btn) {
      btn.innerText = "ACEPTAR TÉRMINOS";
      btn.disabled = false;
    }
  }
}

/* ═══════════════════════════════════════
   TERMS TEXT MODAL
═══════════════════════════════════════ */
function openTermsTextModal(e) {
  if (e) e.preventDefault();
  if (document.getElementById("sw-terms-text-modal")) return; // ya está visible

  const modalHtml = `
    <style id="sw-terms-text-modal-style">
      /* Variables adaptativas: dark por defecto, light-mode override */
      :root {
        --sw-mtt-text:        rgba(245,245,245,0.60);
        --sw-mtt-close:       rgba(245,245,245,0.45);
        --sw-mtt-btn-ghost:   rgba(245,245,245,0.55);
        --sw-mtt-btn-ghost-h: rgba(245,245,245,0.90);
        --sw-mtt-footer-bg:   rgba(163,0,0,0.04);
      }
      :root.light-mode {
        --sw-mtt-text:        rgba(26,26,26,0.72);
        --sw-mtt-close:       rgba(26,26,26,0.50);
        --sw-mtt-btn-ghost:   rgba(26,26,26,0.65);
        --sw-mtt-btn-ghost-h: rgba(26,26,26,0.92);
        --sw-mtt-footer-bg:   rgba(163,0,0,0.04);
      }
      #sw-terms-text-modal .sw-mtt-close-btn {
        background:none;border:none;
        color: var(--sw-mtt-close);
        cursor:pointer;font-size:1rem;padding:0.2rem 0.4rem;transition:color 0.2s;line-height:1;
      }
      #sw-terms-text-modal .sw-mtt-close-btn:hover { color:#A30000; }
      #sw-terms-text-modal .sw-mtt-body-text {
        font-family:var(--sw-font-b,'Inter',sans-serif);
        font-size:0.88rem;color:var(--sw-mtt-text);line-height:1.7;margin:0;
      }
      #sw-terms-text-modal .sw-mtt-btn-ghost {
        font-family:var(--sw-font-m,'Share Tech Mono',monospace);
        font-size:0.72rem;letter-spacing:0.1em;text-transform:uppercase;
        background:transparent;color:var(--sw-mtt-btn-ghost);
        border:1px solid rgba(163,0,0,0.3);cursor:pointer;
        padding:0.6rem 1.4rem;
        clip-path:polygon(0 0,calc(100% - 6px) 0,100% 6px,100% 100%,6px 100%,0 calc(100% - 6px));
        transition:all 0.2s;
      }
      #sw-terms-text-modal .sw-mtt-btn-ghost:hover {
        border-color:rgba(163,0,0,0.7);
        color:var(--sw-mtt-btn-ghost-h);
      }
    </style>
    <div id="sw-terms-text-modal" style="
      position:fixed; inset:0; z-index:100000;
      display:flex; align-items:center; justify-content:center;
      background:rgba(0,0,0,0.85);
      backdrop-filter:blur(6px);
      -webkit-backdrop-filter:blur(6px);
      padding:1rem;
      animation:sw-modal-fadein 0.2s ease;
    " onclick="if(event.target===this){this.style.opacity='0';setTimeout(()=>this.remove(),180);}">
      <div style="
        background:var(--sw-dark,#121212);
        border:1px solid rgba(163,0,0,0.35);
        width:100%; max-width:700px;
        max-height:82vh; overflow-y:auto;
        clip-path:polygon(0 0,calc(100% - 16px) 0,100% 16px,100% 100%,16px 100%,0 calc(100% - 16px));
        box-shadow:0 0 40px rgba(163,0,0,0.18), 0 20px 60px rgba(0,0,0,0.7);
        animation:sw-modal-slidein 0.3s ease;
        display:flex; flex-direction:column;
      " onclick="event.stopPropagation()">

        <!-- Header -->
        <div style="
          display:flex; align-items:center; justify-content:space-between;
          padding:0.85rem 1.25rem;
          border-bottom:1px solid rgba(163,0,0,0.22);
          background:rgba(163,0,0,0.06);
          flex-shrink:0;
        ">
          <div style="display:flex; align-items:center; gap:5px;">
            <span style="width:9px;height:9px;border-radius:50%;background:#A30000;display:block;"></span>
            <span style="width:9px;height:9px;border-radius:50%;background:rgba(163,0,0,0.35);display:block;"></span>
            <span style="width:9px;height:9px;border-radius:50%;background:rgba(163,0,0,0.15);display:block;"></span>
            <span style="margin-left:8px; font-family:var(--sw-font-m,'Share Tech Mono',monospace); font-size:0.58rem; color:rgba(163,0,0,0.9); letter-spacing:0.22em; text-transform:uppercase;">INFORMACIÓN LEGAL</span>
          </div>
          <button
            class="sw-mtt-close-btn"
            onclick="(function(el){el.closest('[id=sw-terms-text-modal]').style.opacity='0';setTimeout(()=>el.closest('[id=sw-terms-text-modal]').remove(),180);})(this)"
          ><i class="fa-solid fa-xmark"></i></button>
        </div>

        <!-- Contenido -->
        <div style="padding:1.75rem 1.75rem 2rem; text-align:left;">

          <!-- Título -->
          <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1.5rem;">
            <div style="
              display:inline-flex;align-items:center;justify-content:center;
              width:38px;height:38px;flex-shrink:0;
              background:rgba(163,0,0,0.12);
              border:1px solid rgba(163,0,0,0.3);
              clip-path:polygon(0 0,calc(100% - 6px) 0,100% 6px,100% 100%,6px 100%,0 calc(100% - 6px));
            "><i class="fa-solid fa-file-contract" style="font-size:1rem;color:#A30000;"></i></div>
            <h3 style="
              font-family:var(--sw-font-h,'Barlow Condensed',sans-serif);
              font-size:1.55rem;font-weight:800;letter-spacing:0.05em;
              text-transform:uppercase;color:var(--sw-white,#F5F5F5);margin:0;
            ">Términos y Condiciones</h3>
          </div>

          <!-- Sección 1 -->
          <div style="margin-bottom:1.4rem;">
            <h4 style="
              font-family:var(--sw-font-m,'Share Tech Mono',monospace);
              font-size:0.68rem;letter-spacing:0.16em;text-transform:uppercase;
              color:#A30000;margin:0 0 0.6rem;padding-bottom:0.4rem;
              border-bottom:1px solid rgba(163,0,0,0.22);
            ">1. Aceptación de los Términos</h4>
            <p class="sw-mtt-body-text">
              Al acceder o utilizar la plataforma de Spider-Web ARG, aceptas estar sujeto a estos términos y condiciones de uso. Si no estás de acuerdo con alguna parte de los términos, no podrás acceder al servicio.
            </p>
          </div>

          <!-- Sección 2 -->
          <div style="margin-bottom:1.4rem;">
            <h4 style="
              font-family:var(--sw-font-m,'Share Tech Mono',monospace);
              font-size:0.68rem;letter-spacing:0.16em;text-transform:uppercase;
              color:#A30000;margin:0 0 0.6rem;padding-bottom:0.4rem;
              border-bottom:1px solid rgba(163,0,0,0.22);
            ">2. Uso de la Plataforma</h4>
            <p class="sw-mtt-body-text">
              Como pasante, te comprometes a utilizar la plataforma únicamente para fines legítimos y de manera que no infrinja los derechos de, restrinja o inhiba el uso y disfrute de la plataforma por parte de cualquier tercero.
            </p>
          </div>

          <!-- Sección 3 -->
          <div style="margin-bottom:1.4rem;">
            <h4 style="
              font-family:var(--sw-font-m,'Share Tech Mono',monospace);
              font-size:0.68rem;letter-spacing:0.16em;text-transform:uppercase;
              color:#A30000;margin:0 0 0.6rem;padding-bottom:0.4rem;
              border-bottom:1px solid rgba(163,0,0,0.22);
            ">3. Privacidad y Datos</h4>
            <p class="sw-mtt-body-text">
              Tu privacidad es importante para nosotros. Cualquier información personal que proporciones será tratada de acuerdo con nuestras políticas internas, garantizando la confidencialidad de tus datos.
            </p>
          </div>

          <!-- Sección 4 -->
          <div>
            <h4 style="
              font-family:var(--sw-font-m,'Share Tech Mono',monospace);
              font-size:0.68rem;letter-spacing:0.16em;text-transform:uppercase;
              color:#A30000;margin:0 0 0.6rem;padding-bottom:0.4rem;
              border-bottom:1px solid rgba(163,0,0,0.22);
            ">4. Modificaciones</h4>
            <p class="sw-mtt-body-text">
              Nos reservamos el derecho de modificar o reemplazar estos términos en cualquier momento. Al continuar accediendo o utilizando nuestro servicio después de que esas revisiones se vuelvan efectivas, aceptas estar sujeto a los términos revisados.
            </p>
          </div>
        </div>

        <!-- Footer del modal -->
        <div style="
          border-top:1px solid rgba(163,0,0,0.18);
          padding:1rem 1.75rem;
          display:flex;justify-content:flex-end;
          flex-shrink:0;
          background:var(--sw-mtt-footer-bg);
        ">
          <button
            class="sw-mtt-btn-ghost"
            onclick="(function(el){el.closest('[id=sw-terms-text-modal]').style.opacity='0';setTimeout(()=>el.closest('[id=sw-terms-text-modal]').remove(),180);})(this)"
          >CERRAR</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHtml);
}

/* ═══════════════════════════════════════
   INITIAL SKILLS SELECTION MODAL
═══════════════════════════════════════ */
async function showInitialSkillsModal() {
  if (document.getElementById("sw-skills-modal")) return;

  const modalHtml = `
    <style id="sw-skills-modal-style">
      @keyframes sw-modal-fadein { from { opacity:0; } to { opacity:1; } }
      @keyframes sw-modal-slidein { from { opacity:0; transform:translateY(16px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }
      :root {
        --sw-sk-text:       rgba(245,245,245,0.70);
        --sw-sk-subtle:     rgba(245,245,245,0.45);
        --sw-sk-btn-ghost:  rgba(245,245,245,0.55);
        --sw-sk-btn-ghost-h:rgba(245,245,245,0.85);
      }
      :root.light-mode {
        --sw-sk-text:       rgba(26,26,26,0.75);
        --sw-sk-subtle:     rgba(26,26,26,0.55);
        --sw-sk-btn-ghost:  rgba(26,26,26,0.65);
        --sw-sk-btn-ghost-h:rgba(26,26,26,0.90);
      }
      #sw-skills-modal .sw-sk-btn-ghost {
        color: var(--sw-sk-btn-ghost);
      }
      #sw-skills-modal .sw-sk-btn-ghost:hover {
        color: var(--sw-sk-btn-ghost-h);
        border-color: rgba(163,0,0,0.7) !important;
      }
    </style>
    <div id="sw-skills-modal" style="
      position: fixed; inset: 0; z-index: 99998;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,0.85);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      padding: 1rem;
      animation: sw-modal-fadein 0.25s ease;
    ">
      <div style="
        background: var(--sw-dark, #121212);
        border: 1px solid var(--sw-red, #A30000);
        width: 100%; max-width: 520px;
        clip-path: polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px));
        box-shadow: 0 0 40px rgba(163,0,0,0.25), 0 20px 60px rgba(0,0,0,0.6);
        animation: sw-modal-slidein 0.3s ease;
        display: flex; flex-direction: column; max-height: 90vh;
      ">
        <!-- Header -->
        <div style="
          display: flex; align-items: center;
          padding: 0.85rem 1.25rem;
          border-bottom: 1px solid rgba(163,0,0,0.25);
          background: rgba(163,0,0,0.06);
        ">
          <div style="display:flex; align-items:center; gap:5px; flex:1;">
            <span style="width:9px;height:9px;border-radius:50%;background:#A30000;display:block;"></span>
            <span style="width:9px;height:9px;border-radius:50%;background:rgba(163,0,0,0.35);display:block;"></span>
            <span style="width:9px;height:9px;border-radius:50%;background:rgba(163,0,0,0.15);display:block;"></span>
          </div>
          <span style="font-family:var(--sw-font-m,'Share Tech Mono',monospace); font-size:0.58rem; color:rgba(163,0,0,0.9); letter-spacing:0.22em; text-transform:uppercase;">
            PERFIL DE USUARIO
          </span>
          <div style="flex:1;"></div>
        </div>

        <!-- Body -->
        <div style="padding: 1.5rem 1.75rem; overflow-y: auto;">
          <div style="text-align:center; margin-bottom: 1.25rem;">
            <div style="
              display:inline-flex; align-items:center; justify-content:center;
              width:52px; height:52px; margin-bottom:0.75rem;
              background:rgba(163,0,0,0.12);
              border:1px solid rgba(163,0,0,0.35);
              clip-path:polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,8px 100%,0 calc(100% - 8px));
            ">
              <i class="fa-solid fa-tags" style="font-size:1.3rem; color:var(--sw-red,#A30000);"></i>
            </div>
            <h3 style="
              font-family:var(--sw-font-h,'Barlow Condensed',sans-serif);
              font-size:1.5rem; font-weight:800; letter-spacing:0.05em;
              text-transform:uppercase; color:var(--sw-white,#F5F5F5);
              margin:0 0 0.5rem;
            ">Selecciona tus Aptitudes Iniciales</h3>
            <p style="
              font-family:var(--sw-font-b,'Inter',sans-serif);
              font-size:0.83rem; color:var(--sw-sk-text); line-height:1.5;
              margin:0;
            ">
              Aún no has registrado aptitudes en tu perfil. Selecciona tus áreas de interés para personalizar tu perfil y acceder a los proyectos.
            </p>
          </div>

          <!-- Contenedor de aptitudes -->
          <div id="sw-modal-skills-list" style="
            display: flex; flex-wrap: wrap; gap: 8px;
            max-height: 200px; overflow-y: auto;
            padding: 12px; background: rgba(0,0,0,0.2);
            border: 1px solid rgba(163,0,0,0.2);
            border-radius: 4px; margin-bottom: 0.5rem;
          ">
            <span style="font-size:0.75rem; color:var(--sw-sk-subtle);">Cargando aptitudes disponibles...</span>
          </div>
        </div>

        <!-- Separador -->
        <div style="height:1px; background:rgba(163,0,0,0.18); margin:0 1.25rem;"></div>

        <!-- Acciones -->
        <div style="display:flex; gap:0.75rem; padding:1.25rem 1.5rem 1.5rem;">
          <button
            class="sw-sk-btn-ghost"
            onclick="window.app.dismissSkillsModal()"
            style="
              flex:1; font-family:var(--sw-font-m,'Share Tech Mono',monospace);
              font-size:0.72rem; letter-spacing:0.1em; text-transform:uppercase;
              background:transparent;
              border:1px solid rgba(163,0,0,0.3); cursor:pointer;
              padding:0.7rem 1rem;
              clip-path:polygon(0 0,calc(100% - 6px) 0,100% 6px,100% 100%,6px 100%,0 calc(100% - 6px));
              transition:all 0.2s;
            "
          >MÁS TARDE</button>
          <button
            id="btn-save-initial-skills"
            onclick="window.app.saveInitialSkills()"
            style="
              flex:1; font-family:var(--sw-font-m,'Share Tech Mono',monospace);
              font-size:0.72rem; letter-spacing:0.1em; text-transform:uppercase;
              background:var(--sw-red,#A30000); color:#F5F5F5;
              border:none; cursor:pointer;
              padding:0.7rem 1rem;
              clip-path:polygon(0 0,calc(100% - 6px) 0,100% 6px,100% 100%,6px 100%,0 calc(100% - 6px));
              transition:all 0.2s;
              box-shadow:0 0 18px rgba(163,0,0,0.35);
            "
            onmouseover="this.style.background='#c40000';this.style.boxShadow='0 0 24px rgba(163,0,0,0.5)';"
            onmouseout="this.style.background='var(--sw-red,#A30000)';this.style.boxShadow='0 0 18px rgba(163,0,0,0.35)';"
          >GUARDAR APTITUDES</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHtml);

  // Cargar skills desde la API
  try {
    const res = await window.api.fetch("/public/skills");
    const skills = res.skills || [];
    const container = document.getElementById("sw-modal-skills-list");
    if (container) {
      if (!skills.length) {
        container.innerHTML = '<span style="font-size:0.75rem; color:var(--sw-sk-subtle);">Sin aptitudes disponibles</span>';
      } else {
        container.innerHTML = skills.map(s => `
          <label style="display:inline-flex;align-items:center;gap:6px;font-size:0.75rem;cursor:pointer;background:rgba(255,255,255,0.04);padding:6px 10px;border:1px solid rgba(255,255,255,0.1);border-radius:4px;user-select:none;transition:all 0.2s;" onmouseover="this.style.borderColor='rgba(163,0,0,0.6)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.1)'">
            <input type="checkbox" name="modal_skills" value="${s.name}" style="accent-color:var(--sw-red);cursor:pointer;">
            <span style="width:8px;height:8px;border-radius:50%;background:${s.color || '#A30000'};display:inline-block;"></span>
            <span style="color:var(--sw-white);">${s.name}</span>
          </label>
        `).join('');
      }
    }
  } catch (err) {
    const container = document.getElementById("sw-modal-skills-list");
    if (container) {
      container.innerHTML = '<span style="font-size:0.75rem; color:#f87171;">Error al cargar aptitudes</span>';
    }
  }
}

function dismissSkillsModal() {
  sessionStorage.setItem("sw_skills_modal_dismissed", "1");
  const modal = document.getElementById("sw-skills-modal");
  if (modal) {
    modal.style.opacity = "0";
    setTimeout(() => modal.remove(), 200);
  }
}

async function saveInitialSkills() {
  const checkboxes = document.querySelectorAll('input[name="modal_skills"]:checked');
  const selectedTags = Array.from(checkboxes).map(cb => cb.value);

  if (!selectedTags.length) {
    showToast("Selecciona al menos una aptitud antes de guardar.", true);
    return;
  }

  const btn = document.getElementById("btn-save-initial-skills");
  if (btn) {
    btn.innerText = "GUARDANDO...";
    btn.disabled = true;
  }

  try {
    await window.api.fetch("/users/me", {
      method: "PATCH",
      body: { tags: selectedTags },
    });

    const userStr = localStorage.getItem("sw_user");
    if (userStr) {
      let user = JSON.parse(userStr);
      user.tags = selectedTags;
      localStorage.setItem("sw_user", JSON.stringify(user));
    }

    showToast("Aptitudes guardadas correctamente.");
    dismissSkillsModal();

    if (typeof currentUser !== "undefined" && currentUser) {
      currentUser.tags = selectedTags;
    }

    if (typeof loadUserTagsCheckboxes === "function") {
      loadUserTagsCheckboxes(selectedTags);
    }

    setTimeout(() => {
      window.location.reload();
    }, 800);
  } catch (err) {
    showToast(err.message || "Error guardando aptitudes.", true);
    if (btn) {
      btn.innerText = "GUARDAR APTITUDES";
      btn.disabled = false;
    }
  }
}
