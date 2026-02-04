<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { BidirectionalSuggestion } from '../../composables/useBidirectionalCheck';
import { characters } from '../../data';
import type { TeammateRating } from '../../types';

// ==================
// PROPS & EMITS
// ==================

const props = defineProps<{
  suggestion: BidirectionalSuggestion | null;
  show: boolean;
}>();

const emit = defineEmits<{
  accept: [suggestion: BidirectionalSuggestion, customReason?: string];
  skip: [];
}>();

// ==================
// STATE
// ==================

const selectedRating = ref<TeammateRating>('S');
const customReason = ref('');

// ==================
// COMPUTED
// ==================

const sourceCharacter = computed(() => {
  if (!props.suggestion) return null;
  return characters.find(c => c.id === props.suggestion!.sourceCharacterId);
});

const targetCharacter = computed(() => {
  if (!props.suggestion) return null;
  return characters.find(c => c.id === props.suggestion!.targetCharacterId);
});

const sourceIcon = computed(() => {
  if (!props.suggestion) return '/icons/placeholder.webp';
  return `/icons/${props.suggestion.sourceCharacterId}.webp`;
});

const targetIcon = computed(() => {
  if (!props.suggestion) return '/icons/placeholder.webp';
  return `/icons/${props.suggestion.targetCharacterId}.webp`;
});

const roleLabel = computed(() => {
  if (!props.suggestion) return '';
  const labels: Record<string, string> = {
    dps: 'DPS',
    amplifiers: 'Amplifiers',
    sustains: 'Sustains',
    subDPS: 'Sub DPS',
  };
  return labels[props.suggestion.targetRole] || props.suggestion.targetRole;
});

const ratings: TeammateRating[] = ['S', 'A', 'B', 'C', 'D'];

// ==================
// WATCHERS
// ==================

watch(
  () => props.suggestion,
  suggestion => {
    if (suggestion) {
      selectedRating.value = suggestion.suggestedRating as TeammateRating;
      customReason.value = suggestion.suggestedReason;
    }
  },
  { immediate: true }
);

// ==================
// METHODS
// ==================

function handleAccept() {
  if (!props.suggestion) return;

  const updatedSuggestion: BidirectionalSuggestion = {
    ...props.suggestion,
    suggestedRating: selectedRating.value,
  };

  emit('accept', updatedSuggestion, customReason.value);
}

function handleSkip() {
  emit('skip');
}

function handleOverlayClick(event: MouseEvent) {
  if (event.target === event.currentTarget) {
    handleSkip();
  }
}

function handleImageError(event: Event) {
  const img = event.target as HTMLImageElement;
  img.src = '/icons/placeholder.webp';
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="show && suggestion"
        class="modal-overlay"
        @click="handleOverlayClick"
      >
        <div class="modal-content">
          <!-- Header -->
          <div class="modal-header">
            <div class="header-icon">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-9L21 12m0 0l-4.5 4.5M21 12H7.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </div>
            <h3 class="modal-title">Bidirectional Consistency</h3>
            <button class="close-btn" @click="handleSkip" aria-label="Close">
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path
                  fill-rule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clip-rule="evenodd"
                />
              </svg>
            </button>
          </div>

          <!-- Body -->
          <div class="modal-body">
            <!-- Context explanation -->
            <div class="context-section">
              <p class="context-text">
                You rated
                <span class="character-name">{{
                  targetCharacter?.name || suggestion.targetCharacterId
                }}</span>
                as
                <span class="rating-highlight">{{
                  suggestion.suggestedRating
                }}</span
                >-tier for
                <span class="character-name">{{
                  sourceCharacter?.name || suggestion.sourceCharacterId
                }}</span
                >.
              </p>

              <!-- Visual indicator -->
              <div class="relationship-visual">
                <div class="char-badge">
                  <img
                    :src="sourceIcon"
                    :alt="sourceCharacter?.name"
                    class="char-icon"
                    @error="handleImageError"
                  />
                  <span class="char-label">{{
                    sourceCharacter?.name || suggestion.sourceCharacterId
                  }}</span>
                </div>
                <div class="arrow-container">
                  <svg viewBox="0 0 24 24" fill="none" class="arrow-icon">
                    <path
                      d="M17 8l4 4m0 0l-4 4m4-4H3"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                  <span class="arrow-rating">{{ suggestion.suggestedRating }}</span>
                </div>
                <div class="char-badge">
                  <img
                    :src="targetIcon"
                    :alt="targetCharacter?.name"
                    class="char-icon"
                    @error="handleImageError"
                  />
                  <span class="char-label">{{
                    targetCharacter?.name || suggestion.targetCharacterId
                  }}</span>
                </div>
              </div>
            </div>

            <!-- Missing inverse -->
            <div class="missing-section">
              <p class="missing-text">
                <span class="character-name">{{
                  targetCharacter?.name || suggestion.targetCharacterId
                }}</span>
                doesn't currently rate
                <span class="character-name">{{
                  sourceCharacter?.name || suggestion.sourceCharacterId
                }}</span
                >.
              </p>
              <p class="prompt-text">
                Would you like to add
                <span class="character-name">{{
                  sourceCharacter?.name || suggestion.sourceCharacterId
                }}</span>
                to
                <span class="character-name">{{
                  targetCharacter?.name || suggestion.targetCharacterId
                }}</span
                >'s <strong>{{ roleLabel }}</strong> list?
              </p>
            </div>

            <!-- Rating selector -->
            <div class="input-group">
              <label class="input-label">Rating</label>
              <div class="rating-selector">
                <button
                  v-for="rating in ratings"
                  :key="rating"
                  :class="[
                    'rating-btn',
                    { active: selectedRating === rating },
                    `rating-${rating.toLowerCase()}`,
                  ]"
                  @click="selectedRating = rating"
                >
                  {{ rating }}
                </button>
              </div>
            </div>

            <!-- Reason input -->
            <div class="input-group">
              <label class="input-label">Reason</label>
              <textarea
                v-model="customReason"
                class="reason-textarea"
                placeholder="Explain why this synergy works..."
                rows="3"
              ></textarea>
              <p class="input-hint">
                Try to be specific about the synergy mechanics
              </p>
            </div>

            <!-- Note -->
            <p class="note-text">
              Note: This will be included in your edit submission
            </p>
          </div>

          <!-- Footer -->
          <div class="modal-footer">
            <button class="btn btn-skip" @click="handleSkip">Skip</button>
            <button class="btn btn-accept" @click="handleAccept">
              Add to {{ targetCharacter?.name || 'Character' }}
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

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

/* ==================
   MODAL
   ================== */

.modal-content {
  background: rgb(30, 41, 59);
  border: 1px solid rgba(71, 85, 105, 0.6);
  border-radius: 0.75rem;
  max-width: 520px;
  width: 100%;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

/* ==================
   HEADER
   ================== */

.modal-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid rgba(71, 85, 105, 0.4);
  background: rgba(15, 23, 42, 0.5);
}

.header-icon {
  width: 1.75rem;
  height: 1.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(249, 115, 22, 0.9);
}

.header-icon svg {
  width: 1.5rem;
  height: 1.5rem;
}

.modal-title {
  flex: 1;
  font-size: 1.125rem;
  font-weight: 600;
  color: rgba(241, 245, 249, 1);
  margin: 0;
}

.close-btn {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 0.375rem;
  color: rgba(148, 163, 184, 0.7);
  cursor: pointer;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: rgba(71, 85, 105, 0.4);
  color: rgba(226, 232, 240, 1);
}

.close-btn svg {
  width: 1.125rem;
  height: 1.125rem;
}

/* ==================
   BODY
   ================== */

.modal-body {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

/* Context Section */
.context-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.context-text {
  font-size: 0.9375rem;
  color: rgba(203, 213, 225, 0.9);
  line-height: 1.6;
  margin: 0;
}

.character-name {
  color: rgba(241, 245, 249, 1);
  font-weight: 600;
}

.rating-highlight {
  color: rgba(251, 191, 36, 1);
  font-weight: 700;
}

/* Relationship Visual */
.relationship-visual {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 1rem;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(71, 85, 105, 0.3);
  border-radius: 0.625rem;
}

.char-badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.char-icon {
  width: 48px;
  height: 48px;
  border-radius: 0.5rem;
  border: 2px solid rgba(249, 115, 22, 0.4);
  object-fit: cover;
}

.char-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: rgba(203, 213, 225, 0.9);
  text-align: center;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.arrow-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.arrow-icon {
  width: 2rem;
  height: 2rem;
  color: rgba(249, 115, 22, 0.7);
}

.arrow-rating {
  font-size: 0.75rem;
  font-weight: 700;
  color: rgba(251, 191, 36, 0.9);
  padding: 0.125rem 0.5rem;
  background: rgba(251, 191, 36, 0.1);
  border-radius: 0.25rem;
}

/* Missing Section */
.missing-section {
  padding: 1rem;
  background: rgba(251, 191, 36, 0.05);
  border: 1px solid rgba(251, 191, 36, 0.2);
  border-radius: 0.5rem;
}

.missing-text {
  font-size: 0.875rem;
  color: rgba(251, 191, 36, 0.9);
  margin: 0 0 0.5rem 0;
}

.prompt-text {
  font-size: 0.875rem;
  color: rgba(203, 213, 225, 0.9);
  margin: 0;
}

.prompt-text strong {
  color: rgba(241, 245, 249, 1);
}

/* Input Groups */
.input-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.input-label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: rgba(203, 213, 225, 0.9);
}

/* Rating Selector */
.rating-selector {
  display: flex;
  gap: 0.375rem;
}

.rating-btn {
  flex: 1;
  padding: 0.5rem 0.75rem;
  background: rgba(51, 65, 85, 0.5);
  border: 1px solid rgba(71, 85, 105, 0.5);
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: rgba(148, 163, 184, 0.9);
  cursor: pointer;
  transition: all 0.2s ease;
}

.rating-btn:hover {
  background: rgba(71, 85, 105, 0.5);
  border-color: rgba(100, 116, 139, 0.6);
}

.rating-btn.active {
  border-color: rgba(249, 115, 22, 0.6);
  color: rgba(241, 245, 249, 1);
}

.rating-btn.active.rating-s {
  background: rgba(249, 115, 22, 0.2);
}

.rating-btn.active.rating-a {
  background: rgba(251, 191, 36, 0.2);
}

.rating-btn.active.rating-b {
  background: rgba(59, 130, 246, 0.2);
}

.rating-btn.active.rating-c {
  background: rgba(34, 197, 94, 0.2);
}

.rating-btn.active.rating-d {
  background: rgba(148, 163, 184, 0.2);
}

/* Reason Textarea */
.reason-textarea {
  width: 100%;
  padding: 0.75rem 1rem;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(71, 85, 105, 0.5);
  border-radius: 0.5rem;
  color: rgba(226, 232, 240, 1);
  font-size: 0.875rem;
  font-family: inherit;
  line-height: 1.5;
  resize: vertical;
  min-height: 80px;
  transition: all 0.2s ease;
}

.reason-textarea:hover {
  border-color: rgba(100, 116, 139, 0.6);
}

.reason-textarea:focus {
  outline: none;
  border-color: rgba(249, 115, 22, 0.6);
  box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.15);
}

.reason-textarea::placeholder {
  color: rgba(148, 163, 184, 0.5);
}

.input-hint {
  font-size: 0.75rem;
  color: rgba(148, 163, 184, 0.6);
  margin: 0;
}

/* Note Text */
.note-text {
  font-size: 0.75rem;
  color: rgba(148, 163, 184, 0.6);
  font-style: italic;
  margin: 0;
  padding-top: 0.5rem;
  border-top: 1px solid rgba(71, 85, 105, 0.3);
}

/* ==================
   FOOTER
   ================== */

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  background: rgba(15, 23, 42, 0.3);
  border-top: 1px solid rgba(71, 85, 105, 0.4);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  border: none;
}

.btn-skip {
  background: rgba(71, 85, 105, 0.5);
  color: rgba(203, 213, 225, 0.9);
}

.btn-skip:hover {
  background: rgba(71, 85, 105, 0.7);
  color: rgba(241, 245, 249, 1);
}

.btn-accept {
  background: rgba(249, 115, 22, 0.9);
  color: white;
}

.btn-accept:hover {
  background: rgba(249, 115, 22, 1);
  box-shadow: 0 0 16px rgba(249, 115, 22, 0.4);
}

/* ==================
   TRANSITIONS
   ================== */

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-active .modal-content,
.modal-leave-active .modal-content {
  transition: transform 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: scale(0.95);
}

/* ==================
   RESPONSIVE
   ================== */

@media (max-width: 640px) {
  .modal-content {
    margin: 0 0.5rem;
    max-height: 90vh;
    overflow-y: auto;
  }

  .modal-body {
    padding: 1rem;
  }

  .relationship-visual {
    flex-direction: column;
    gap: 0.75rem;
  }

  .arrow-container {
    transform: rotate(90deg);
  }

  .char-badge {
    flex-direction: row;
    gap: 0.75rem;
  }

  .char-icon {
    width: 40px;
    height: 40px;
  }

  .rating-selector {
    flex-wrap: wrap;
  }

  .rating-btn {
    min-width: calc(33% - 0.25rem);
    flex: 0 1 auto;
  }

  .modal-footer {
    flex-direction: column;
    gap: 0.5rem;
  }

  .btn {
    width: 100%;
  }
}
</style>
