<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { activeSurvey } from '../data/surveys';
import type { Survey, SurveyQuestion } from '../data/surveys/types';
import { submitSurveyResponse } from '../lib/supabase';
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

const MODAL_ID = 'survey' as const;
const SURVEY_COMPLETED_PREFIX = 'starguide_survey_';
const FIRST_VISIT_KEY = 'starguide_first_visit_ts';
const FIRST_VISIT_DELAY_MS = 10000; // 10 seconds before showing survey to new users

// ==================
// STATE
// ==================

const isReady = ref(false);
const testSurvey = ref<Survey | null>(null);

// Use queue system for visibility
const isVisible = computed(() => isReady.value && shouldShow(MODAL_ID));
const currentQuestionIndex = ref(0);
const responses = ref<Record<string, string | string[] | number>>({});
const isSubmitting = ref(false);
const showSuccess = ref(false);

// ==================
// COMPUTED
// ==================

// Use test survey if in testing mode, otherwise use active survey
const survey = computed((): Survey | null => testSurvey.value || activeSurvey);

const currentQuestion = computed((): SurveyQuestion | null => {
  if (!survey.value) return null;
  return survey.value.questions[currentQuestionIndex.value] || null;
});

const isFirstQuestion = computed(() => currentQuestionIndex.value === 0);
const isLastQuestion = computed(() => {
  if (!survey.value) return true;
  return currentQuestionIndex.value === survey.value.questions.length - 1;
});

const totalQuestions = computed(() => survey.value?.questions.length || 0);

const canProceed = computed(() => {
  const q = currentQuestion.value;
  if (!q) return false;

  if (!q.required) return true;

  const answer = responses.value[q.id];
  if (answer === undefined || answer === null) return false;

  if (typeof answer === 'string' && answer.trim() === '') return false;
  if (Array.isArray(answer) && answer.length === 0) return false;

  return true;
});

const progressPercent = computed(() => {
  if (totalQuestions.value === 0) return 0;
  return ((currentQuestionIndex.value + 1) / totalQuestions.value) * 100;
});

// ==================
// METHODS
// ==================

const getSurveyCompletedKey = (surveyId: string) => {
  return `${SURVEY_COMPLETED_PREFIX}${surveyId}_completed`;
};

const isSurveyCompleted = (surveyId: string): boolean => {
  return localStorage.getItem(getSurveyCompletedKey(surveyId)) === 'true';
};

const markSurveyCompleted = (surveyId: string) => {
  localStorage.setItem(getSurveyCompletedKey(surveyId), 'true');
};

const isFirstVisitRecent = (): boolean => {
  const firstVisitTs = localStorage.getItem(FIRST_VISIT_KEY);

  if (!firstVisitTs) {
    // First time ever - set timestamp and return true (too recent)
    localStorage.setItem(FIRST_VISIT_KEY, Date.now().toString());
    return true;
  }

  const elapsed = Date.now() - parseInt(firstVisitTs, 10);
  return elapsed < FIRST_VISIT_DELAY_MS;
};

const isOnboardingActive = (): boolean => {
  // Check if onboarding is currently showing (desktop only)
  const onboardingComplete = localStorage.getItem('starguide_onboarding_complete');
  const isMobile = window.innerWidth < 768;

  // On desktop, if onboarding not complete, it's probably showing
  if (!isMobile && !onboardingComplete) {
    return true;
  }

  return false;
};

const checkShouldShowSurvey = () => {
  if (!survey.value || !survey.value.active) return false;

  // Don't show if already completed
  if (isSurveyCompleted(survey.value.id)) return false;

  // Don't show during onboarding
  if (isOnboardingActive()) return false;

  // Don't show if first visit is too recent (give users time to explore)
  if (isFirstVisitRecent()) return false;

  // Check date constraints
  const now = new Date();
  if (survey.value.startDate && new Date(survey.value.startDate) > now) return false;
  if (survey.value.endDate && new Date(survey.value.endDate) < now) return false;

  return true;
};

const nextQuestion = () => {
  if (isLastQuestion.value) {
    submit();
  } else {
    currentQuestionIndex.value++;
  }
};

const prevQuestion = () => {
  if (!isFirstQuestion.value) {
    currentQuestionIndex.value--;
  }
};

const skip = async () => {
  if (!survey.value) return;

  isSubmitting.value = true;

  // Submit as skipped
  await submitSurveyResponse({
    survey_id: survey.value.id,
    responses: {},
    skipped: true,
  });

  markSurveyCompleted(survey.value.id);
  isSubmitting.value = false;
  isReady.value = false;
  markClosed(MODAL_ID);
};

const submit = async () => {
  if (!survey.value) return;

  isSubmitting.value = true;

  await submitSurveyResponse({
    survey_id: survey.value.id,
    responses: responses.value,
    skipped: false,
  });

  markSurveyCompleted(survey.value.id);
  isSubmitting.value = false;
  showSuccess.value = true;

  // Auto-close after success
  setTimeout(() => {
    isReady.value = false;
    markClosed(MODAL_ID);
  }, 2000);
};

const handleRatingSelect = (questionId: string, value: number) => {
  responses.value[questionId] = value;
};

const handleSingleChoiceSelect = (questionId: string, option: string) => {
  responses.value[questionId] = option;
};

const handleMultiChoiceToggle = (questionId: string, option: string) => {
  const current = (responses.value[questionId] as string[]) || [];
  const index = current.indexOf(option);

  if (index === -1) {
    responses.value[questionId] = [...current, option];
  } else {
    responses.value[questionId] = current.filter(o => o !== option);
  }
};

// ==================
// LIFECYCLE
// ==================

onMounted(() => {
  // Register with modal queue
  registerModal(MODAL_ID);

  // Testing mode: use mock survey
  if (isModalTestingEnabled()) {
    testSurvey.value = {
      id: 'test-survey',
      title: 'Test Survey',
      description: 'This is a test survey for modal testing.',
      active: true,
      questions: [
        {
          id: 'test-q1',
          type: 'single-choice',
          question: 'How is the modal sequencing working?',
          options: ['Great!', 'Good', 'Needs work'],
          required: true,
        },
      ],
    };
    setTimeout(() => {
      isReady.value = true;
      requestShow(MODAL_ID);
    }, MODAL_CHECK_DELAY);
    return;
  }

  // Check after initial delay to let the page load
  setTimeout(() => {
    if (checkShouldShowSurvey()) {
      isReady.value = true;
      requestShow(MODAL_ID);
    }
  }, MODAL_CHECK_DELAY);
});

// Also check when onboarding completes
watch(() => localStorage.getItem('starguide_onboarding_complete'), () => {
  setTimeout(() => {
    if (!isReady.value && checkShouldShowSurvey()) {
      isReady.value = true;
      requestShow(MODAL_ID);
    }
  }, MODAL_CHECK_DELAY);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="isVisible && survey" class="survey-overlay">
        <div class="survey-backdrop" @click="skip"></div>

        <div class="survey-modal">
          <!-- Header -->
          <div class="survey-header">
            <div class="survey-icon">
              <span>📋</span>
            </div>
            <div class="survey-title-section">
              <h2 class="survey-title">{{ survey.title }}</h2>
              <p v-if="survey.description" class="survey-description">
                {{ survey.description }}
              </p>
            </div>
            <button class="close-btn" @click="skip" aria-label="Close survey">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <!-- Progress Bar -->
          <div class="progress-container">
            <div class="progress-bar" :style="{ width: `${progressPercent}%` }"></div>
            <span class="progress-text">{{ currentQuestionIndex + 1 }} / {{ totalQuestions }}</span>
          </div>

          <!-- Content -->
          <div class="survey-content">
            <!-- Success State -->
            <div v-if="showSuccess" class="success-state">
              <div class="success-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
              </div>
              <h3 class="success-title">Thank You!</h3>
              <p class="success-text">Your feedback helps improve StarGuide.</p>
            </div>

            <!-- Question Display -->
            <div v-else-if="currentQuestion" class="question-container">
              <h3 class="question-text">
                {{ currentQuestion.question }}
                <span v-if="currentQuestion.required" class="required-marker">*</span>
              </h3>

              <!-- Text Input -->
              <div v-if="currentQuestion.type === 'text'" class="input-wrapper">
                <input
                  type="text"
                  v-model="responses[currentQuestion.id] as string"
                  :placeholder="currentQuestion.placeholder || 'Type your answer...'"
                  :maxlength="currentQuestion.maxLength"
                  class="text-input"
                />
              </div>

              <!-- Textarea -->
              <div v-else-if="currentQuestion.type === 'textarea'" class="input-wrapper">
                <textarea
                  v-model="responses[currentQuestion.id] as string"
                  :placeholder="currentQuestion.placeholder || 'Type your answer...'"
                  :maxlength="currentQuestion.maxLength"
                  :rows="currentQuestion.rows || 4"
                  class="textarea-input"
                ></textarea>
              </div>

              <!-- Single Choice -->
              <div v-else-if="currentQuestion.type === 'single-choice'" class="options-list">
                <button
                  v-for="option in currentQuestion.options"
                  :key="option"
                  class="option-btn"
                  :class="{ selected: responses[currentQuestion.id] === option }"
                  @click="handleSingleChoiceSelect(currentQuestion.id, option)"
                >
                  <span class="option-indicator">
                    <span v-if="responses[currentQuestion.id] === option" class="indicator-dot"></span>
                  </span>
                  <span class="option-text">{{ option }}</span>
                </button>
              </div>

              <!-- Multi Choice -->
              <div v-else-if="currentQuestion.type === 'multi-choice'" class="options-list">
                <button
                  v-for="option in currentQuestion.options"
                  :key="option"
                  class="option-btn checkbox"
                  :class="{ selected: (responses[currentQuestion.id] as string[] || []).includes(option) }"
                  @click="handleMultiChoiceToggle(currentQuestion.id, option)"
                >
                  <span class="option-indicator checkbox">
                    <svg v-if="(responses[currentQuestion.id] as string[] || []).includes(option)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                      <path d="M20 6L9 17l-5-5"/>
                    </svg>
                  </span>
                  <span class="option-text">{{ option }}</span>
                </button>
              </div>

              <!-- Rating -->
              <div v-else-if="currentQuestion.type === 'rating'" class="rating-container">
                <div class="rating-labels">
                  <span class="rating-label">{{ currentQuestion.minLabel || currentQuestion.min }}</span>
                  <span class="rating-label">{{ currentQuestion.maxLabel || currentQuestion.max }}</span>
                </div>
                <div class="rating-buttons">
                  <button
                    v-for="n in (currentQuestion.max - currentQuestion.min + 1)"
                    :key="n"
                    class="rating-btn"
                    :class="{ selected: responses[currentQuestion.id] === (currentQuestion.min + n - 1) }"
                    @click="handleRatingSelect(currentQuestion.id, currentQuestion.min + n - 1)"
                  >
                    {{ currentQuestion.min + n - 1 }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Navigation -->
          <div v-if="!showSuccess" class="survey-nav">
            <button
              v-if="!isFirstQuestion"
              class="nav-btn back"
              @click="prevQuestion"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M15 18l-6-6 6-6"/>
              </svg>
              Back
            </button>
            <button
              v-else
              class="nav-btn skip"
              @click="skip"
            >
              Skip
            </button>

            <button
              class="nav-btn next"
              :class="{ disabled: !canProceed }"
              :disabled="!canProceed || isSubmitting"
              @click="nextQuestion"
            >
              <span v-if="isSubmitting" class="loading-dots">
                <span class="dot"></span>
                <span class="dot"></span>
                <span class="dot"></span>
              </span>
              <template v-else>
                {{ isLastQuestion ? 'Submit' : 'Next' }}
                <svg v-if="!isLastQuestion" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </template>
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

.survey-overlay {
  position: fixed;
  inset: 0;
  z-index: 10001;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.survey-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(3, 3, 12, 0.85);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

/* ==================
   MODAL
   ================== */

.survey-modal {
  position: relative;
  width: 100%;
  max-width: 480px;
  background: linear-gradient(145deg, rgba(20, 20, 45, 0.98) 0%, rgba(12, 12, 30, 0.98) 100%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 1.25rem;
  box-shadow:
    0 25px 50px rgba(0, 0, 0, 0.5),
    0 0 100px rgba(249, 147, 7, 0.1);
  overflow: hidden;
}

/* ==================
   HEADER
   ================== */

.survey-header {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1.5rem 1.5rem 1rem;
  position: relative;
}

.survey-icon {
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
}

.survey-title-section {
  flex: 1;
  min-width: 0;
}

.survey-title {
  font-family: var(--font-display, 'Exo 2', sans-serif);
  font-size: 1.25rem;
  font-weight: 700;
  color: white;
  margin: 0 0 0.25rem 0;
}

.survey-description {
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.5);
  margin: 0;
  line-height: 1.4;
}

.close-btn {
  position: absolute;
  top: 1rem;
  right: 1rem;
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
   PROGRESS
   ================== */

.progress-container {
  position: relative;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  margin: 0 1.5rem;
}

.progress-bar {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  background: linear-gradient(90deg, #f99307, #ff6b00);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.progress-text {
  position: absolute;
  right: 0;
  top: 8px;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
  font-family: var(--font-mono, monospace);
}

/* ==================
   CONTENT
   ================== */

.survey-content {
  padding: 2rem 1.5rem;
  min-height: 200px;
}

.question-container {
  animation: questionIn 0.3s ease-out;
}

@keyframes questionIn {
  from {
    opacity: 0;
    transform: translateX(20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.question-text {
  font-size: 1.125rem;
  font-weight: 600;
  color: white;
  margin: 0 0 1.5rem 0;
  line-height: 1.4;
}

.required-marker {
  color: #f99307;
  margin-left: 0.25rem;
}

/* ==================
   INPUT STYLES
   ================== */

.input-wrapper {
  position: relative;
}

.text-input,
.textarea-input {
  width: 100%;
  padding: 0.875rem 1rem;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: white;
  font-family: inherit;
  font-size: 0.9375rem;
  transition: all 0.2s ease;
}

.text-input::placeholder,
.textarea-input::placeholder {
  color: rgba(255, 255, 255, 0.35);
}

.text-input:focus,
.textarea-input:focus {
  outline: none;
  border-color: rgba(249, 147, 7, 0.5);
  box-shadow: 0 0 0 3px rgba(249, 147, 7, 0.1);
}

.textarea-input {
  resize: none;
  line-height: 1.5;
}

/* ==================
   OPTIONS (Single/Multi Choice)
   ================== */

.options-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.option-btn {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
}

.option-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.15);
}

.option-btn.selected {
  background: rgba(249, 147, 7, 0.1);
  border-color: rgba(249, 147, 7, 0.4);
}

.option-indicator {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.option-btn.selected .option-indicator {
  border-color: #f99307;
}

.indicator-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #f99307;
  animation: dotPop 0.2s ease-out;
}

@keyframes dotPop {
  from { transform: scale(0); }
  to { transform: scale(1); }
}

.option-indicator.checkbox {
  border-radius: 6px;
}

.option-indicator.checkbox svg {
  width: 14px;
  height: 14px;
  color: #f99307;
}

.option-text {
  font-size: 0.9375rem;
  color: rgba(255, 255, 255, 0.85);
}

/* ==================
   RATING
   ================== */

.rating-container {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.rating-labels {
  display: flex;
  justify-content: space-between;
  padding: 0 0.5rem;
}

.rating-label {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
}

.rating-buttons {
  display: flex;
  gap: 0.5rem;
}

.rating-btn {
  flex: 1;
  padding: 1rem 0.5rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.7);
  font-family: var(--font-mono, monospace);
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.rating-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.15);
}

.rating-btn.selected {
  background: linear-gradient(135deg, #f99307 0%, #dd6d02 100%);
  border-color: #f99307;
  color: white;
  transform: scale(1.05);
}

/* ==================
   SUCCESS STATE
   ================== */

.success-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
  text-align: center;
  animation: successIn 0.4s ease-out;
}

@keyframes successIn {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.success-icon {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1.25rem;
  animation: successPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.success-icon svg {
  width: 32px;
  height: 32px;
  color: white;
}

@keyframes successPop {
  from {
    transform: scale(0);
  }
  to {
    transform: scale(1);
  }
}

.success-title {
  font-family: var(--font-display, 'Exo 2', sans-serif);
  font-size: 1.25rem;
  font-weight: 700;
  color: white;
  margin: 0 0 0.5rem 0;
}

.success-text {
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.5);
  margin: 0;
}

/* ==================
   NAVIGATION
   ================== */

.survey-nav {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.5rem 1.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.nav-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  border-radius: 10px;
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.nav-btn svg {
  width: 16px;
  height: 16px;
}

.nav-btn.back,
.nav-btn.skip {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.7);
}

.nav-btn.back:hover,
.nav-btn.skip:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.nav-btn.next {
  background: linear-gradient(135deg, #f99307 0%, #dd6d02 100%);
  border: none;
  color: white;
  margin-left: auto;
}

.nav-btn.next:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(249, 147, 7, 0.3);
}

.nav-btn.next.disabled,
.nav-btn.next:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

/* Loading dots */
.loading-dots {
  display: flex;
  gap: 4px;
}

.loading-dots .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: white;
  animation: loadingDot 1s ease-in-out infinite;
}

.loading-dots .dot:nth-child(2) {
  animation-delay: 0.15s;
}

.loading-dots .dot:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes loadingDot {
  0%, 100% { opacity: 0.3; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1); }
}

/* ==================
   TRANSITIONS
   ================== */

.modal-fade-enter-active {
  transition: opacity 0.3s ease;
}

.modal-fade-enter-active .survey-modal {
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-leave-active .survey-modal {
  transition: all 0.2s ease;
}

.modal-fade-enter-from {
  opacity: 0;
}

.modal-fade-enter-from .survey-modal {
  opacity: 0;
  transform: scale(0.95) translateY(10px);
}

.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-leave-to .survey-modal {
  opacity: 0;
  transform: scale(0.98);
}

/* ==================
   RESPONSIVE
   ================== */

@media (max-width: 480px) {
  .survey-modal {
    max-height: calc(100vh - 2rem);
    overflow-y: auto;
  }

  .survey-header {
    padding: 1.25rem 1.25rem 0.75rem;
  }

  .survey-content {
    padding: 1.5rem 1.25rem;
  }

  .survey-nav {
    padding: 1rem 1.25rem 1.25rem;
  }

  .rating-btn {
    padding: 0.875rem 0.25rem;
    font-size: 0.875rem;
  }
}
</style>
