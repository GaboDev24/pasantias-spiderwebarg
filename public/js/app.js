/**
 * Lógica global de la aplicación
 * Maneja: Auth state, Navbar scroll, Theme toggle, Hamburger menu, Toasts
 */

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setupNavbar();
  checkAuthState();
  setupHamburger();
});

/* ═══════════════════════════════════════
   TEMA CLARO / OSCURO
═══════════════════════════════════════ */
function initTheme() {
  const saved = localStorage.getItem('sw_theme') || 'dark';
  applyTheme(saved, false);
  // Actualizar ícono una vez el DOM esté listo
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.innerHTML = saved === 'light' ? '<i class="fa-solid fa-moon"></i>' : '<i class="fa-solid fa-sun"></i>';
}

function applyTheme(theme, save = true) {
  if (theme === 'light') {
    document.documentElement.classList.add('light-mode');
  } else {
    document.documentElement.classList.remove('light-mode');
  }
  if (save) localStorage.setItem('sw_theme', theme);
  // Actualizar ícono del botón
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.innerHTML = theme === 'light' ? '<i class="fa-solid fa-moon"></i>' : '<i class="fa-solid fa-sun"></i>';
  
  // Cambiar logo
  const logos = document.querySelectorAll('img[src*="logo blanco.png"], img[src*="logo negro.png"]');
  logos.forEach(img => {
    img.src = theme === 'light' ? '/img/logo negro.png' : '/img/logo blanco.png';
  });
}

function toggleTheme() {
  const current = localStorage.getItem('sw_theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

/* ═══════════════════════════════════════
   NAVBAR SCROLL
═══════════════════════════════════════ */
function setupNavbar() {
  const nav = document.querySelector('.sw-nav');
  if (!nav) return;

  // Siempre scrolled si la clase ya está presente (páginas internas)
  if (nav.classList.contains('scrolled')) return;

  function onScroll() {
    if (window.scrollY > 20) nav.classList.add('scrolled');
    else nav.classList.remove('scrolled');
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ═══════════════════════════════════════
   HAMBURGUESA
═══════════════════════════════════════ */
function setupHamburger() {
  const hamburger = document.getElementById('sw-hamburger');
  const links = document.querySelector('.sw-nav__links');
  if (!hamburger || !links) return;

  hamburger.addEventListener('click', () => {
    const isOpen = links.classList.toggle('open');
    hamburger.classList.toggle('open', isOpen);
    hamburger.setAttribute('aria-expanded', isOpen);
  });

  // Cerrar al hacer click en un link
  links.querySelectorAll('.sw-nav__link').forEach(link => {
    link.addEventListener('click', () => {
      links.classList.remove('open');
      hamburger.classList.remove('open');
    });
  });

  // Cerrar al hacer click fuera
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.sw-nav')) {
      links.classList.remove('open');
      hamburger.classList.remove('open');
    }
  });
}

/* ═══════════════════════════════════════
   AUTH STATE
═══════════════════════════════════════ */
function checkAuthState() {
  const token = localStorage.getItem('sw_token');
  const userStr = localStorage.getItem('sw_user');

  const guestLinks  = document.querySelectorAll('.guest-only');
  const authLinks   = document.querySelectorAll('.auth-only');
  const adminLinks  = document.querySelectorAll('.admin-only');

  if (token && userStr) {
    let user;
    try { user = JSON.parse(userStr); } catch (_) { return; }

    guestLinks.forEach(el => el.style.display = 'none');
    authLinks.forEach(el  => el.style.display = 'inline-flex');

    if (user.role === 'admin' || user.role === 'ceo') {
      adminLinks.forEach(el => el.style.display = 'inline-flex');
    } else {
      adminLinks.forEach(el => el.style.display = 'none');
    }
  } else {
    guestLinks.forEach(el  => el.style.display = 'inline-flex');
    authLinks.forEach(el   => el.style.display = 'none');
    adminLinks.forEach(el  => el.style.display = 'none');
  }
}

/* ═══════════════════════════════════════
   LOGOUT
═══════════════════════════════════════ */
function logout() {
  localStorage.removeItem('sw_token');
  localStorage.removeItem('sw_user');
  window.location.href = '/';
}

/* ═══════════════════════════════════════
   TOAST NOTIFICATIONS
═══════════════════════════════════════ */
function showToast(message, isError = false) {
  // Eliminar toasts anteriores
  document.querySelectorAll('.sw-toast').forEach(t => t.remove());

  const toast = document.createElement('div');
  toast.className = 'sw-toast';
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    zIndex: '99999',
    maxWidth: '320px',
    fontFamily: 'var(--sw-font-m)',
    fontSize: '0.75rem',
    letterSpacing: '0.06em',
    padding: '0.75rem 1rem',
    border: `1px solid ${isError ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
    background: `var(--sw-dark)`,
    color: isError ? '#f87171' : '#4ade80',
    boxShadow: `0 4px 24px ${isError ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)'}`,
    clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))',
    transition: 'opacity 0.3s',
    opacity: '1',
  });
  toast.innerText = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Global scope
window.app = { logout, showToast, checkAuthState, toggleTheme };
