/**
 * Lógica global de la aplicación (Navbar, Auth state, Notificaciones)
 */

document.addEventListener('DOMContentLoaded', () => {
  setupNavbar();
  checkAuthState();
});

function setupNavbar() {
  const nav = document.querySelector('.sw-nav');
  if (nav) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 20) nav.classList.add('scrolled');
      else nav.classList.remove('scrolled');
    });
  }
}

function checkAuthState() {
  const token = localStorage.getItem('sw_token');
  const userStr = localStorage.getItem('sw_user');
  
  const guestLinks = document.querySelectorAll('.guest-only');
  const authLinks = document.querySelectorAll('.auth-only');
  const adminLinks = document.querySelectorAll('.admin-only');

  if (token && userStr) {
    const user = JSON.parse(userStr);
    
    guestLinks.forEach(el => el.style.display = 'none');
    authLinks.forEach(el => el.style.display = 'inline-flex');
    
    if (user.role === 'admin' || user.role === 'ceo') {
      adminLinks.forEach(el => el.style.display = 'inline-flex');
    } else {
      adminLinks.forEach(el => el.style.display = 'none');
    }
  } else {
    guestLinks.forEach(el => el.style.display = 'inline-flex');
    authLinks.forEach(el => el.style.display = 'none');
    adminLinks.forEach(el => el.style.display = 'none');
  }
}

function logout() {
  localStorage.removeItem('sw_token');
  localStorage.removeItem('sw_user');
  window.location.href = '/index.html';
}

function showToast(message, isError = false) {
  const toast = document.createElement('div');
  toast.className = `sw-alert ${isError ? '' : 'sw-alert--success'}`;
  toast.style.position = 'fixed';
  toast.style.bottom = '20px';
  toast.style.right = '20px';
  toast.style.zIndex = '99999';
  toast.style.maxWidth = '300px';
  toast.innerText = message;

  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Global scope
window.app = { logout, showToast, checkAuthState };
