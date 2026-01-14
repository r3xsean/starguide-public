<script setup lang="ts">
import { ref, computed } from 'vue';
import type { User } from '../lib/supabase';
import type { SyncStatus } from '../composables/useCloudSync';

// ==================
// PROPS & EMITS
// ==================

interface Props {
  isOpen: boolean;
  user: User | null;
  syncStatus: SyncStatus;
  lastSyncAt: Date | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  close: [];
  signOut: [];
  deleteAccount: [];
  syncNow: [];
  exportData: [];
}>();

// ==================
// STATE
// ==================

const showDeleteConfirm = ref(false);
const isDeleting = ref(false);

// ==================
// COMPUTED
// ==================

const userEmail = computed(() => props.user?.email ?? 'Unknown');

const memberSince = computed(() => {
  if (!props.user?.created_at) return 'Unknown';
  const date = new Date(props.user.created_at);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
});

const lastSyncDisplay = computed(() => {
  if (!props.lastSyncAt) return 'Never';

  const now = new Date();
  const diff = now.getTime() - props.lastSyncAt.getTime();

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;

  return props.lastSyncAt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
});

const syncStatusIcon = computed(() => {
  switch (props.syncStatus) {
    case 'syncing':
      return 'syncing';
    case 'synced':
      return 'check';
    case 'error':
      return 'error';
    default:
      return 'idle';
  }
});

// ==================
// METHODS
// ==================

const handleClose = () => {
  showDeleteConfirm.value = false;
  emit('close');
};

const handleSignOut = () => {
  emit('signOut');
  handleClose();
};

const handleDeleteAccount = async () => {
  isDeleting.value = true;
  emit('deleteAccount');
  // The parent will handle the actual deletion and close the modal
};

const handleExportData = () => {
  emit('exportData');
};

const handleSyncNow = () => {
  emit('syncNow');
};
</script>

<template>
  <Teleport to="body">
    <Transition name="settings-fade">
      <div v-if="isOpen" class="settings-overlay">
        <div class="settings-backdrop" @click="handleClose"></div>

        <div class="settings-modal">
          <!-- Decorative elements -->
          <div class="modal-glow"></div>
          <div class="modal-border"></div>

          <!-- Content -->
          <div class="modal-content">
            <!-- Header -->
            <div class="settings-header">
              <div class="header-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path
                    d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
                  />
                  <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h2 class="header-title">Settings</h2>
              <button class="close-btn" @click="handleClose" aria-label="Close settings">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <!-- Account Section -->
            <section class="settings-section">
              <h3 class="section-title">Account</h3>

              <div class="info-row">
                <div class="info-label">Email</div>
                <div class="info-value">{{ userEmail }}</div>
              </div>

              <div class="info-row">
                <div class="info-label">Member since</div>
                <div class="info-value">{{ memberSince }}</div>
              </div>
            </section>

            <!-- Sync Section -->
            <section class="settings-section">
              <h3 class="section-title">Cloud Sync</h3>

              <div class="sync-status-row">
                <div class="sync-indicator" :class="syncStatusIcon">
                  <svg v-if="syncStatusIcon === 'syncing'" class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 12a9 9 0 11-6.219-8.56" />
                  </svg>
                  <svg v-else-if="syncStatusIcon === 'check'" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" />
                  </svg>
                  <svg v-else-if="syncStatusIcon === 'error'" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd" />
                  </svg>
                  <div v-else class="idle-dot"></div>
                </div>
                <div class="sync-info">
                  <div class="sync-label">
                    {{ syncStatus === 'syncing' ? 'Syncing...' : syncStatus === 'error' ? 'Sync error' : 'Synced' }}
                  </div>
                  <div class="sync-time">Last sync: {{ lastSyncDisplay }}</div>
                </div>
                <button
                  class="sync-btn"
                  @click="handleSyncNow"
                  :disabled="syncStatus === 'syncing'"
                >
                  Sync Now
                </button>
              </div>
            </section>

            <!-- Data Section -->
            <section class="settings-section">
              <h3 class="section-title">Data</h3>

              <button class="action-btn" @click="handleExportData">
                <svg viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
                  <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
                </svg>
                <span>Export Data</span>
                <span class="action-hint">Download your roster and settings as JSON</span>
              </button>
            </section>

            <!-- Actions Section -->
            <section class="settings-section">
              <h3 class="section-title">Session</h3>

              <button class="action-btn action-btn-secondary" @click="handleSignOut">
                <svg viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M3 4.25A2.25 2.25 0 015.25 2h5.5A2.25 2.25 0 0113 4.25v2a.75.75 0 01-1.5 0v-2a.75.75 0 00-.75-.75h-5.5a.75.75 0 00-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 00.75-.75v-2a.75.75 0 011.5 0v2A2.25 2.25 0 0110.75 18h-5.5A2.25 2.25 0 013 15.75V4.25z" clip-rule="evenodd" />
                  <path fill-rule="evenodd" d="M19 10a.75.75 0 00-.75-.75H8.704l1.048-.943a.75.75 0 10-1.004-1.114l-2.5 2.25a.75.75 0 000 1.114l2.5 2.25a.75.75 0 101.004-1.114l-1.048-.943h9.546A.75.75 0 0019 10z" clip-rule="evenodd" />
                </svg>
                <span>Sign Out</span>
                <span class="action-hint">Your data stays synced in the cloud</span>
              </button>
            </section>

            <!-- Danger Zone -->
            <section class="settings-section danger-zone">
              <h3 class="section-title">Danger Zone</h3>

              <div v-if="!showDeleteConfirm">
                <button class="action-btn action-btn-danger" @click="showDeleteConfirm = true">
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.519.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clip-rule="evenodd" />
                  </svg>
                  <span>Delete Account</span>
                  <span class="action-hint">Permanently delete your account and all data</span>
                </button>
              </div>

              <div v-else class="delete-confirm">
                <p class="delete-warning">
                  Are you sure? This will permanently delete your account and all synced data.
                  This action cannot be undone.
                </p>
                <div class="delete-actions">
                  <button class="cancel-btn" @click="showDeleteConfirm = false" :disabled="isDeleting">
                    Cancel
                  </button>
                  <button class="confirm-delete-btn" @click="handleDeleteAccount" :disabled="isDeleting">
                    {{ isDeleting ? 'Deleting...' : 'Yes, Delete' }}
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ==================
   OVERLAY
   ================== */

.settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 10001;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.settings-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(3, 3, 12, 0.85);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

/* ==================
   MODAL
   ================== */

.settings-modal {
  position: relative;
  width: 100%;
  max-width: 440px;
  max-height: calc(100vh - 2rem);
  border-radius: 1.25rem;
  overflow: hidden;
}

.modal-glow {
  position: absolute;
  inset: -2px;
  background: conic-gradient(
    from 0deg,
    rgba(249, 147, 7, 0.5) 0%,
    rgba(168, 85, 247, 0.3) 25%,
    rgba(249, 147, 7, 0.5) 50%,
    rgba(168, 85, 247, 0.3) 75%,
    rgba(249, 147, 7, 0.5) 100%
  );
  border-radius: 1.35rem;
  animation: rotateGlow 8s linear infinite;
  opacity: 0.7;
}

@keyframes rotateGlow {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.modal-border {
  position: absolute;
  inset: 2px;
  background: linear-gradient(145deg, rgba(20, 20, 45, 0.98) 0%, rgba(12, 12, 30, 0.98) 100%);
  border-radius: 1.15rem;
}

.modal-content {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 1.5rem;
  overflow-y: auto;
  max-height: calc(100vh - 2rem);
}

/* ==================
   HEADER
   ================== */

.settings-header {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  margin-bottom: 1.5rem;
}

.header-icon {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(249, 147, 7, 0.15) 0%, rgba(249, 147, 7, 0.05) 100%);
  border: 1px solid rgba(249, 147, 7, 0.25);
  border-radius: 0.75rem;
  flex-shrink: 0;
}

.header-icon svg {
  width: 24px;
  height: 24px;
  color: #f99307;
}

.header-title {
  flex: 1;
  font-family: var(--font-display, 'Orbitron', sans-serif);
  font-size: 1.25rem;
  font-weight: 700;
  color: white;
  margin: 0;
}

.close-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.close-btn svg {
  width: 16px;
  height: 16px;
  color: rgba(255, 255, 255, 0.5);
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.close-btn:hover svg {
  color: white;
}

/* ==================
   SECTIONS
   ================== */

.settings-section {
  margin-bottom: 1.5rem;
}

.settings-section:last-child {
  margin-bottom: 0;
}

.section-title {
  font-size: 0.6875rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin: 0 0 0.75rem 0;
  padding-left: 2px;
}

/* ==================
   INFO ROWS
   ================== */

.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.625rem 0.875rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 0.625rem;
  margin-bottom: 0.5rem;
}

.info-row:last-child {
  margin-bottom: 0;
}

.info-label {
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.6);
}

.info-value {
  font-size: 0.875rem;
  color: white;
  font-weight: 500;
}

/* ==================
   SYNC STATUS
   ================== */

.sync-status-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 0.875rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 0.625rem;
}

.sync-indicator {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  flex-shrink: 0;
}

.sync-indicator svg {
  width: 20px;
  height: 20px;
}

.sync-indicator.syncing {
  background: rgba(249, 147, 7, 0.1);
}

.sync-indicator.syncing svg {
  color: #f99307;
}

.sync-indicator.check {
  background: rgba(34, 197, 94, 0.1);
}

.sync-indicator.check svg {
  color: #22c55e;
}

.sync-indicator.error {
  background: rgba(239, 68, 68, 0.1);
}

.sync-indicator.error svg {
  color: #ef4444;
}

.sync-indicator.idle {
  background: rgba(255, 255, 255, 0.05);
}

.idle-dot {
  width: 8px;
  height: 8px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 50%;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.sync-info {
  flex: 1;
  min-width: 0;
}

.sync-label {
  font-size: 0.875rem;
  color: white;
  font-weight: 500;
}

.sync-time {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 2px;
}

.sync-btn {
  padding: 0.5rem 0.875rem;
  background: rgba(249, 147, 7, 0.1);
  border: 1px solid rgba(249, 147, 7, 0.3);
  border-radius: 0.5rem;
  color: #f99307;
  font-family: inherit;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.sync-btn:hover:not(:disabled) {
  background: rgba(249, 147, 7, 0.15);
  border-color: rgba(249, 147, 7, 0.4);
}

.sync-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ==================
   ACTION BUTTONS
   ================== */

.action-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.75rem;
  color: white;
  font-family: inherit;
  font-size: 0.9375rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
  position: relative;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.12);
}

.action-btn svg {
  width: 20px;
  height: 20px;
  color: rgba(255, 255, 255, 0.6);
  flex-shrink: 0;
}

.action-hint {
  position: absolute;
  right: 1rem;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.35);
  font-weight: 400;
}

.action-btn-secondary svg {
  color: rgba(249, 147, 7, 0.8);
}

.action-btn-danger {
  border-color: rgba(239, 68, 68, 0.2);
}

.action-btn-danger:hover {
  background: rgba(239, 68, 68, 0.08);
  border-color: rgba(239, 68, 68, 0.3);
}

.action-btn-danger svg {
  color: #ef4444;
}

/* ==================
   DANGER ZONE
   ================== */

.danger-zone {
  padding-top: 1rem;
  border-top: 1px solid rgba(239, 68, 68, 0.15);
}

.danger-zone .section-title {
  color: rgba(239, 68, 68, 0.6);
}

.delete-confirm {
  padding: 1rem;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 0.75rem;
}

.delete-warning {
  font-size: 0.875rem;
  color: #fca5a5;
  line-height: 1.5;
  margin: 0 0 1rem 0;
}

.delete-actions {
  display: flex;
  gap: 0.75rem;
}

.cancel-btn {
  flex: 1;
  padding: 0.625rem 1rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  color: rgba(255, 255, 255, 0.7);
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.cancel-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
}

.confirm-delete-btn {
  flex: 1;
  padding: 0.625rem 1rem;
  background: #ef4444;
  border: none;
  border-radius: 0.5rem;
  color: white;
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.confirm-delete-btn:hover:not(:disabled) {
  background: #dc2626;
}

.cancel-btn:disabled,
.confirm-delete-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ==================
   TRANSITIONS
   ================== */

.settings-fade-enter-active {
  transition: opacity 0.3s ease;
}

.settings-fade-enter-active .settings-modal {
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.settings-fade-leave-active {
  transition: opacity 0.2s ease;
}

.settings-fade-leave-active .settings-modal {
  transition: all 0.2s ease;
}

.settings-fade-enter-from {
  opacity: 0;
}

.settings-fade-enter-from .settings-modal {
  opacity: 0;
  transform: scale(0.95) translateY(10px);
}

.settings-fade-leave-to {
  opacity: 0;
}

.settings-fade-leave-to .settings-modal {
  opacity: 0;
  transform: scale(0.98);
}

/* ==================
   RESPONSIVE
   ================== */

@media (max-width: 480px) {
  .settings-modal {
    max-width: 100%;
  }

  .modal-content {
    padding: 1.25rem;
  }

  .action-hint {
    display: none;
  }

  .sync-status-row {
    flex-wrap: wrap;
  }

  .sync-btn {
    width: 100%;
    margin-top: 0.5rem;
  }
}
</style>
