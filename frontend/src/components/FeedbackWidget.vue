<script setup lang="ts">
import { ref } from 'vue';
import { supabase, isSupabaseConfigured, getBrowserId } from '../lib/supabase';

// ==================
// STATE
// ==================

const isOpen = ref(false);
const feedbackText = ref('');
const feedbackType = ref<'suggestion' | 'bug' | 'other'>('suggestion');
const isSubmitting = ref(false);
const showSuccess = ref(false);
const submitError = ref<string | null>(null);

// ==================
// FEEDBACK SUBMISSION
// ==================

// Submit feedback to Supabase
const saveFeedbackCloud = async (type: string, message: string, pageUrl: string): Promise<boolean> => {
  if (!isSupabaseConfigured()) {
    console.warn('Supabase not configured');
    return false;
  }
  try {
    const { error } = await supabase.from('feedback').insert({
      type,
      message,
      page_url: pageUrl,
      user_agent: navigator.userAgent,
      browser_id: getBrowserId(),
      status: 'pending',
    });

    if (error) {
      console.error('Supabase error:', error);
      return false;
    }
    return true;
  } catch (e) {
    console.error('Failed to save feedback to cloud:', e);
    return false;
  }
};

// ==================
// ACTIONS
// ==================

const toggleWidget = () => {
  isOpen.value = !isOpen.value;
  if (!isOpen.value) {
    // Reset on close
    showSuccess.value = false;
    submitError.value = null;
  }
};

const submitFeedback = async () => {
  if (!feedbackText.value.trim()) return;

  isSubmitting.value = true;
  submitError.value = null;

  const pageUrl = window.location.pathname + window.location.hash;
  const message = feedbackText.value.trim();
  const type = feedbackType.value;

  const success = await saveFeedbackCloud(type, message, pageUrl);
  if (!success) {
    submitError.value = 'Failed to submit feedback';
    isSubmitting.value = false;
    return;
  }

  isSubmitting.value = false;
  showSuccess.value = true;
  feedbackText.value = '';

  // Auto-close after success
  setTimeout(() => {
    isOpen.value = false;
    setTimeout(() => {
      showSuccess.value = false;
      submitError.value = null;
    }, 300);
  }, 1500);
};

const typeLabels = {
  suggestion: { label: 'Suggestion', icon: '💡' },
  bug: { label: 'Bug Report', icon: '🐛' },
  other: { label: 'Other', icon: '💬' },
};

</script>

<template>
  <div class="feedback-widget-container" data-onboarding="feedback-widget">
    <!-- Floating Trigger Button -->
    <button
      class="feedback-trigger"
      :class="{ 'is-open': isOpen }"
      @click="toggleWidget"
      :aria-label="isOpen ? 'Close feedback' : 'Send feedback'"
    >
      <div class="trigger-glow"></div>
      <div class="trigger-ring"></div>
      <div class="trigger-core">
        <svg v-if="!isOpen" class="trigger-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
        </svg>
        <svg v-else class="trigger-icon close-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </div>

    </button>

    <!-- Expanded Panel -->
    <Transition name="panel">
      <div v-if="isOpen" class="feedback-panel">
        <div class="panel-backdrop"></div>
        <div class="panel-content">
          <!-- Success State -->
          <div v-if="showSuccess" class="success-state">
            <div class="success-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            </div>
            <h3 class="success-title">Feedback Received</h3>
            <p class="success-text">Thank you for helping improve StarGuide!</p>
          </div>

          <!-- Form State -->
          <div v-else class="form-state">
            <div class="panel-header">
              <h3 class="panel-title">Send Feedback</h3>
              <p class="panel-subtitle">Help improve StarGuide</p>
            </div>

            <!-- Type Selector -->
            <div class="type-selector">
              <button
                v-for="(config, type) in typeLabels"
                :key="type"
                class="type-button"
                :class="{ active: feedbackType === type }"
                @click="feedbackType = type as 'suggestion' | 'bug' | 'other'"
              >
                <span class="type-icon">{{ config.icon }}</span>
                <span class="type-label">{{ config.label }}</span>
              </button>
            </div>

            <!-- Text Area -->
            <div class="textarea-wrapper">
              <textarea
                v-model="feedbackText"
                class="feedback-textarea"
                :placeholder="feedbackType === 'bug'
                  ? 'Describe the issue you encountered...'
                  : feedbackType === 'suggestion'
                    ? 'Share your ideas for improvement...'
                    : 'What\'s on your mind?'"
                rows="4"
                :disabled="isSubmitting"
              ></textarea>
              <div class="textarea-stars"></div>
            </div>

            <!-- Submit Button -->
            <button
              class="submit-button"
              :disabled="!feedbackText.trim() || isSubmitting"
              @click="submitFeedback"
            >
              <span v-if="isSubmitting" class="submit-loading">
                <span class="loading-dot"></span>
                <span class="loading-dot"></span>
                <span class="loading-dot"></span>
              </span>
              <span v-else class="submit-text">
                <svg class="submit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                </svg>
                Send Feedback
              </span>
            </button>

          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.feedback-widget-container {
  position: fixed;
  bottom: 5rem;
  right: 1rem;
  z-index: 9999;
  font-family: var(--font-body, system-ui, sans-serif);
}

@media (min-width: 768px) {
  .feedback-widget-container {
    bottom: 1.5rem;
    right: 1.5rem;
  }
}

/* ==================
   TRIGGER BUTTON
   ================== */

.feedback-trigger {
  position: relative;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  background: transparent;
  padding: 0;
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.feedback-trigger:hover {
  transform: scale(1.1);
}

.feedback-trigger.is-open {
  transform: scale(0.95);
}

.trigger-glow {
  position: absolute;
  inset: -8px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(249, 147, 7, 0.4) 0%, transparent 70%);
  animation: pulseGlow 3s ease-in-out infinite;
  pointer-events: none;
}

.feedback-trigger.is-open .trigger-glow {
  animation: none;
  opacity: 0;
}

@keyframes pulseGlow {
  0%, 100% {
    transform: scale(1);
    opacity: 0.6;
  }
  50% {
    transform: scale(1.3);
    opacity: 0.3;
  }
}

.trigger-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid rgba(249, 147, 7, 0.6);
  animation: ringRotate 20s linear infinite;
  background: conic-gradient(
    from 0deg,
    rgba(249, 147, 7, 0.8) 0%,
    rgba(168, 85, 247, 0.6) 25%,
    rgba(249, 147, 7, 0.4) 50%,
    rgba(168, 85, 247, 0.6) 75%,
    rgba(249, 147, 7, 0.8) 100%
  );
  -webkit-mask: radial-gradient(transparent 60%, black 62%);
  mask: radial-gradient(transparent 60%, black 62%);
}

@keyframes ringRotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.trigger-core {
  position: absolute;
  inset: 4px;
  border-radius: 50%;
  background: linear-gradient(135deg, #1a1a3e 0%, #0d0d1a 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    inset 0 2px 4px rgba(255, 255, 255, 0.1),
    0 4px 16px rgba(0, 0, 0, 0.4);
}

.trigger-icon {
  width: 22px;
  height: 22px;
  color: rgba(249, 147, 7, 0.9);
  transition: all 0.3s ease;
}

.close-icon {
  color: rgba(255, 255, 255, 0.7);
}

.feedback-trigger:hover .trigger-icon {
  color: #f99307;
}

/* ==================
   PANEL
   ================== */

.feedback-panel {
  position: absolute;
  bottom: 70px;
  right: 0;
  width: 320px;
  border-radius: 16px;
  overflow: hidden;
  box-shadow:
    0 20px 60px rgba(0, 0, 0, 0.5),
    0 0 1px rgba(255, 255, 255, 0.1);
}

.panel-backdrop {
  position: absolute;
  inset: 0;
  background: linear-gradient(145deg, rgba(18, 18, 42, 0.95) 0%, rgba(10, 10, 26, 0.98) 100%);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.panel-content {
  position: relative;
  padding: 1.25rem;
}

/* Panel transition */
.panel-enter-active {
  animation: panelIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.panel-leave-active {
  animation: panelOut 0.25s ease-in;
}

@keyframes panelIn {
  from {
    opacity: 0;
    transform: scale(0.9) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes panelOut {
  from {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  to {
    opacity: 0;
    transform: scale(0.95) translateY(5px);
  }
}

/* ==================
   FORM STATE
   ================== */

.panel-header {
  margin-bottom: 1rem;
}

.panel-title {
  font-family: var(--font-display, system-ui);
  font-size: 1.125rem;
  font-weight: 700;
  color: white;
  margin: 0 0 0.25rem 0;
}

.panel-subtitle {
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.5);
  margin: 0;
}

/* Type Selector */
.type-selector {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.type-button {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.625rem 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
  cursor: pointer;
  transition: all 0.2s ease;
}

.type-button:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.15);
}

.type-button.active {
  background: rgba(249, 147, 7, 0.1);
  border-color: rgba(249, 147, 7, 0.4);
}

.type-icon {
  font-size: 1.125rem;
}

.type-label {
  font-size: 0.6875rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.6);
}

.type-button.active .type-label {
  color: rgba(249, 147, 7, 0.9);
}

/* Text Area */
.textarea-wrapper {
  position: relative;
  margin-bottom: 1rem;
  border-radius: 10px;
  overflow: hidden;
}

.feedback-textarea {
  width: 100%;
  padding: 0.875rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.3);
  color: white;
  font-family: inherit;
  font-size: 0.875rem;
  line-height: 1.5;
  resize: none;
  transition: all 0.2s ease;
}

.feedback-textarea::placeholder {
  color: rgba(255, 255, 255, 0.35);
}

.feedback-textarea:focus {
  outline: none;
  border-color: rgba(249, 147, 7, 0.5);
  box-shadow: 0 0 0 3px rgba(249, 147, 7, 0.1);
}

.feedback-textarea:disabled {
  opacity: 0.6;
}

.textarea-stars {
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(1px 1px at 20% 30%, rgba(255, 255, 255, 0.3) 1px, transparent 0),
    radial-gradient(1px 1px at 70% 70%, rgba(255, 255, 255, 0.2) 1px, transparent 0),
    radial-gradient(1px 1px at 40% 80%, rgba(255, 255, 255, 0.15) 1px, transparent 0),
    radial-gradient(1px 1px at 90% 20%, rgba(255, 255, 255, 0.2) 1px, transparent 0);
  pointer-events: none;
  opacity: 0.5;
}

/* Submit Button */
.submit-button {
  width: 100%;
  padding: 0.875rem 1rem;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #f99307 0%, #dd6d02 100%);
  color: white;
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.submit-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(249, 147, 7, 0.3);
}

.submit-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.submit-icon {
  width: 16px;
  height: 16px;
}

.submit-text {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

/* Loading dots */
.submit-loading {
  display: flex;
  gap: 4px;
}

.loading-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: white;
  animation: loadingPulse 1s ease-in-out infinite;
}

.loading-dot:nth-child(2) {
  animation-delay: 0.15s;
}

.loading-dot:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes loadingPulse {
  0%, 100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}

/* ==================
   SUCCESS STATE
   ================== */

.success-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2rem 1rem;
  text-align: center;
}

.success-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
  animation: successPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.success-icon svg {
  width: 28px;
  height: 28px;
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

.success-title {
  font-family: var(--font-display, system-ui);
  font-size: 1.125rem;
  font-weight: 700;
  color: white;
  margin: 0 0 0.375rem 0;
}

.success-text {
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.5);
  margin: 0;
}

/* ==================
   RESPONSIVE
   ================== */

@media (max-width: 400px) {
  .feedback-panel {
    width: calc(100vw - 2rem);
    right: -0.5rem;
  }
}
</style>
