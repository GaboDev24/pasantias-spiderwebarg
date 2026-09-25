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
   PARSEO DE FECHAS CROSS-BROWSER
═══════════════════════════════════════ */
/**
 * Convierte una fecha SQL ("YYYY-MM-DD HH:MM:SS") al formato ISO
 * ("YYYY-MM-DDTHH:MM:SS") antes de crear el objeto Date, evitando
 * el error "Invalid Date" en Safari y versiones antiguas de Edge.
 * @param {string} dateStr - Fecha en cualquier formato string.
 * @returns {Date}
 */
function parseDate(dateStr) {
  if (!dateStr) return new Date(NaN);
  // Reemplaza el espacio separador de SQL por 'T' para formato ISO 8601
  return new Date(String(dateStr).replace(' ', 'T'));
}

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
    if (
      (user.accepted_terms === 0 ||
        user.accepted_terms === false ||
        user.accepted_terms === undefined) &&
      window.location.pathname !== "/terms.html"
    ) {
      showTermsModal();
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
    WebkitClipPath:
      "polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))",
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
  parseDate,
};

/* ═══════════════════════════════════════
   TERMS AND CONDITIONS MODAL (FORZADO)
═══════════════════════════════════════ */
function showTermsModal() {
  if (document.getElementById("sw-terms-modal")) return;

  // Inyectar estilos del modal si no existen
  if (!document.getElementById('sw-terms-modal-styles')) {
    const style = document.createElement('style');
    style.id = 'sw-terms-modal-styles';
    style.textContent = `
      @keyframes termsGlow {
        0%, 100% { box-shadow: 0 0 20px rgba(163,0,0,0.3), 0 0 60px rgba(163,0,0,0.1); }
        50% { box-shadow: 0 0 35px rgba(163,0,0,0.5), 0 0 80px rgba(163,0,0,0.2); }
      }
      @keyframes termsFadeIn {
        from { opacity: 0; transform: scale(0.92) translateY(20px); }
        to   { opacity: 1; transform: scale(1) translateY(0); }
      }
      @keyframes termsLineScan {
        0% { transform: translateY(-100%); }
        100% { transform: translateY(100vh); }
      }
      #sw-terms-modal {
        position: fixed; inset: 0; z-index: 99999;
        display: flex; align-items: center; justify-content: center;
        background: rgba(0,0,0,0.85);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        overflow: hidden;
      }
      #sw-terms-modal::before {
        content: '';
        position: absolute; left: 0; top: 0;
        width: 100%; height: 2px;
        background: linear-gradient(90deg, transparent, rgba(163,0,0,0.8), transparent);
        animation: termsLineScan 3s linear infinite;
        pointer-events: none;
      }
      .sw-terms-panel {
        position: relative;
        width: min(520px, 92vw);
        background: var(--sw-dark, #0d0d0d);
        border: 1px solid rgba(163,0,0,0.4);
        clip-path: polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 18px 100%, 0 calc(100% - 18px));
        padding: 2.5rem 2rem 2rem;
        animation: termsFadeIn 0.35s cubic-bezier(.16,1,.3,1) both, termsGlow 3s ease-in-out infinite;
      }
      .sw-terms-panel__corner {
        position: absolute; width: 16px; height: 16px;
        border-color: rgba(163,0,0,0.6); border-style: solid;
      }
      .sw-terms-panel__corner--tl { top: -1px; left: -1px; border-width: 2px 0 0 2px; }
      .sw-terms-panel__corner--tr { top: -1px; right: -1px; border-width: 2px 2px 0 0; }
      .sw-terms-panel__corner--bl { bottom: -1px; left: -1px; border-width: 0 0 2px 2px; }
      .sw-terms-panel__corner--br { bottom: -1px; right: -1px; border-width: 0 2px 2px 0; }
      .sw-terms-panel__badge {
        display: flex; align-items: center; gap: 8px;
        font-family: var(--sw-font-m, monospace); font-size: 0.58rem;
        letter-spacing: 0.25em; color: rgba(163,0,0,0.9);
        text-transform: uppercase; margin-bottom: 1.5rem;
        padding-bottom: 1rem;
        border-bottom: 1px solid rgba(163,0,0,0.15);
      }
      .sw-terms-panel__badge-dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: #a30000;
        box-shadow: 0 0 6px #a30000;
        animation: termsGlow 1.5s ease-in-out infinite;
      }
      .sw-terms-icon {
        width: 64px; height: 64px; margin: 0 auto 1.25rem;
        border: 1px solid rgba(163,0,0,0.3);
        clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
        background: rgba(163,0,0,0.08);
        display: flex; align-items: center; justify-content: center;
        font-size: 1.4rem; color: rgba(163,0,0,0.9);
      }
      .sw-terms-title {
        font-family: var(--sw-font-h, serif); font-size: 1.6rem;
        color: var(--sw-white, #fff); text-transform: uppercase;
        text-align: center; margin-bottom: 0.75rem; letter-spacing: 0.05em;
      }
      .sw-terms-desc {
        font-family: var(--sw-font-r, sans-serif); font-size: 0.85rem;
        color: var(--sw-text-muted, #888); line-height: 1.65;
        text-align: center; margin-bottom: 1.75rem;
      }
      .sw-terms-desc a { color: #a30000; font-weight: 700; text-decoration: none; }
      .sw-terms-desc a:hover { text-decoration: underline; }
      .sw-terms-actions {
        display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;
      }
      .sw-terms-btn-exit {
        font-family: var(--sw-font-m, monospace); font-size: 0.7rem;
        letter-spacing: 0.12em; text-transform: uppercase;
        padding: 0.7rem 1.4rem;
        background: transparent;
        border: 1px solid rgba(255,255,255,0.12);
        color: var(--sw-text-muted, #888);
        cursor: pointer; transition: all 0.2s;
        clip-path: polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px));
      }
      .sw-terms-btn-exit:hover { border-color: rgba(255,255,255,0.3); color: #fff; }
      .sw-terms-btn-accept {
        font-family: var(--sw-font-m, monospace); font-size: 0.7rem;
        letter-spacing: 0.12em; text-transform: uppercase;
        padding: 0.7rem 1.8rem;
        background: #a30000;
        border: 1px solid rgba(163,0,0,0.6);
        color: #fff; cursor: pointer;
        transition: all 0.2s;
        clip-path: polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px));
        box-shadow: 0 4px 20px rgba(163,0,0,0.3);
      }
      .sw-terms-btn-accept:hover { background: #cc0000; box-shadow: 0 6px 28px rgba(163,0,0,0.5); transform: translateY(-1px); }
      .sw-terms-btn-accept:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
      .sw-terms-legal-note {
        margin-top: 1.25rem;
        font-family: var(--sw-font-m, monospace); font-size: 0.58rem;
        color: rgba(255,255,255,0.2); text-align: center;
        letter-spacing: 0.1em; line-height: 1.6;
      }
    `;
    document.head.appendChild(style);
  }

  const modalHtml = `
    <div id="sw-terms-modal" role="dialog" aria-modal="true" aria-labelledby="terms-modal-title">
      <div class="sw-terms-panel">
        <div class="sw-terms-panel__corner sw-terms-panel__corner--tl"></div>
        <div class="sw-terms-panel__corner sw-terms-panel__corner--tr"></div>
        <div class="sw-terms-panel__corner sw-terms-panel__corner--bl"></div>
        <div class="sw-terms-panel__corner sw-terms-panel__corner--br"></div>

        <div class="sw-terms-panel__badge">
          <div class="sw-terms-panel__badge-dot"></div>
          ACCIÓN REQUERIDA — SISTEMA SPIDER-WEB ARG
        </div>

        <div class="sw-terms-icon">
          <i class="fa-solid fa-file-contract"></i>
        </div>

        <h2 id="terms-modal-title" class="sw-terms-title">Actualización de Términos</h2>

        <p class="sw-terms-desc">
          Hemos actualizado nuestros
          <a href="#" onclick="window.app.openTermsTextModal(event)">Términos y Condiciones</a>
          conforme a la legislación argentina vigente.
          Debes aceptarlos para continuar utilizando la plataforma.
        </p>

        <div class="sw-terms-actions">
          <button class="sw-terms-btn-exit" onclick="window.app.logout()"
            title="Cerrar sesión y salir">
            <i class="fa-solid fa-right-from-bracket" style="margin-right:6px;"></i>SALIR
          </button>
          <button id="btn-accept-terms" class="sw-terms-btn-accept"
            onclick="window.app.acceptTerms()">
            <i class="fa-solid fa-check" style="margin-right:6px;"></i>ACEPTAR TÉRMINOS
          </button>
        </div>

        <div class="sw-terms-legal-note">
          LEY 25.326 — PROTECCIÓN DE DATOS PERSONALES &nbsp;|&nbsp; LEY 24.240 — DEFENSA DEL CONSUMIDOR<br>
          REPÚBLICA ARGENTINA &nbsp;·&nbsp; 2026
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHtml);
}

async function acceptTerms() {
  const btn = document.getElementById("btn-accept-terms");
  if (btn) {
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin-right:6px;"></i>PROCESANDO...';
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
    if (modal) {
      modal.style.animation = 'none';
      modal.style.opacity = '0';
      modal.style.transition = 'opacity 0.25s';
      setTimeout(() => modal.remove(), 260);
    }
    showToast(res.message || "Términos aceptados. ¡Bienvenido/a!");
  } catch (err) {
    showToast(err.message || "Error al aceptar términos", true);
    if (btn) {
      btn.innerHTML = '<i class="fa-solid fa-check" style="margin-right:6px;"></i>ACEPTAR TÉRMINOS';
      btn.disabled = false;
    }
  }
}

/* ═══════════════════════════════════════
   TERMS TEXT MODAL (FOOTER / REGISTRO)
═══════════════════════════════════════ */
function openTermsTextModal(e) {
  if (e) e.preventDefault();
  if (document.getElementById("sw-terms-text-modal")) {
    document.getElementById("sw-terms-text-modal").classList.add("open");
    return;
  }

  if (!document.getElementById('sw-terms-text-modal-styles')) {
    const style = document.createElement('style');
    style.id = 'sw-terms-text-modal-styles';
    style.textContent = `
      @keyframes termsTextFadeIn {
        from { opacity: 0; transform: translateY(24px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      #sw-terms-text-modal {
        position: fixed; inset: 0; z-index: 99998;
        display: flex; align-items: center; justify-content: center;
        background: rgba(0,0,0,0.8);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
      }
      #sw-terms-text-modal:not(.open) { display: none !important; }
      .sw-terms-text-panel {
        position: relative;
        width: min(820px, 94vw);
        max-height: 88vh;
        background: var(--sw-dark, #0d0d0d);
        border: 1px solid rgba(163,0,0,0.35);
        clip-path: polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px));
        display: flex; flex-direction: column;
        animation: termsTextFadeIn 0.3s cubic-bezier(.16,1,.3,1) both;
        overflow: hidden;
      }
      .sw-terms-text-head {
        display: flex; align-items: center; justify-content: space-between;
        padding: 1rem 1.5rem;
        border-bottom: 1px solid rgba(163,0,0,0.15);
        flex-shrink: 0;
      }
      .sw-terms-text-head-left {
        display: flex; align-items: center; gap: 8px;
        font-family: var(--sw-font-m, monospace); font-size: 0.58rem;
        letter-spacing: 0.22em; color: rgba(163,0,0,0.85);
        text-transform: uppercase;
      }
      .sw-terms-text-close {
        background: none; border: none; color: var(--sw-text-muted, #888);
        cursor: pointer; font-size: 1rem; transition: color 0.2s;
        width: 28px; height: 28px;
        display: flex; align-items: center; justify-content: center;
        border: 1px solid transparent;
      }
      .sw-terms-text-close:hover { color: #fff; border-color: rgba(255,255,255,0.15); }
      .sw-terms-text-body {
        overflow-y: auto; padding: 2rem 2rem 1.5rem;
        flex: 1;
        scrollbar-width: thin;
        scrollbar-color: rgba(163,0,0,0.4) transparent;
      }
      .sw-terms-text-body::-webkit-scrollbar { width: 4px; }
      .sw-terms-text-body::-webkit-scrollbar-track { background: transparent; }
      .sw-terms-text-body::-webkit-scrollbar-thumb { background: rgba(163,0,0,0.4); border-radius: 2px; }
      .sw-terms-h1 {
        font-family: var(--sw-font-h, serif); font-size: 1.8rem;
        color: var(--sw-white, #fff); text-transform: uppercase;
        margin-bottom: 0.5rem; letter-spacing: 0.04em;
      }
      .sw-terms-updated {
        font-family: var(--sw-font-m, monospace); font-size: 0.62rem;
        color: rgba(163,0,0,0.7); letter-spacing: 0.15em;
        text-transform: uppercase; margin-bottom: 2rem;
        padding-bottom: 1.5rem;
        border-bottom: 1px solid rgba(163,0,0,0.12);
      }
      .sw-terms-section-title {
        font-family: var(--sw-font-h, serif); font-size: 1rem;
        color: var(--sw-white, #fff); text-transform: uppercase;
        margin: 1.75rem 0 0.6rem; letter-spacing: 0.05em;
        display: flex; align-items: center; gap: 8px;
      }
      .sw-terms-section-title::before {
        content: '';
        display: inline-block; width: 3px; height: 14px;
        background: #a30000;
        flex-shrink: 0;
      }
      .sw-terms-p {
        font-family: var(--sw-font-r, sans-serif); font-size: 0.875rem;
        color: var(--sw-text-muted, #888); line-height: 1.75;
        margin-bottom: 0.75rem;
      }
      .sw-terms-p strong { color: rgba(255,255,255,0.7); font-weight: 600; }
      .sw-terms-law-ref {
        font-family: var(--sw-font-m, monospace); font-size: 0.62rem;
        color: rgba(163,0,0,0.6); letter-spacing: 0.1em;
        text-transform: uppercase; margin-top: 0.25rem;
      }
      .sw-terms-footer-bar {
        border-top: 1px solid rgba(163,0,0,0.12);
        padding: 1rem 2rem;
        display: flex; align-items: center; justify-content: space-between;
        flex-shrink: 0; flex-wrap: wrap; gap: 8px;
      }
      .sw-terms-footer-note {
        font-family: var(--sw-font-m, monospace); font-size: 0.58rem;
        color: rgba(255,255,255,0.18); letter-spacing: 0.1em;
      }
      .sw-terms-close-btn {
        font-family: var(--sw-font-m, monospace); font-size: 0.68rem;
        letter-spacing: 0.12em; text-transform: uppercase;
        padding: 0.55rem 1.4rem; background: rgba(163,0,0,0.1);
        border: 1px solid rgba(163,0,0,0.35); color: rgba(163,0,0,0.9);
        cursor: pointer; transition: all 0.2s;
        clip-path: polygon(0 0, calc(100% - 5px) 0, 100% 5px, 100% 100%, 5px 100%, 0 calc(100% - 5px));
      }
      .sw-terms-close-btn:hover { background: rgba(163,0,0,0.2); border-color: rgba(163,0,0,0.6); }
    `;
    document.head.appendChild(style);
  }

  const modalHtml = `
    <div id="sw-terms-text-modal" class="open" role="dialog" aria-modal="true" aria-labelledby="terms-text-title"
      onclick="if(event.target===this) this.classList.remove('open')">
      <div class="sw-terms-text-panel">

        <div class="sw-terms-text-head">
          <div class="sw-terms-text-head-left">
            <div class="sw-auth-dot r" style="width:8px;height:8px;"></div>
            <div class="sw-auth-dot y" style="width:8px;height:8px;"></div>
            <div class="sw-auth-dot g" style="width:8px;height:8px;"></div>
            INFORMACIÓN LEGAL — SPIDER-WEB ARG
          </div>
          <button class="sw-terms-text-close" aria-label="Cerrar"
            onclick="document.getElementById('sw-terms-text-modal').classList.remove('open')">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div class="sw-terms-text-body">
          <h2 id="terms-text-title" class="sw-terms-h1">Términos y Condiciones</h2>
          <div class="sw-terms-updated">
            Última actualización: Septiembre 2026 &nbsp;·&nbsp; Versión 2.0
          </div>

          <p class="sw-terms-p">
            Al registrarte, acceder o utilizar la plataforma <strong>Spider-Web ARG</strong>, declaras haber leído,
            comprendido y aceptado en su totalidad los presentes Términos y Condiciones. Si no estás de acuerdo,
            deberás abstenerte de utilizar el servicio.
          </p>

          <!-- 1 -->
          <h3 class="sw-terms-section-title">1. Identificación del Responsable</h3>
          <p class="sw-terms-p">
            El servicio es operado por <strong>Spider-Web ARG</strong>, con domicilio en la República Argentina.
            Para consultas legales podés contactarnos a través de los canales oficiales disponibles en la plataforma.
          </p>

          <!-- 2 -->
          <h3 class="sw-terms-section-title">2. Objeto y Alcance del Servicio</h3>
          <p class="sw-terms-p">
            Spider-Web ARG es una plataforma de gestión de pasantías tecnológicas que permite a usuarios registrados
            postularse a proyectos, comunicarse internamente y gestionar su perfil profesional. El acceso a
            determinadas funcionalidades está sujeto a validación previa por parte del equipo administrativo.
          </p>

          <!-- 3 -->
          <h3 class="sw-terms-section-title">3. Requisitos para el Registro</h3>
          <p class="sw-terms-p">
            Para registrarse en la plataforma el usuario debe:
            (a) ser mayor de 16 años o contar con autorización de su representante legal;
            (b) proporcionar información veraz, precisa y actualizada;
            (c) aceptar expresamente los presentes Términos y Condiciones.
            El suministro de datos falsos podrá dar lugar a la suspensión o baja de la cuenta.
          </p>

          <!-- 4 -->
          <h3 class="sw-terms-section-title">4. Protección de Datos Personales</h3>
          <p class="sw-terms-p">
            El tratamiento de datos personales se rige por la <strong>Ley N.° 25.326 de Protección de Datos
            Personales</strong> y su Decreto Reglamentario N.° 1558/2001.
            Los datos recopilados (nombre, correo electrónico, CV, fotografía, etc.) serán utilizados exclusivamente
            para los fines propios de la plataforma y no serán cedidos a terceros sin el consentimiento previo y
            expreso del titular.
          </p>
          <p class="sw-terms-p">
            <strong>Derechos ARCO:</strong> El usuario tiene derecho a acceder, rectificar, cancelar u oponerse
            al tratamiento de sus datos personales (Arts. 14, 16 y 34 de la Ley 25.326).
            Para ejercer estos derechos, puede contactar a los administradores de la plataforma.
          </p>
          <div class="sw-terms-law-ref">Ref. legal: Ley 25.326 — LPDP Argentina</div>

          <!-- 5 -->
          <h3 class="sw-terms-section-title">5. Uso Aceptable de la Plataforma</h3>
          <p class="sw-terms-p">
            El usuario se compromete a utilizar la plataforma de buena fe y a no realizar ninguna de las
            siguientes conductas:
          </p>
          <p class="sw-terms-p">
            (a) publicar contenido ofensivo, discriminatorio, ilegal o que viole derechos de terceros;<br>
            (b) intentar acceder sin autorización a sistemas, cuentas o datos ajenos;<br>
            (c) utilizar la plataforma para fines comerciales no autorizados;<br>
            (d) distribuir malware, spam o cualquier tipo de código malicioso;<br>
            (e) suplantar la identidad de otros usuarios o del equipo de Spider-Web ARG.
          </p>
          <p class="sw-terms-p">
            El incumplimiento de estas normas podrá dar lugar a la suspensión o eliminación definitiva de la cuenta,
            sin perjuicio de las acciones civiles y/o penales que pudieran corresponder conforme al <strong>Código
            Penal Argentino</strong> (Arts. 153 bis, 173 inc. 16 y concordantes) y la <strong>Ley 26.388</strong>
            de Delitos Informáticos.
          </p>
          <div class="sw-terms-law-ref">Ref. legal: Ley 26.388 — Delitos Informáticos Argentina</div>

          <!-- 6 -->
          <h3 class="sw-terms-section-title">6. Propiedad Intelectual</h3>
          <p class="sw-terms-p">
            Todos los contenidos, marcas, logotipos, código fuente e interfaces de la plataforma son propiedad de
            Spider-Web ARG y están protegidos por la <strong>Ley N.° 11.723 de Propiedad Intelectual</strong>.
            Queda prohibida su reproducción, distribución o modificación sin autorización expresa y por escrito.
          </p>
          <div class="sw-terms-law-ref">Ref. legal: Ley 11.723 — Propiedad Intelectual Argentina</div>

          <!-- 7 -->
          <h3 class="sw-terms-section-title">7. Responsabilidad y Limitaciones</h3>
          <p class="sw-terms-p">
            Spider-Web ARG no garantiza la disponibilidad ininterrumpida del servicio y no será responsable por
            daños directos o indirectos derivados de interrupciones, errores técnicos o accesos no autorizados
            ajenos a su control razonable. El usuario asume la responsabilidad exclusiva por el uso que realice
            de la plataforma.
          </p>

          <!-- 8 -->
          <h3 class="sw-terms-section-title">8. Menores de Edad</h3>
          <p class="sw-terms-p">
            Conforme a la <strong>Ley N.° 26.061 de Protección Integral de los Derechos de las Niñas, Niños
            y Adolescentes</strong>, los menores de 16 años requerirán autorización expresa de su padre,
            madre o tutor legal para registrarse en la plataforma.
          </p>
          <div class="sw-terms-law-ref">Ref. legal: Ley 26.061 — Protección de NNA Argentina</div>

          <!-- 9 -->
          <h3 class="sw-terms-section-title">9. Modificación de los Términos</h3>
          <p class="sw-terms-p">
            Spider-Web ARG se reserva el derecho de modificar estos Términos en cualquier momento.
            Los cambios serán notificados a través de la plataforma. Al continuar usando el servicio
            luego de dicha notificación, el usuario acepta los nuevos términos.
          </p>

          <!-- 10 -->
          <h3 class="sw-terms-section-title">10. Jurisdicción y Ley Aplicable</h3>
          <p class="sw-terms-p">
            Estos Términos y Condiciones se rigen por las leyes de la <strong>República Argentina</strong>.
            Para cualquier controversia derivada de la interpretación o ejecución del presente acuerdo,
            las partes se someten a la jurisdicción de los Tribunales Ordinarios de la Ciudad Autónoma
            de Buenos Aires, con renuncia expresa a cualquier otro fuero que pudiera corresponder.
          </p>
          <div class="sw-terms-law-ref">Ref. legal: Código Civil y Comercial de la Nación — Arts. 1 y 2</div>

        </div>

        <div class="sw-terms-footer-bar">
          <span class="sw-terms-footer-note">
            LEY 25.326 · LEY 24.240 · LEY 26.388 · LEY 11.723 — REPÚBLICA ARGENTINA
          </span>
          <button class="sw-terms-close-btn"
            onclick="document.getElementById('sw-terms-text-modal').classList.remove('open')">
            <i class="fa-solid fa-xmark" style="margin-right:5px;"></i>CERRAR
          </button>
        </div>

      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHtml);
}
