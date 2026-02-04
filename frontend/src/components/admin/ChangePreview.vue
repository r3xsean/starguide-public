<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Character, TeammateRec } from '../../types';
import type { TierEdits } from '../../composables/useCharacterEditor';
import {
  type SectionDiff,
  computeAllSectionDiffs,
  formatCharacterName,
} from '../../utils/diffUtils';
import DiffDisplay from './DiffDisplay.vue';

// ==================
// TYPES
// ==================

interface BidirectionalSuggestion {
  targetCharacterId: string;
  suggestionType: 'add' | 'update' | 'remove';
  targetField: string;
  suggestedValue: TeammateRec;
  reason: string;
}

// ==================
// PROPS
// ==================

const props = defineProps<{
  show: boolean;
  originalData: Character | null;
  editedData: Character | null;
  tierEdits: TierEdits | null;
  originalTiers: TierEdits | null;
  changedFields: string[];
  bidirectionalSuggestions: BidirectionalSuggestion[];
}>();

// ==================
// EMITS
// ==================

const emit = defineEmits<{
  close: [];
  submit: [changeSummary: string];
}>();

// ==================
// STATE
// ==================

const changeSummary = ref('');

// ==================
// COMPUTED
// ==================

const characterName = computed(() => {
  return props.editedData?.name || props.originalData?.name || 'Unknown';
});

const canSubmit = computed(() => {
  return changeSummary.value.trim().length >= 10;
});

// Compute diffs organized by section using shared utility
const sectionDiffs = computed((): SectionDiff[] => {
  if (!props.originalData || !props.editedData) return [];
  return computeAllSectionDiffs(
    props.originalData,
    props.editedData,
    props.originalTiers,
    props.tierEdits
  );
});

// ==================
// HELPER FUNCTIONS
// ==================

function formatCategoryLabel(field: string): string {
  const labels: Record<string, string> = {
    'baseTeammates.amplifiers': 'Amplifiers',
    'baseTeammates.sustains': 'Sustains',
    'baseTeammates.dps': 'DPS',
    'baseTeammates.subDPS': 'Sub DPS',
  };
  return labels[field] || field;
}

// ==================
// ACTIONS
// ==================

function handleClose() {
  changeSummary.value = '';
  emit('close');
}

function handleSubmit() {
  if (!canSubmit.value) return;
  emit('submit', changeSummary.value.trim());
  changeSummary.value = '';
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="show" class="modal-overlay" @click.self="handleClose">
        <div class="modal-content">
          <!-- Header -->
          <div class="modal-header">
            <h2 class="modal-title">Preview Changes for {{ characterName }}</h2>
            <button class="close-btn" @click="handleClose">
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
            <!-- Diff Display Component -->
            <DiffDisplay
              :sections="sectionDiffs"
              mode="compact"
            />

            <!-- Bidirectional Suggestions -->
            <div v-if="bidirectionalSuggestions.length > 0" class="bidirectional-section">
              <div class="bidirectional-header">
                <svg viewBox="0 0 20 20" fill="currentColor" class="bidirectional-icon">
                  <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd" />
                </svg>
                <span>Bidirectional Suggestions ({{ bidirectionalSuggestions.length }})</span>
              </div>
              <div class="bidirectional-list">
                <div
                  v-for="(suggestion, idx) in bidirectionalSuggestions"
                  :key="idx"
                  class="bidirectional-item"
                >
                  <span class="bullet">-</span>
                  <span class="suggestion-text">
                    {{ suggestion.suggestionType === 'add' ? 'Add' : suggestion.suggestionType === 'update' ? 'Update' : 'Remove' }}
                    <strong>{{ characterName }}</strong>
                    ({{ suggestion.suggestedValue.rating }})
                    {{ suggestion.suggestionType === 'remove' ? 'from' : 'to' }}
                    <strong>{{ formatCharacterName(suggestion.targetCharacterId) }}</strong>'s
                    {{ formatCategoryLabel(`baseTeammates.${suggestion.targetField}`) }} list
                  </span>
                </div>
              </div>
              <p class="bidirectional-note">
                These suggestions will be created when your edit is submitted for review.
              </p>
            </div>

            <!-- Change Summary -->
            <div class="summary-section">
              <label class="summary-label">
                Change Summary <span class="required">(required)</span>
              </label>
              <textarea
                v-model="changeSummary"
                class="summary-textarea"
                placeholder="Describe what you changed and why..."
                rows="4"
              ></textarea>
              <div class="summary-hint">
                <span :class="{ 'hint-error': changeSummary.length > 0 && changeSummary.length < 10 }">
                  {{ changeSummary.length }}/10 minimum characters
                </span>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="modal-footer">
            <button class="btn btn-cancel" @click="handleClose">
              Cancel
            </button>
            <button
              class="btn btn-submit"
              :disabled="!canSubmit"
              @click="handleSubmit"
            >
              Submit for Review
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ==================
   MODAL OVERLAY
   ================== */

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal-content {
  background: rgb(30, 41, 59);
  border: 1px solid rgba(71, 85, 105, 0.6);
  border-radius: 0.75rem;
  max-width: 700px;
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}

/* ==================
   HEADER
   ================== */

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid rgba(71, 85, 105, 0.5);
}

.modal-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: rgba(241, 245, 249, 1);
  margin: 0;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  background: transparent;
  border: none;
  border-radius: 0.375rem;
  color: rgba(148, 163, 184, 0.8);
  cursor: pointer;
  transition: all 0.15s ease;
}

.close-btn:hover {
  background: rgba(51, 65, 85, 0.5);
  color: rgba(226, 232, 240, 1);
}

.close-btn svg {
  width: 1.25rem;
  height: 1.25rem;
}

/* ==================
   BODY
   ================== */

.modal-body {
  flex: 1;
  padding: 1.25rem 1.5rem;
  overflow-y: auto;
}

.modal-body::-webkit-scrollbar {
  width: 8px;
}

.modal-body::-webkit-scrollbar-track {
  background: rgba(15, 23, 42, 0.3);
}

.modal-body::-webkit-scrollbar-thumb {
  background: rgba(71, 85, 105, 0.5);
  border-radius: 4px;
}

/* ==================
   BIDIRECTIONAL SECTION
   ================== */

.bidirectional-section {
  background: rgba(96, 165, 250, 0.05);
  border: 1px solid rgba(96, 165, 250, 0.2);
  border-radius: 0.5rem;
  padding: 1rem;
  margin-bottom: 1.25rem;
}

.bidirectional-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: rgba(96, 165, 250, 0.95);
  margin-bottom: 0.75rem;
}

.bidirectional-icon {
  width: 1.125rem;
  height: 1.125rem;
}

.bidirectional-list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.bidirectional-item {
  display: flex;
  gap: 0.5rem;
  font-size: 0.8125rem;
  color: rgba(203, 213, 225, 0.9);
  line-height: 1.5;
}

.bullet {
  color: rgba(148, 163, 184, 0.5);
  flex-shrink: 0;
}

.suggestion-text strong {
  color: rgba(241, 245, 249, 1);
}

.bidirectional-note {
  margin-top: 0.75rem;
  padding-top: 0.625rem;
  border-top: 1px solid rgba(96, 165, 250, 0.15);
  font-size: 0.6875rem;
  color: rgba(148, 163, 184, 0.6);
  font-style: italic;
}

/* ==================
   SUMMARY SECTION
   ================== */

.summary-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.summary-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: rgba(226, 232, 240, 1);
}

.required {
  color: rgba(148, 163, 184, 0.6);
  font-weight: 400;
}

.summary-textarea {
  width: 100%;
  padding: 0.75rem;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(71, 85, 105, 0.5);
  border-radius: 0.5rem;
  color: rgba(226, 232, 240, 1);
  font-size: 0.875rem;
  font-family: inherit;
  line-height: 1.5;
  resize: vertical;
  min-height: 100px;
  transition: all 0.2s ease;
}

.summary-textarea:hover {
  border-color: rgba(100, 116, 139, 0.6);
}

.summary-textarea:focus {
  outline: none;
  border-color: rgba(249, 115, 22, 0.6);
  box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.15);
}

.summary-textarea::placeholder {
  color: rgba(148, 163, 184, 0.5);
}

.summary-hint {
  font-size: 0.75rem;
  color: rgba(148, 163, 184, 0.6);
}

.hint-error {
  color: rgba(239, 68, 68, 0.8);
}

/* ==================
   FOOTER
   ================== */

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid rgba(71, 85, 105, 0.5);
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

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-cancel {
  background: rgba(71, 85, 105, 0.5);
  color: rgba(226, 232, 240, 1);
}

.btn-cancel:hover:not(:disabled) {
  background: rgba(71, 85, 105, 0.7);
}

.btn-submit {
  background: rgba(249, 115, 22, 0.9);
  color: white;
}

.btn-submit:hover:not(:disabled) {
  background: rgba(249, 115, 22, 1);
  box-shadow: 0 0 16px rgba(249, 115, 22, 0.4);
}

/* ==================
   MODAL TRANSITIONS
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
  transform: scale(0.95) translateY(10px);
}

/* ==================
   RESPONSIVE
   ================== */

@media (max-width: 640px) {
  .modal-content {
    max-height: 95vh;
    margin: 0.5rem;
  }

  .modal-header {
    padding: 1rem;
  }

  .modal-title {
    font-size: 1.125rem;
  }

  .modal-body {
    padding: 1rem;
  }

  .modal-footer {
    padding: 0.875rem 1rem;
    flex-direction: column-reverse;
  }

  .btn {
    width: 100%;
  }

  .diff-item-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.375rem;
  }
}
</style>
