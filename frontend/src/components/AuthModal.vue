<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import {
  registerModal,
  requestShow,
  shouldShow,
  markClosed,
  MODAL_CHECK_DELAY,
  isModalTestingEnabled,
} from '../utils/modalQueue';
import { useAuth } from '../composables/useAuth';

// ==================
// CONSTANTS
// ==================

const MODAL_ID = 'auth' as const;
const AUTH_SHOWN_KEY = 'starguide_auth_shown';
const FIRST_VISIT_KEY = 'starguide_first_visit_ts';

// ==================
// PROPS & EMITS
// ==================

interface Props {
  forceOpen?: boolean; // Allow manual opening via UserButton
  initialTab?: 'login' | 'signup';
}

const props = withDefaults(defineProps<Props>(), {
  forceOpen: false,
  initialTab: 'signup',
});

const emit = defineEmits<{
  close: [];
  authenticated: [];
  guestMode: [];
}>();

// ==================
// STATE
// ==================

const isReady = ref(false);
const activeTab = ref<'login' | 'signup'>(props.initialTab);
const email = ref('');
const password = ref('');
const confirmPassword = ref('');
const isLoading = ref(false);
const error = ref<string | null>(null);
const successMessage = ref<string | null>(null);
const showForgotPassword = ref(false);
const showPassword = ref(false);

// ==================
// COMPOSABLES
// ==================

const {
  user,
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  resetPassword,
} = useAuth();

// ==================
// COMPUTED
// ==================

// Show via queue system OR via forceOpen prop
const isVisible = computed(() => {
  if (props.forceOpen) return true;
  return isReady.value && shouldShow(MODAL_ID);
});

const isFormValid = computed(() => {
  if (!email.value || !email.value.includes('@')) return false;

  if (showForgotPassword.value) return true;

  if (!password.value || password.value.length < 6) return false;

  if (activeTab.value === 'signup') {
    if (password.value !== confirmPassword.value) return false;
  }

  return true;
});

const passwordsMatch = computed(() => {
  if (activeTab.value !== 'signup') return true;
  if (!confirmPassword.value) return true;
  return password.value === confirmPassword.value;
});

// ==================
// HELPERS
// ==================

const isFirstVisit = (): boolean => {
  return !localStorage.getItem(FIRST_VISIT_KEY);
};

const wasAuthShown = (): boolean => {
  return localStorage.getItem(AUTH_SHOWN_KEY) === 'true';
};

const markAuthShown = () => {
  localStorage.setItem(AUTH_SHOWN_KEY, 'true');
};

const resetForm = () => {
  activeTab.value = props.initialTab;
  email.value = '';
  password.value = '';
  confirmPassword.value = '';
  error.value = null;
  successMessage.value = null;
  showForgotPassword.value = false;
  showPassword.value = false;
};

// ==================
// WATCHERS
// ==================

watch(
  () => props.forceOpen,
  (forceOpen) => {
    if (forceOpen) {
      resetForm();
      // Switch to login tab when manually opening (returning user)
      activeTab.value = 'login';
    }
  }
);

watch(activeTab, () => {
  // Clear errors when switching tabs
  error.value = null;
  successMessage.value = null;
  showForgotPassword.value = false;
});

// ==================
// METHODS
// ==================

const handleSubmit = async () => {
  if (!isFormValid.value || isLoading.value) return;

  error.value = null;
  successMessage.value = null;
  isLoading.value = true;

  try {
    if (showForgotPassword.value) {
      const result = await resetPassword(email.value);
      if (result.error) {
        error.value = result.error;
      } else {
        successMessage.value = 'Password reset email sent! Check your inbox.';
        showForgotPassword.value = false;
      }
    } else if (activeTab.value === 'login') {
      const result = await signInWithEmail(email.value, password.value);
      if (result.error) {
        error.value = result.error;
      } else {
        dismiss(true);
      }
    } else {
      const result = await signUpWithEmail(email.value, password.value);
      if (result.error) {
        error.value = result.error;
      } else if (result.needsConfirmation) {
        successMessage.value =
          'Account created! Please check your email to confirm.';
      } else {
        dismiss(true);
      }
    }
  } catch (e) {
    error.value = 'An unexpected error occurred';
    console.error(e);
  } finally {
    isLoading.value = false;
  }
};

const handleGoogleSignIn = async () => {
  if (isLoading.value) return;

  error.value = null;
  isLoading.value = true;

  try {
    const result = await signInWithGoogle();
    if (result.error) {
      error.value = result.error;
      isLoading.value = false;
    }
    // If no error, page will redirect to Google
    // Mark as shown before redirect
    markAuthShown();
  } catch (e) {
    error.value = 'Failed to connect to Google';
    isLoading.value = false;
    console.error(e);
  }
};

const dismiss = (authenticated: boolean = false) => {
  isReady.value = false;
  markClosed(MODAL_ID);
  markAuthShown();

  if (authenticated) {
    emit('authenticated');
  } else {
    emit('guestMode');
  }
  emit('close');
};

const handleGuestMode = () => {
  dismiss(false);
};

const handleBackdropClick = () => {
  // Allow closing via backdrop only if not loading
  if (!isLoading.value) {
    handleGuestMode();
  }
};

// ==================
// LIFECYCLE
// ==================

onMounted(() => {
  // Register with modal queue
  registerModal(MODAL_ID);

  // Testing mode: always show
  if (isModalTestingEnabled()) {
    setTimeout(() => {
      isReady.value = true;
      requestShow(MODAL_ID);
    }, MODAL_CHECK_DELAY);
    return;
  }

  // Check if we should show the auth modal
  setTimeout(() => {
    // Don't show if:
    // - User is already logged in
    // - Auth modal was already shown/dismissed
    // - Not a first-time visitor (they already saw it)
    if (user.value) {
      return;
    }

    if (wasAuthShown()) {
      return;
    }

    // Show for first-time visitors
    if (isFirstVisit()) {
      // Mark first visit timestamp (used by other modals too)
      if (!localStorage.getItem(FIRST_VISIT_KEY)) {
        localStorage.setItem(FIRST_VISIT_KEY, Date.now().toString());
      }

      isReady.value = true;
      requestShow(MODAL_ID);
    }
  }, MODAL_CHECK_DELAY);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="auth-fade">
      <div v-if="isVisible" class="auth-overlay">
        <div class="auth-backdrop" @click="handleBackdropClick"></div>

        <div class="auth-modal">
          <!-- Decorative elements -->
          <div class="modal-glow"></div>
          <div class="modal-stars">
            <div class="star star-1"></div>
            <div class="star star-2"></div>
            <div class="star star-3"></div>
            <div class="star star-4"></div>
            <div class="star star-5"></div>
          </div>
          <div class="modal-border"></div>

          <!-- Content -->
          <div class="modal-content">
            <!-- Header -->
            <div class="auth-header">
              <div class="header-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path
                    d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                  />
                </svg>
              </div>
              <h2 class="header-title">
                {{ showForgotPassword ? 'Reset Password' : 'Welcome to StarGuide' }}
              </h2>
              <p class="header-subtitle">
                {{
                  showForgotPassword
                    ? 'Enter your email to receive a reset link'
                    : 'Sign in to sync your roster across devices'
                }}
              </p>
            </div>

            <!-- Tab Toggle (hide during forgot password) -->
            <div v-if="!showForgotPassword" class="tab-toggle">
              <button
                :class="['tab-btn', { active: activeTab === 'login' }]"
                @click="activeTab = 'login'"
              >
                Sign In
              </button>
              <button
                :class="['tab-btn', { active: activeTab === 'signup' }]"
                @click="activeTab = 'signup'"
              >
                Create Account
              </button>
              <div
                class="tab-indicator"
                :style="{ transform: activeTab === 'signup' ? 'translateX(100%)' : 'translateX(0)' }"
              ></div>
            </div>

            <!-- Error/Success Messages -->
            <Transition name="message-fade">
              <div v-if="error" class="message message-error">
                <svg viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fill-rule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                    clip-rule="evenodd"
                  />
                </svg>
                <span>{{ error }}</span>
              </div>
            </Transition>

            <Transition name="message-fade">
              <div v-if="successMessage" class="message message-success">
                <svg viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fill-rule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                    clip-rule="evenodd"
                  />
                </svg>
                <span>{{ successMessage }}</span>
              </div>
            </Transition>

            <!-- Form -->
            <form class="auth-form" @submit.prevent="handleSubmit">
              <!-- Email Input -->
              <div class="input-group">
                <label for="auth-email">Email</label>
                <div class="input-wrapper">
                  <svg class="input-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1.25 1.25 0 001.118 0L19 7.162V6a2 2 0 00-2-2H3z" />
                    <path d="M19 8.839l-7.77 3.885a2.75 2.75 0 01-2.46 0L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z" />
                  </svg>
                  <input
                    id="auth-email"
                    v-model="email"
                    type="email"
                    placeholder="you@example.com"
                    autocomplete="email"
                    :disabled="isLoading"
                  />
                </div>
              </div>

              <!-- Password Input (hide during forgot password) -->
              <div v-if="!showForgotPassword" class="input-group">
                <label for="auth-password">Password</label>
                <div class="input-wrapper">
                  <svg class="input-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fill-rule="evenodd"
                      d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
                      clip-rule="evenodd"
                    />
                  </svg>
                  <input
                    id="auth-password"
                    v-model="password"
                    :type="showPassword ? 'text' : 'password'"
                    placeholder="At least 6 characters"
                    autocomplete="current-password"
                    :disabled="isLoading"
                  />
                  <button
                    type="button"
                    class="password-toggle"
                    @click="showPassword = !showPassword"
                    :aria-label="showPassword ? 'Hide password' : 'Show password'"
                  >
                    <svg v-if="showPassword" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fill-rule="evenodd"
                        d="M3.28 2.22a.75.75 0 00-1.06 1.06l14.5 14.5a.75.75 0 101.06-1.06l-1.745-1.745a10.029 10.029 0 003.3-4.38 1.651 1.651 0 000-1.185A10.004 10.004 0 009.999 3a9.956 9.956 0 00-4.744 1.194L3.28 2.22zM7.752 6.69l1.092 1.092a2.5 2.5 0 013.374 3.373l1.091 1.092a4 4 0 00-5.557-5.557z"
                        clip-rule="evenodd"
                      />
                      <path d="M10.748 13.93l2.523 2.523a9.987 9.987 0 01-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 010-1.186A10.007 10.007 0 012.839 6.02L6.07 9.252a4 4 0 004.678 4.678z" />
                    </svg>
                    <svg v-else viewBox="0 0 20 20" fill="currentColor">
                      <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                      <path
                        fill-rule="evenodd"
                        d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                        clip-rule="evenodd"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              <!-- Confirm Password (signup only) -->
              <div v-if="activeTab === 'signup' && !showForgotPassword" class="input-group">
                <label for="auth-confirm-password">Confirm Password</label>
                <div class="input-wrapper" :class="{ 'input-error': !passwordsMatch }">
                  <svg class="input-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fill-rule="evenodd"
                      d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
                      clip-rule="evenodd"
                    />
                  </svg>
                  <input
                    id="auth-confirm-password"
                    v-model="confirmPassword"
                    :type="showPassword ? 'text' : 'password'"
                    placeholder="Re-enter your password"
                    autocomplete="new-password"
                    :disabled="isLoading"
                  />
                </div>
                <p v-if="!passwordsMatch" class="input-hint input-hint-error">
                  Passwords don't match
                </p>
              </div>

              <!-- Forgot Password Link (login only) -->
              <button
                v-if="activeTab === 'login' && !showForgotPassword"
                type="button"
                class="forgot-password-link"
                @click="showForgotPassword = true"
              >
                Forgot your password?
              </button>

              <!-- Back to Login (forgot password mode) -->
              <button
                v-if="showForgotPassword"
                type="button"
                class="forgot-password-link"
                @click="showForgotPassword = false"
              >
                &larr; Back to Sign In
              </button>

              <!-- Submit Button -->
              <button
                type="submit"
                class="submit-btn"
                :disabled="!isFormValid || isLoading"
              >
                <span v-if="isLoading" class="loading-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </span>
                <span v-else>
                  {{
                    showForgotPassword
                      ? 'Send Reset Email'
                      : activeTab === 'login'
                        ? 'Sign In'
                        : 'Create Account'
                  }}
                </span>
              </button>
            </form>

            <!-- Divider -->
            <div v-if="!showForgotPassword" class="divider">
              <span>or continue with</span>
            </div>

            <!-- Google Sign In -->
            <button
              v-if="!showForgotPassword"
              class="google-btn"
              :disabled="isLoading"
              @click="handleGoogleSignIn"
            >
              <svg viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span>Google</span>
            </button>

            <!-- Guest Mode -->
            <button class="guest-btn" @click="handleGuestMode" :disabled="isLoading">
              Continue without an account
            </button>
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

.auth-overlay {
  position: fixed;
  inset: 0;
  z-index: 10001;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.auth-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(3, 3, 12, 0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

/* ==================
   MODAL
   ================== */

.auth-modal {
  position: relative;
  width: 100%;
  max-width: 420px;
  max-height: calc(100vh - 2rem);
  border-radius: 1.5rem;
  overflow: hidden;
}

.modal-glow {
  position: absolute;
  inset: -3px;
  background: conic-gradient(
    from 0deg,
    rgba(249, 147, 7, 0.6) 0%,
    rgba(168, 85, 247, 0.4) 25%,
    rgba(249, 147, 7, 0.6) 50%,
    rgba(168, 85, 247, 0.4) 75%,
    rgba(249, 147, 7, 0.6) 100%
  );
  border-radius: 1.6rem;
  animation: rotateGlow 10s linear infinite;
  filter: blur(1px);
}

@keyframes rotateGlow {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.modal-stars {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: 1.5rem;
  pointer-events: none;
}

.star {
  position: absolute;
  width: 3px;
  height: 3px;
  background: white;
  border-radius: 50%;
  animation: twinkle 3s ease-in-out infinite;
}

.star-1 { top: 15%; left: 20%; animation-delay: 0s; }
.star-2 { top: 25%; right: 15%; animation-delay: 0.5s; }
.star-3 { top: 45%; left: 10%; animation-delay: 1s; }
.star-4 { bottom: 30%; right: 20%; animation-delay: 1.5s; }
.star-5 { bottom: 15%; left: 30%; animation-delay: 2s; }

@keyframes twinkle {
  0%, 100% { opacity: 0.3; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.5); }
}

.modal-border {
  position: absolute;
  inset: 3px;
  background: linear-gradient(
    165deg,
    rgba(20, 20, 50, 0.98) 0%,
    rgba(10, 10, 30, 0.99) 100%
  );
  border-radius: 1.35rem;
}

.modal-content {
  position: relative;
  padding: 2rem;
  overflow-y: auto;
  max-height: calc(100vh - 2rem);
}

/* ==================
   HEADER
   ================== */

.auth-header {
  text-align: center;
  margin-bottom: 1.75rem;
}

.header-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(249, 147, 7, 0.15) 0%, rgba(168, 85, 247, 0.1) 100%);
  border: 1px solid rgba(249, 147, 7, 0.25);
  border-radius: 1rem;
  animation: float 4s ease-in-out infinite;
}

.header-icon svg {
  width: 32px;
  height: 32px;
  color: #f99307;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}

.header-title {
  font-family: var(--font-display, 'Orbitron', sans-serif);
  font-size: 1.5rem;
  font-weight: 700;
  color: white;
  margin: 0 0 0.5rem 0;
  letter-spacing: 0.02em;
}

.header-subtitle {
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.5);
  margin: 0;
  line-height: 1.4;
}

/* ==================
   TAB TOGGLE
   ================== */

.tab-toggle {
  display: flex;
  position: relative;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 0.75rem;
  padding: 4px;
  margin-bottom: 1.5rem;
}

.tab-btn {
  flex: 1;
  padding: 0.625rem 1rem;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  border-radius: 0.5rem;
  transition: color 0.2s ease;
  position: relative;
  z-index: 1;
}

.tab-btn.active {
  color: white;
}

.tab-btn:hover:not(.active) {
  color: rgba(255, 255, 255, 0.7);
}

.tab-indicator {
  position: absolute;
  top: 4px;
  left: 4px;
  width: calc(50% - 4px);
  height: calc(100% - 8px);
  background: rgba(249, 147, 7, 0.15);
  border: 1px solid rgba(249, 147, 7, 0.3);
  border-radius: 0.5rem;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* ==================
   MESSAGES
   ================== */

.message {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  padding: 0.875rem 1rem;
  border-radius: 0.75rem;
  margin-bottom: 1rem;
  font-size: 0.875rem;
  line-height: 1.4;
}

.message svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  margin-top: 1px;
}

.message-error {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.25);
  color: #fca5a5;
}

.message-error svg {
  color: #ef4444;
}

.message-success {
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.25);
  color: #86efac;
}

.message-success svg {
  color: #22c55e;
}

.message-fade-enter-active,
.message-fade-leave-active {
  transition: all 0.25s ease;
}

.message-fade-enter-from,
.message-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* ==================
   FORM
   ================== */

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.input-group label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);
  padding-left: 2px;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon {
  position: absolute;
  left: 0.875rem;
  width: 18px;
  height: 18px;
  color: rgba(255, 255, 255, 0.35);
  pointer-events: none;
  transition: color 0.2s ease;
}

.input-wrapper input {
  width: 100%;
  padding: 0.8125rem 0.875rem 0.8125rem 2.75rem;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.75rem;
  color: white;
  font-family: inherit;
  font-size: 0.9375rem;
  transition: all 0.2s ease;
}

.input-wrapper input::placeholder {
  color: rgba(255, 255, 255, 0.3);
}

.input-wrapper input:focus {
  outline: none;
  border-color: rgba(249, 147, 7, 0.5);
  box-shadow: 0 0 0 3px rgba(249, 147, 7, 0.1);
}

.input-wrapper input:focus + .input-icon,
.input-wrapper:focus-within .input-icon {
  color: #f99307;
}

.input-wrapper.input-error input {
  border-color: rgba(239, 68, 68, 0.5);
}

.input-wrapper.input-error input:focus {
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
}

.input-hint {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 0.25rem;
  padding-left: 2px;
}

.input-hint-error {
  color: #fca5a5;
}

.password-toggle {
  position: absolute;
  right: 0.75rem;
  background: none;
  border: none;
  padding: 0.25rem;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.35);
  transition: color 0.2s ease;
}

.password-toggle:hover {
  color: rgba(255, 255, 255, 0.6);
}

.password-toggle svg {
  width: 18px;
  height: 18px;
}

.forgot-password-link {
  background: none;
  border: none;
  color: rgba(249, 147, 7, 0.8);
  font-size: 0.8125rem;
  cursor: pointer;
  text-align: left;
  padding: 0;
  margin-top: -0.25rem;
  transition: color 0.2s ease;
}

.forgot-password-link:hover {
  color: #f99307;
}

/* ==================
   SUBMIT BUTTON
   ================== */

.submit-btn {
  width: 100%;
  padding: 0.9375rem 1.25rem;
  border-radius: 0.75rem;
  border: none;
  background: linear-gradient(135deg, #f99307 0%, #dd6d02 100%);
  color: white;
  font-family: inherit;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s ease;
  box-shadow: 0 4px 15px rgba(249, 147, 7, 0.3);
  margin-top: 0.5rem;
}

.submit-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(249, 147, 7, 0.4);
}

.submit-btn:active:not(:disabled) {
  transform: translateY(0);
}

.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.loading-dots {
  display: flex;
  gap: 4px;
  justify-content: center;
}

.loading-dots span {
  width: 6px;
  height: 6px;
  background: white;
  border-radius: 50%;
  animation: loadingPulse 1.2s ease-in-out infinite;
}

.loading-dots span:nth-child(2) {
  animation-delay: 0.15s;
}

.loading-dots span:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes loadingPulse {
  0%, 80%, 100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  40% {
    opacity: 1;
    transform: scale(1);
  }
}

/* ==================
   DIVIDER
   ================== */

.divider {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin: 1.5rem 0;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.15),
    transparent
  );
}

.divider span {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* ==================
   GOOGLE BUTTON
   ================== */

.google-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 0.8125rem 1rem;
  background: white;
  border: none;
  border-radius: 0.75rem;
  color: #1f1f1f;
  font-family: inherit;
  font-size: 0.9375rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.google-btn:hover:not(:disabled) {
  background: #f8f8f8;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.google-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.google-btn svg {
  width: 20px;
  height: 20px;
}

/* ==================
   GUEST BUTTON
   ================== */

.guest-btn {
  width: 100%;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.4);
  font-family: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
  padding: 0.75rem;
  margin-top: 0.5rem;
  transition: color 0.2s ease;
}

.guest-btn:hover:not(:disabled) {
  color: rgba(255, 255, 255, 0.6);
}

.guest-btn:disabled {
  cursor: not-allowed;
}

/* ==================
   TRANSITIONS
   ================== */

.auth-fade-enter-active {
  transition: opacity 0.3s ease;
}

.auth-fade-enter-active .auth-modal {
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.auth-fade-leave-active {
  transition: opacity 0.2s ease;
}

.auth-fade-leave-active .auth-modal {
  transition: all 0.2s ease;
}

.auth-fade-enter-from {
  opacity: 0;
}

.auth-fade-enter-from .auth-modal {
  opacity: 0;
  transform: scale(0.92) translateY(20px);
}

.auth-fade-leave-to {
  opacity: 0;
}

.auth-fade-leave-to .auth-modal {
  opacity: 0;
  transform: scale(0.96);
}

/* ==================
   RESPONSIVE
   ================== */

@media (max-width: 480px) {
  .auth-modal {
    max-width: 100%;
    border-radius: 1.25rem;
  }

  .modal-glow {
    border-radius: 1.35rem;
  }

  .modal-border {
    border-radius: 1.1rem;
  }

  .modal-content {
    padding: 1.5rem;
  }

  .header-icon {
    width: 56px;
    height: 56px;
  }

  .header-icon svg {
    width: 28px;
    height: 28px;
  }

  .header-title {
    font-size: 1.25rem;
  }
}
</style>
