<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  changelog,
  currentVersion,
  getEntriesSinceVersion,
  type ChangelogVersion,
  type ChangelogEntryType,
} from '../data/changelog';
import {
  registerModal,
  requestShow,
  shouldShow,
  markClosed,
  MODAL_CHECK_DELAY,
  isModalTestingEnabled,
} from '../utils/modalQueue';

// ==================
// CONSTANTS
// ==================

const MODAL_ID = 'changelog' as const;
const LAST_SEEN_VERSION_KEY = 'starguide_changelog_last_seen_version';
const FIRST_VISIT_KEY = 'starguide_first_visit_ts';

// ==================
// STATE
// ==================

const isReady = ref(false);
const newVersions = ref<ChangelogVersion[]>([]);

// Use queue system for visibility
const isVisible = computed(() => isReady.value && shouldShow(MODAL_ID));

// ==================
// COMPUTED
// ==================

const hasEntries = computed(() => newVersions.value.length > 0);

const totalEntryCount = computed(() => {
  return newVersions.value.reduce((sum, v) => sum + v.entries.length, 0);
});

// ==================
// METHODS
// ==================

const getEntryIcon = (type: ChangelogEntryType): string => {
  switch (type) {
    case 'feature': return '✨';
    case 'improvement': return '⚡';
    case 'fix': return '🐛';
    case 'content': return '📦';
    default: return '✦';
  }
};

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const todayStr = today.toISOString().split('T')[0];
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  if (dateStr === todayStr) {
    return 'Today';
  }
  if (dateStr === yesterdayStr) {
    return 'Yesterday';
  }

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const isFirstVisit = (): boolean => {
  return !localStorage.getItem(FIRST_VISIT_KEY);
};

const markFirstVisit = () => {
  if (!localStorage.getItem(FIRST_VISIT_KEY)) {
    localStorage.setItem(FIRST_VISIT_KEY, Date.now().toString());
  }
};

const getLastSeenVersion = (): string | null => {
  return localStorage.getItem(LAST_SEEN_VERSION_KEY);
};

const setLastSeenVersion = (version: string) => {
  localStorage.setItem(LAST_SEEN_VERSION_KEY, version);
};

const checkShouldShow = (): boolean => {
  // No changelog entries
  if (changelog.length === 0) {
    return false;
  }

  // First visit ever - mark and don't show
  if (isFirstVisit()) {
    markFirstVisit();
    setLastSeenVersion(currentVersion);
    return false;
  }

  // Check for new versions
  const lastVersion = getLastSeenVersion();
  const versions = getEntriesSinceVersion(lastVersion);

  if (versions.length === 0) {
    return false;
  }

  newVersions.value = versions;
  return true;
};

const dismiss = () => {
  isReady.value = false;
  markClosed(MODAL_ID);
  // Update last seen version when dismissing
  setLastSeenVersion(currentVersion);
};

// ==================
// LIFECYCLE
// ==================

onMounted(() => {
  // Register with modal queue
  registerModal(MODAL_ID);

  // Testing mode: always show with current changelog data
  if (isModalTestingEnabled()) {
    const today = new Date().toISOString().split('T')[0] ?? '2024-01-01';
    newVersions.value = changelog.length > 0 ? changelog : [{
      version: 'test',
      date: today,
      entries: [
        { type: 'feature' as const, text: 'Test changelog entry for modal testing' },
      ],
    }];
    setTimeout(() => {
      isReady.value = true;
      requestShow(MODAL_ID);
    }, MODAL_CHECK_DELAY);
    return;
  }

  // Wait for initial load, then check if we should show
  setTimeout(() => {
    // Don't show if onboarding is active (new user)
    const onboardingComplete = localStorage.getItem('starguide_onboarding_complete');
    const isMobile = window.innerWidth < 768;

    // On desktop, if onboarding not complete, it's probably showing - don't interrupt
    if (!isMobile && !onboardingComplete) {
      // Still update the last seen version so they see it next time
      setLastSeenVersion(currentVersion);
      return;
    }

    if (checkShouldShow()) {
      isReady.value = true;
      requestShow(MODAL_ID);
    }
  }, MODAL_CHECK_DELAY);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="changelog-fade">
      <div v-if="isVisible && hasEntries" class="changelog-overlay">
        <div class="changelog-backdrop" @click="dismiss"></div>

        <div class="changelog-modal">
          <!-- Decorative elements -->
          <div class="modal-glow"></div>
          <div class="modal-border"></div>

          <!-- Content -->
          <div class="modal-content">
            <!-- Header -->
            <div class="changelog-header">
              <div class="header-icon">
                <span>✨</span>
              </div>
              <div class="header-text">
                <h2 class="header-title">What's New</h2>
                <p class="header-subtitle">{{ totalEntryCount }} update{{ totalEntryCount !== 1 ? 's' : '' }} since your last visit</p>
              </div>
              <button class="close-btn" @click="dismiss" aria-label="Close changelog">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <!-- Changelog entries -->
            <div class="changelog-content">
              <div
                v-for="version in newVersions"
                :key="version.version"
                class="version-group"
              >
                <div class="version-header">
                  <span class="version-badge">v{{ version.version }}</span>
                  <span class="version-date">{{ formatDate(version.date) }}</span>
                  <div class="version-line"></div>
                </div>

                <div class="entries-list">
                  <div
                    v-for="(entry, index) in version.entries"
                    :key="index"
                    class="entry-item"
                    :style="{ '--entry-delay': `${index * 0.05}s` }"
                  >
                    <span class="entry-icon">{{ getEntryIcon(entry.type) }}</span>
                    <span class="entry-message">{{ entry.text }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Footer -->
            <div class="changelog-footer">
              <button class="got-it-btn" @click="dismiss">
                Got it!
              </button>
            </div>
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

.changelog-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.changelog-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(3, 3, 12, 0.85);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

/* ==================
   MODAL
   ================== */

.changelog-modal {
  position: relative;
  width: 100%;
  max-width: 480px;
  max-height: calc(100vh - 4rem);
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
  max-height: calc(100vh - 4rem);
}

/* ==================
   HEADER
   ================== */

.changelog-header {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1.5rem 1.5rem 1rem;
  flex-shrink: 0;
}

.header-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(249, 147, 7, 0.2) 0%, rgba(249, 147, 7, 0.1) 100%);
  border: 1px solid rgba(249, 147, 7, 0.3);
  border-radius: 12px;
  font-size: 1.5rem;
  flex-shrink: 0;
  animation: iconPulse 2s ease-in-out infinite;
}

@keyframes iconPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

.header-text {
  flex: 1;
  min-width: 0;
}

.header-title {
  font-family: var(--font-display, 'Exo 2', sans-serif);
  font-size: 1.375rem;
  font-weight: 700;
  color: white;
  margin: 0 0 0.25rem 0;
  background: linear-gradient(135deg, #ffffff 0%, rgba(249, 147, 7, 0.9) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.header-subtitle {
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.5);
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
   CONTENT
   ================== */

.changelog-content {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem 1.5rem 1rem;
  max-height: 400px;
}

.changelog-content::-webkit-scrollbar {
  width: 6px;
}

.changelog-content::-webkit-scrollbar-track {
  background: transparent;
}

.changelog-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

.changelog-content::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}

/* ==================
   VERSION GROUPS
   ================== */

.version-group {
  margin-bottom: 1.25rem;
}

.version-group:last-child {
  margin-bottom: 0;
}

.version-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.version-badge {
  font-size: 0.75rem;
  font-weight: 700;
  font-family: var(--font-mono, monospace);
  color: #f99307;
  background: rgba(249, 147, 7, 0.15);
  padding: 0.25rem 0.5rem;
  border-radius: 0.375rem;
  border: 1px solid rgba(249, 147, 7, 0.3);
}

.version-date {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
}

.version-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, rgba(249, 147, 7, 0.3) 0%, transparent 100%);
}

/* ==================
   ENTRIES
   ================== */

.entries-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.entry-item {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.625rem 0.875rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 0.625rem;
  animation: entrySlide 0.3s ease-out both;
  animation-delay: var(--entry-delay, 0s);
}

@keyframes entrySlide {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.entry-icon {
  font-size: 1rem;
  line-height: 1.4;
  flex-shrink: 0;
}

.entry-message {
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.85);
  line-height: 1.4;
}

/* ==================
   FOOTER
   ================== */

.changelog-footer {
  padding: 1rem 1.5rem 1.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  flex-shrink: 0;
}

.got-it-btn {
  width: 100%;
  padding: 0.875rem 1.25rem;
  border-radius: 0.75rem;
  border: none;
  background: linear-gradient(135deg, #f99307 0%, #dd6d02 100%);
  color: white;
  font-family: inherit;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 12px rgba(249, 147, 7, 0.25);
}

.got-it-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(249, 147, 7, 0.35);
}

.got-it-btn:active {
  transform: translateY(0);
}

/* ==================
   TRANSITIONS
   ================== */

.changelog-fade-enter-active {
  transition: opacity 0.3s ease;
}

.changelog-fade-enter-active .changelog-modal {
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.changelog-fade-leave-active {
  transition: opacity 0.2s ease;
}

.changelog-fade-leave-active .changelog-modal {
  transition: all 0.2s ease;
}

.changelog-fade-enter-from {
  opacity: 0;
}

.changelog-fade-enter-from .changelog-modal {
  opacity: 0;
  transform: scale(0.95) translateY(10px);
}

.changelog-fade-leave-to {
  opacity: 0;
}

.changelog-fade-leave-to .changelog-modal {
  opacity: 0;
  transform: scale(0.98);
}

/* ==================
   RESPONSIVE
   ================== */

@media (max-width: 480px) {
  .changelog-modal {
    max-width: 100%;
    max-height: calc(100vh - 2rem);
  }

  .changelog-header {
    padding: 1.25rem 1.25rem 0.75rem;
    gap: 0.875rem;
  }

  .header-icon {
    width: 40px;
    height: 40px;
    font-size: 1.25rem;
  }

  .header-title {
    font-size: 1.25rem;
  }

  .changelog-content {
    padding: 0.5rem 1.25rem 1rem;
    max-height: 300px;
  }

  .changelog-footer {
    padding: 1rem 1.25rem 1.25rem;
  }
}
</style>
