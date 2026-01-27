<script setup lang="ts">
import { ref, computed } from 'vue';
import type { User } from '../lib/supabase';
import type { SyncStatus } from '../composables/useCloudSync';

// ==================
// PROPS & EMITS
// ==================

interface Props {
  user: User | null;
  isLoading: boolean;
  syncStatus: SyncStatus;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  openAuth: [];
  openSettings: [];
  signOut: [];
}>();

// ==================
// STATE
// ==================

const isDropdownOpen = ref(false);

// ==================
// COMPUTED
// ==================

const isAuthenticated = computed(() => !!props.user);

const userInitial = computed(() => {
  if (!props.user?.email) return '?';
  return props.user.email.charAt(0).toUpperCase();
});

const userEmail = computed(() => props.user?.email ?? '');

const truncatedEmail = computed(() => {
  const email = userEmail.value;
  if (email.length <= 20) return email;
  return email.substring(0, 17) + '...';
});

const syncStatusClass = computed(() => {
  switch (props.syncStatus) {
    case 'syncing':
      return 'syncing';
    case 'synced':
      return 'synced';
    case 'error':
      return 'error';
    default:
      return '';
  }
});

// ==================
// METHODS
// ==================

const handleClick = () => {
  if (props.isLoading) return;

  if (isAuthenticated.value) {
    isDropdownOpen.value = !isDropdownOpen.value;
  } else {
    emit('openAuth');
  }
};

const handleOpenSettings = () => {
  isDropdownOpen.value = false;
  emit('openSettings');
};

const handleSignOut = () => {
  isDropdownOpen.value = false;
  emit('signOut');
};

const handleClickOutside = () => {
  isDropdownOpen.value = false;
};
</script>

<template>
  <div class="user-button-wrapper" v-click-outside="handleClickOutside">
    <!-- Guest State: Sign In Button -->
    <button
      v-if="!isAuthenticated && !isLoading"
      class="sign-in-btn"
      @click="handleClick"
    >
      <svg viewBox="0 0 20 20" fill="currentColor">
        <path
          d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z"
        />
      </svg>
      <span>Sign In</span>
    </button>

    <!-- Loading State -->
    <div v-else-if="isLoading" class="loading-state">
      <div class="loading-spinner"></div>
    </div>

    <!-- Authenticated State: Avatar with Dropdown -->
    <div v-else class="authenticated-wrapper">
      <button class="avatar-btn" @click="handleClick" :class="{ active: isDropdownOpen }">
        <div class="avatar" :class="syncStatusClass">
          <span class="avatar-initial">{{ userInitial }}</span>
          <div class="sync-dot" :class="syncStatusClass"></div>
        </div>
        <svg class="chevron" :class="{ rotated: isDropdownOpen }" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
        </svg>
      </button>

      <!-- Dropdown Menu -->
      <Transition name="dropdown">
        <div v-if="isDropdownOpen" class="dropdown-menu">
          <div class="dropdown-header">
            <div class="dropdown-email">{{ truncatedEmail }}</div>
            <div class="dropdown-status" :class="syncStatusClass">
              <span v-if="syncStatus === 'syncing'">Syncing...</span>
              <span v-else-if="syncStatus === 'synced'">Synced</span>
              <span v-else-if="syncStatus === 'error'">Sync error</span>
              <span v-else>Ready</span>
            </div>
          </div>

          <div class="dropdown-divider"></div>

          <button class="dropdown-item" @click="handleOpenSettings">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.331 1.652a6.993 6.993 0 011.929 1.115l1.598-.54a1 1 0 011.186.447l1.18 2.044a1 1 0 01-.205 1.251l-1.267 1.113a7.047 7.047 0 010 2.228l1.267 1.113a1 1 0 01.206 1.25l-1.18 2.045a1 1 0 01-1.187.447l-1.598-.54a6.993 6.993 0 01-1.929 1.115l-.33 1.652a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.331-1.652a6.993 6.993 0 01-1.929-1.115l-1.598.54a1 1 0 01-1.186-.447l-1.18-2.044a1 1 0 01.205-1.251l1.267-1.114a7.05 7.05 0 010-2.227L1.821 7.773a1 1 0 01-.206-1.25l1.18-2.045a1 1 0 011.187-.447l1.598.54A6.993 6.993 0 017.51 3.456l.33-1.652zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" />
            </svg>
            <span>Settings</span>
          </button>

          <button class="dropdown-item" @click="handleSignOut">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M3 4.25A2.25 2.25 0 015.25 2h5.5A2.25 2.25 0 0113 4.25v2a.75.75 0 01-1.5 0v-2a.75.75 0 00-.75-.75h-5.5a.75.75 0 00-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 00.75-.75v-2a.75.75 0 011.5 0v2A2.25 2.25 0 0110.75 18h-5.5A2.25 2.25 0 013 15.75V4.25z" clip-rule="evenodd" />
              <path fill-rule="evenodd" d="M19 10a.75.75 0 00-.75-.75H8.704l1.048-.943a.75.75 0 10-1.004-1.114l-2.5 2.25a.75.75 0 000 1.114l2.5 2.25a.75.75 0 101.004-1.114l-1.048-.943h9.546A.75.75 0 0019 10z" clip-rule="evenodd" />
            </svg>
            <span>Sign Out</span>
          </button>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script lang="ts">
// Custom directive for click outside
export default {
  directives: {
    'click-outside': {
      mounted(el: HTMLElement, binding: { value: () => void }) {
        const handler = (event: MouseEvent) => {
          if (!(el === event.target || el.contains(event.target as Node))) {
            binding.value();
          }
        };
        el._clickOutside = handler;
        document.addEventListener('click', handler);
      },
      unmounted(el: HTMLElement) {
        if (el._clickOutside) {
          document.removeEventListener('click', el._clickOutside);
        }
      },
    },
  },
};

declare global {
  interface HTMLElement {
    _clickOutside?: (event: MouseEvent) => void;
  }
}
</script>

<style scoped>
.user-button-wrapper {
  position: relative;
}

/* ==================
   SIGN IN BUTTON
   ================== */

.sign-in-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.875rem;
  background: linear-gradient(135deg, rgba(249, 147, 7, 0.15) 0%, rgba(249, 147, 7, 0.1) 100%);
  border: 1px solid rgba(249, 147, 7, 0.3);
  border-radius: 0.625rem;
  color: #f99307;
  font-family: inherit;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.sign-in-btn:hover {
  background: linear-gradient(135deg, rgba(249, 147, 7, 0.2) 0%, rgba(249, 147, 7, 0.15) 100%);
  border-color: rgba(249, 147, 7, 0.4);
  transform: translateY(-1px);
}

.sign-in-btn svg {
  width: 16px;
  height: 16px;
}

/* ==================
   LOADING STATE
   ================== */

.loading-state {
  padding: 0.5rem;
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid rgba(249, 147, 7, 0.2);
  border-top-color: #f99307;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ==================
   AVATAR BUTTON
   ================== */

.authenticated-wrapper {
  position: relative;
}

.avatar-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem;
  padding-right: 0.5rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 2rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.avatar-btn:hover,
.avatar-btn.active {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.15);
}

.avatar {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f99307 0%, #dd6d02 100%);
  border-radius: 50%;
  position: relative;
}

.avatar-initial {
  font-size: 0.75rem;
  font-weight: 600;
  color: white;
}

.sync-dot {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid rgba(12, 12, 30, 1);
  background: rgba(255, 255, 255, 0.3);
}

.sync-dot.syncing {
  background: #f99307;
  animation: pulse 1s ease-in-out infinite;
}

.sync-dot.synced {
  background: #22c55e;
}

.sync-dot.error {
  background: #ef4444;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.chevron {
  width: 14px;
  height: 14px;
  color: rgba(255, 255, 255, 0.5);
  transition: transform 0.2s ease;
}

.chevron.rotated {
  transform: rotate(180deg);
}

/* ==================
   DROPDOWN MENU
   ================== */

.dropdown-menu {
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  width: 200px;
  background: linear-gradient(145deg, rgba(20, 20, 50, 0.98) 0%, rgba(12, 12, 30, 0.98) 100%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.75rem;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  z-index: 100;
}

.dropdown-header {
  padding: 0.75rem 1rem;
}

.dropdown-email {
  font-size: 0.8125rem;
  color: white;
  font-weight: 500;
  margin-bottom: 0.25rem;
}

.dropdown-status {
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.4);
}

.dropdown-status.syncing {
  color: #f99307;
}

.dropdown-status.synced {
  color: #22c55e;
}

.dropdown-status.error {
  color: #ef4444;
}

.dropdown-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
}

.dropdown-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.625rem 1rem;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  font-family: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
}

.dropdown-item:hover {
  background: rgba(255, 255, 255, 0.05);
  color: white;
}

.dropdown-item svg {
  width: 16px;
  height: 16px;
  color: rgba(255, 255, 255, 0.5);
}

.dropdown-item:hover svg {
  color: rgba(255, 255, 255, 0.7);
}

/* ==================
   TRANSITIONS
   ================== */

.dropdown-enter-active {
  transition: all 0.2s ease;
}

.dropdown-leave-active {
  transition: all 0.15s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.95);
}
</style>
