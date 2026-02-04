<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { getCompletedFeedback, markFeedbackSeen, type CompletedFeedback } from '../lib/supabase';
import {
  registerModal,
  requestShow,
  shouldShow,
  markClosed,
  MODAL_CHECK_DELAY,
  isModalTestingEnabled,
} from '../utils/modalQueue';

const MODAL_ID = 'feedback-notification' as const;

const notifications = ref<CompletedFeedback[]>([]);
const currentIndex = ref(0);
const isReady = ref(false);
const isDismissing = ref(false);

// Use queue system for visibility
const isVisible = computed(() => isReady.value && shouldShow(MODAL_ID));

const current = computed<CompletedFeedback | null>(() =>
  notifications.value[currentIndex.value] ?? null
);

const typeLabels: Record<string, { label: string; icon: string }> = {
  suggestion: { label: 'Suggestion', icon: '💡' },
  bug: { label: 'Bug Report', icon: '🐛' },
  other: { label: 'Feedback', icon: '💬' },
};

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const dismissCurrent = async () => {
  if (isDismissing.value) return;

  isDismissing.value = true;
  const notification = current.value;

  if (notification) {
    await markFeedbackSeen(notification.id);
  }

  if (currentIndex.value < notifications.value.length - 1) {
    currentIndex.value++;
    isDismissing.value = false;
  } else {
    isReady.value = false;
    markClosed(MODAL_ID);
    setTimeout(() => {
      notifications.value = [];
      currentIndex.value = 0;
      isDismissing.value = false;
    }, 300);
  }
};

const dismissAll = async () => {
  if (isDismissing.value) return;

  isDismissing.value = true;

  for (const notification of notifications.value) {
    await markFeedbackSeen(notification.id);
  }

  isReady.value = false;
  markClosed(MODAL_ID);
  setTimeout(() => {
    notifications.value = [];
    currentIndex.value = 0;
    isDismissing.value = false;
  }, 300);
};

onMounted(async () => {
  // Register with modal queue
  registerModal(MODAL_ID);

  // Testing mode: use mock data
  if (isModalTestingEnabled()) {
    notifications.value = [{
      id: 'test-1',
      type: 'suggestion',
      message: 'This is a test feedback notification for testing modal sequencing.',
      created_at: new Date().toISOString(),
      admin_response: 'Thanks for testing! This is a mock response.',
    }];
    setTimeout(() => {
      isReady.value = true;
      requestShow(MODAL_ID);
    }, MODAL_CHECK_DELAY);
    return;
  }

  const completed = await getCompletedFeedback();
  if (completed.length > 0) {
    notifications.value = completed;
    // Wait for initial load, then request to show via queue
    setTimeout(() => {
      isReady.value = true;
      requestShow(MODAL_ID);
    }, MODAL_CHECK_DELAY);
  }
});
</script>

<template>
  <Transition name="notification">
    <div v-if="isVisible && current" class="notification-overlay">
      <div class="notification-backdrop" @click="dismissCurrent"></div>
      <div class="notification-container">
        <div class="notification-card">
          <!-- Glow effects -->
          <div class="card-glow"></div>
          <div class="card-border"></div>

          <!-- Content -->
          <div class="card-content">
            <!-- Header -->
            <div class="notification-header">
              <div class="success-badge">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
              </div>
              <div class="header-text">
                <h3 class="header-title">Feedback Addressed!</h3>
                <p class="header-subtitle">Your feedback has been reviewed</p>
              </div>
              <button class="close-button" @click="dismissCurrent" :disabled="isDismissing">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <!-- Original feedback -->
            <div class="feedback-block">
              <div class="feedback-meta">
                <span class="feedback-type">
                  {{ typeLabels[current.type]?.icon || '💬' }}
                  {{ typeLabels[current.type]?.label || 'Feedback' }}
                </span>
                <span class="feedback-date">{{ formatDate(current.created_at) }}</span>
              </div>
              <p class="feedback-message">"{{ current.message }}"</p>
            </div>

            <!-- Admin response (if any) -->
            <div v-if="current.admin_response" class="response-block">
              <div class="response-label">
                <span class="response-icon">✦</span>
                Response from StarGuide
              </div>
              <p class="response-message">{{ current.admin_response }}</p>
            </div>

            <!-- Footer -->
            <div class="notification-footer">
              <div v-if="notifications.length > 1" class="notification-counter">
                {{ currentIndex + 1 }} of {{ notifications.length }}
              </div>
              <div class="footer-actions">
                <button
                  v-if="notifications.length > 1"
                  class="dismiss-all-btn"
                  @click="dismissAll"
                  :disabled="isDismissing"
                >
                  Dismiss All
                </button>
                <button
                  class="got-it-btn"
                  @click="dismissCurrent"
                  :disabled="isDismissing"
                >
                  {{ notifications.length > 1 && currentIndex < notifications.length - 1 ? 'Next' : 'Got it!' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.notification-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.notification-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.notification-container {
  position: relative;
  width: 100%;
  max-width: 420px;
}

.notification-card {
  position: relative;
  border-radius: 1.25rem;
  overflow: hidden;
}

.card-glow {
  position: absolute;
  inset: -2px;
  background: conic-gradient(
    from 0deg,
    rgba(34, 197, 94, 0.6) 0%,
    rgba(249, 147, 7, 0.4) 25%,
    rgba(34, 197, 94, 0.6) 50%,
    rgba(249, 147, 7, 0.4) 75%,
    rgba(34, 197, 94, 0.6) 100%
  );
  border-radius: 1.35rem;
  animation: rotateGlow 6s linear infinite;
  opacity: 0.8;
}

@keyframes rotateGlow {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.card-border {
  position: absolute;
  inset: 2px;
  background: linear-gradient(145deg, rgba(18, 18, 42, 0.98) 0%, rgba(10, 10, 26, 0.99) 100%);
  border-radius: 1.15rem;
}

.card-content {
  position: relative;
  padding: 1.5rem;
}

/* Header */
.notification-header {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.success-badge {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4px 16px rgba(34, 197, 94, 0.3);
  animation: successPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.success-badge svg {
  width: 24px;
  height: 24px;
  color: white;
}

@keyframes successPop {
  from {
    transform: scale(0);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

.header-text {
  flex: 1;
}

.header-title {
  font-family: var(--font-display, system-ui);
  font-size: 1.25rem;
  font-weight: 700;
  color: white;
  margin: 0 0 0.25rem 0;
}

.header-subtitle {
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.5);
  margin: 0;
}

.close-button {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.close-button:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
}

.close-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.close-button svg {
  width: 16px;
  height: 16px;
  color: rgba(255, 255, 255, 0.6);
}

/* Feedback block */
.feedback-block {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.75rem;
  padding: 1rem;
  margin-bottom: 1rem;
}

.feedback-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.feedback-type {
  font-size: 0.75rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.6);
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.feedback-date {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
  font-family: var(--font-mono, monospace);
}

.feedback-message {
  font-size: 0.9375rem;
  color: rgba(255, 255, 255, 0.8);
  font-style: italic;
  line-height: 1.5;
  margin: 0;
}

/* Response block */
.response-block {
  background: linear-gradient(135deg, rgba(249, 147, 7, 0.08) 0%, rgba(249, 147, 7, 0.03) 100%);
  border: 1px solid rgba(249, 147, 7, 0.2);
  border-radius: 0.75rem;
  padding: 1rem;
  margin-bottom: 1rem;
}

.response-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(249, 147, 7, 0.9);
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-bottom: 0.5rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.response-icon {
  font-size: 0.875rem;
}

.response-message {
  font-size: 0.9375rem;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.5;
  margin: 0;
}

/* Footer */
.notification-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 0.5rem;
}

.notification-counter {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
  font-family: var(--font-mono, monospace);
}

.footer-actions {
  display: flex;
  gap: 0.75rem;
  margin-left: auto;
}

.dismiss-all-btn {
  padding: 0.625rem 1rem;
  border-radius: 0.625rem;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.dismiss-all-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.25);
  color: rgba(255, 255, 255, 0.8);
}

.dismiss-all-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.got-it-btn {
  padding: 0.625rem 1.25rem;
  border-radius: 0.625rem;
  border: none;
  background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
  color: white;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 12px rgba(34, 197, 94, 0.2);
}

.got-it-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(34, 197, 94, 0.3);
}

.got-it-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

/* Transition */
.notification-enter-active {
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.notification-leave-active {
  transition: all 0.3s ease-in;
}

.notification-enter-from {
  opacity: 0;
}

.notification-enter-from .notification-card {
  transform: scale(0.9) translateY(20px);
}

.notification-leave-to {
  opacity: 0;
}

.notification-leave-to .notification-card {
  transform: scale(0.95) translateY(10px);
}

/* Responsive */
@media (max-width: 480px) {
  .notification-container {
    max-width: 100%;
  }

  .card-content {
    padding: 1.25rem;
  }

  .notification-header {
    gap: 0.75rem;
  }

  .success-badge {
    width: 40px;
    height: 40px;
  }

  .success-badge svg {
    width: 20px;
    height: 20px;
  }

  .header-title {
    font-size: 1.125rem;
  }
}
</style>
