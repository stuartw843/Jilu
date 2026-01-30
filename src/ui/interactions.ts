/**
 * UI Interactions Module
 * Handles sidebar toggle, toast notifications, and button feedback states
 */

// Sidebar toggle functionality
export function initializeSidebarToggle(): void {
  const sidebar = document.querySelector('.sidebar');
  const toggleBtn = document.getElementById('sidebar-toggle-btn');
  
  if (!sidebar || !toggleBtn) return;
  
  // Load saved state
  const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
  if (isCollapsed) {
    sidebar.classList.add('collapsed');
    toggleBtn.querySelector('span')!.textContent = '→';
  }
  
  toggleBtn.addEventListener('click', () => {
    const isCurrentlyCollapsed = sidebar.classList.toggle('collapsed');
    toggleBtn.querySelector('span')!.textContent = isCurrentlyCollapsed ? '→' : '←';
    localStorage.setItem('sidebarCollapsed', String(isCurrentlyCollapsed));
  });
}

// Toast notification system
interface ToastOptions {
  type?: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
  icon?: string;
}

export function showToast(message: string, options: ToastOptions = {}): void {
  const {
    type = 'info',
    duration = 3000,
    icon = getDefaultIcon(type)
  } = options;
  
  const container = document.getElementById('toast-container');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-message">${message}</span>
    <button class="toast-close" aria-label="Close notification">×</button>
  `;
  
  container.appendChild(toast);
  
  // Close button handler
  const closeBtn = toast.querySelector('.toast-close');
  closeBtn?.addEventListener('click', () => removeToast(toast));
  
  // Auto-remove after duration
  if (duration > 0) {
    setTimeout(() => removeToast(toast), duration);
  }
}

function getDefaultIcon(type: string): string {
  const icons: Record<string, string> = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
    warning: '⚠'
  };
  return icons[type] || 'ℹ';
}

function removeToast(toast: HTMLElement): void {
  toast.classList.add('toast-exit');
  setTimeout(() => toast.remove(), 300);
}

// Button feedback states
export function setButtonLoading(button: HTMLButtonElement, loading: boolean): void {
  if (loading) {
    button.classList.add('is-loading');
    button.disabled = true;
  } else {
    button.classList.remove('is-loading');
    button.disabled = false;
  }
}

export function showButtonSuccess(button: HTMLButtonElement): void {
  button.classList.add('is-success');
  setTimeout(() => {
    button.classList.remove('is-success');
  }, 1500);
}

export function showButtonError(button: HTMLButtonElement): void {
  button.classList.add('is-error');
  setTimeout(() => {
    button.classList.remove('is-error');
  }, 1500);
}

// Auto-save indicator
export function showAutoSaveIndicator(state: 'saving' | 'saved' | 'error'): void {
  const indicator = document.getElementById('auto-save-indicator');
  const text = document.getElementById('auto-save-text');
  
  if (!indicator || !text) return;
  
  indicator.className = `auto-save-indicator ${state}`;
  
  const messages: Record<string, string> = {
    saving: 'Saving...',
    saved: 'Saved',
    error: 'Save failed'
  };
  
  text.textContent = messages[state];
  
  if (state === 'saved') {
    setTimeout(() => {
      indicator.classList.remove('saved');
    }, 2000);
  }
}
