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
};

/* ═══════════════════════════════════════
   TERMS AND CONDITIONS MODAL
═══════════════════════════════════════ */
function showTermsModal() {
  if (document.getElementById("sw-terms-modal")) return;

  const modalHtml = `
    <div id="sw-terms-modal" class="sw-modal-overlay open" style="z-index: 999;display: flex;position: fixed;height: 100%;width: 100%;justify-content: center;align-items: center;">
      <div class="sw-modal" style="
    height: fit-content;
    width: 80%;
    padding: 4rem 2rem;
    background: #8c4343;
    border-radius: 2rem;
    border: #eee 2px solid;
">
        <div class="sw-modal-header" style="
    display: flex;
    justify-content: center;
">
          <div class="sw-auth-dot r"></div>
          <div class="sw-auth-dot y"></div>
          <div class="sw-auth-dot g"></div>
          <span style="margin-left: 10px; font-family: var(--sw-font-m); font-size: 0.6rem; color: rgba(163,0,0,0.8); letter-spacing: 0.2em;">ACCIÓN REQUERIDA</span>
        </div>
        <div class="sw-modal-body" style="text-align: center;">
          <h3 style="font-family: var(--sw-font-h); font-size: 1.5rem; color: var(--sw-white); margin-bottom: 1rem; text-transform: uppercase;">Actualización de Términos</h3>
          <p style="font-family: var(--sw-font-r); font-size: 0.9rem; color: var(--sw-text-muted); margin-bottom: 1.5rem; line-height: 1.5;">
            Hemos actualizado nuestros <a href="#" onclick="window.app.openTermsTextModal(event)" style="color: var(--sw-red); text-decoration: none; font-weight: bold;">Términos y Condiciones</a>. Debes aceptarlos para continuar utilizando la plataforma Spider-Web ARG.
          </p>
          <div style="display: flex; gap: 10px; justify-content: center;">
            <button onclick="window.app.logout()" class="sw-btn" style="background: transparent; border: 1px solid var(--sw-border);">CANCELAR Y SALIR</button>
            <button id="btn-accept-terms" onclick="window.app.acceptTerms()" class="sw-btn sw-btn--primary">ACEPTAR TÉRMINOS</button>
          </div>
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
  if (document.getElementById("sw-terms-text-modal")) {
    document.getElementById("sw-terms-text-modal").classList.add("open");
    return;
  }

  const modalHtml = `
    <div id="sw-terms-text-modal" class="sw-modal-overlay open" style="z-index: 20; display: flex;" onclick="if(event.target===this) this.classList.remove('open')">
      <div class="sw-modal" style="max-width: 800px; width: 90%; max-height: 80vh; overflow-y: auto;">
        <div class="sw-modal-header" style="justify-content: space-between;">
          <div style="display:flex; align-items:center;">
            <div class="sw-auth-dot r"></div>
            <div class="sw-auth-dot y"></div>
            <div class="sw-auth-dot g"></div>
            <span style="margin-left: 10px; font-family: var(--sw-font-m); font-size: 0.6rem; color: rgba(163,0,0,0.8); letter-spacing: 0.2em;">INFORMACIÓN LEGAL</span>
          </div>
          <button onclick="document.getElementById('sw-terms-text-modal').classList.remove('open')" style="background:none; border:none; color:var(--sw-white); cursor:pointer;"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="sw-modal-body" style="text-align: left; padding: 20px;">
          <h3 style="font-family: var(--sw-font-h); font-size: 1.5rem; color: var(--sw-white); margin-bottom: 1rem; text-transform: uppercase;">Términos y Condiciones</h3>
          <p style="font-family: var(--sw-font-r); font-size: 0.95rem; color: var(--sw-text-muted); line-height: 1.6; margin-bottom: 1rem;">
            Al acceder o utilizar la plataforma de Spider-Web ARG, aceptas estar sujeto a estos términos y condiciones de uso. Si no estás de acuerdo con alguna parte de los términos, no podrás acceder al servicio.
          </p>
          <h4 style="font-family: var(--sw-font-h); font-size: 1.1rem; color: var(--sw-white); margin-bottom: 0.5rem;">2. Uso de la plataforma</h4>
          <p style="font-family: var(--sw-font-r); font-size: 0.95rem; color: var(--sw-text-muted); line-height: 1.6; margin-bottom: 1rem;">
            Como pasante, te comprometes a utilizar la plataforma únicamente para fines legítimos y de manera que no infrinja los derechos de, restrinja o inhiba el uso y disfrute de la plataforma por parte de cualquier tercero.
          </p>
          <h4 style="font-family: var(--sw-font-h); font-size: 1.1rem; color: var(--sw-white); margin-bottom: 0.5rem;">3. Privacidad y Datos</h4>
          <p style="font-family: var(--sw-font-r); font-size: 0.95rem; color: var(--sw-text-muted); line-height: 1.6; margin-bottom: 1rem;">
            Tu privacidad es importante para nosotros. Cualquier información personal que proporciones será tratada de acuerdo con nuestras políticas internas, garantizando la confidencialidad de tus datos.
          </p>
          <h4 style="font-family: var(--sw-font-h); font-size: 1.1rem; color: var(--sw-white); margin-bottom: 0.5rem;">4. Modificaciones</h4>
          <p style="font-family: var(--sw-font-r); font-size: 0.95rem; color: var(--sw-text-muted); line-height: 1.6; margin-bottom: 0;">
            Nos reservamos el derecho de modificar o reemplazar estos términos en cualquier momento. Al continuar accediendo o utilizando nuestro servicio después de que esas revisiones se vuelvan efectivas, aceptas estar sujeto a los términos revisados.
          </p>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHtml);
}
