<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Restrictions, Character } from '../../../types';

// ==================
// PROPS & EMITS
// ==================

interface Props {
  modelValue: Restrictions | undefined;
  allCharacters: Character[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: Restrictions | undefined];
}>();

// ==================
// STATE
// ==================

const isExpanded = ref(true);
const avoidExpanded = ref(true);
const warningsExpanded = ref(true);

// ==================
// COMPUTED
// ==================

const restrictions = computed(() => props.modelValue || {});

const avoidList = computed(() => restrictions.value.avoid || []);

const warnings = computed(() => restrictions.value.warnings || []);

const avoidCount = computed(() => avoidList.value.length);

const warningsCount = computed(() => warnings.value.length);

const totalCount = computed(() => avoidCount.value + warningsCount.value);

const hasAnyContent = computed(() => totalCount.value > 0);

// ==================
// HANDLERS
// ==================

function toggleExpanded() {
  isExpanded.value = !isExpanded.value;
}

function toggleAvoid() {
  avoidExpanded.value = !avoidExpanded.value;
}

function toggleWarnings() {
  warningsExpanded.value = !warningsExpanded.value;
}

function emitUpdate(newRestrictions: Restrictions) {
  // Clean up empty arrays
  const cleaned: Restrictions = {};
  if (newRestrictions.avoid && newRestrictions.avoid.length > 0) {
    cleaned.avoid = newRestrictions.avoid;
  }
  if (newRestrictions.warnings && newRestrictions.warnings.length > 0) {
    cleaned.warnings = newRestrictions.warnings;
  }

  // Emit undefined if completely empty
  const isEmpty = !cleaned.avoid && !cleaned.warnings;
  emit('update:modelValue', isEmpty ? undefined : cleaned);
}

// Avoid list handlers
function addAvoid() {
  const newAvoid = [...avoidList.value, { id: '', reason: '' }];
  emitUpdate({
    ...restrictions.value,
    avoid: newAvoid,
  });
}

function updateAvoidCharacter(index: number, id: string) {
  const newAvoid = [...avoidList.value];
  const existing = newAvoid[index];
  if (existing) {
    newAvoid[index] = { id, reason: existing.reason };
  }
  emitUpdate({
    ...restrictions.value,
    avoid: newAvoid,
  });
}

function updateAvoidReason(index: number, reason: string) {
  const newAvoid = [...avoidList.value];
  const existing = newAvoid[index];
  if (existing) {
    newAvoid[index] = { id: existing.id, reason };
  }
  emitUpdate({
    ...restrictions.value,
    avoid: newAvoid,
  });
}

function deleteAvoid(index: number) {
  const newAvoid = [...avoidList.value];
  newAvoid.splice(index, 1);
  emitUpdate({
    ...restrictions.value,
    avoid: newAvoid,
  });
}

// Warnings handlers
function addWarning() {
  const newWarnings = [...warnings.value, ''];
  emitUpdate({
    ...restrictions.value,
    warnings: newWarnings,
  });
}

function updateWarning(index: number, value: string) {
  const newWarnings = [...warnings.value];
  newWarnings[index] = value;
  emitUpdate({
    ...restrictions.value,
    warnings: newWarnings,
  });
}

function deleteWarning(index: number) {
  const newWarnings = [...warnings.value];
  newWarnings.splice(index, 1);
  emitUpdate({
    ...restrictions.value,
    warnings: newWarnings,
  });
}
</script>

<template>
  <section class="editor-section">
    <!-- Section Header -->
    <button
      type="button"
      class="section-header"
      @click="toggleExpanded"
      :aria-expanded="isExpanded"
    >
      <div class="header-content">
        <svg
          class="chevron"
          :class="{ rotated: !isExpanded }"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fill-rule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clip-rule="evenodd"
          />
        </svg>
        <span class="header-title">Restrictions & Warnings</span>
        <span v-if="totalCount > 0" class="header-count">{{ totalCount }}</span>
      </div>
    </button>

    <!-- Section Content -->
    <Transition name="section-expand">
      <div v-if="isExpanded" class="section-content">
        <!-- Section Description -->
        <p class="section-description">
          Warn users about important caveats or anti-synergies. <strong>Avoid List</strong> specifies characters that don't work well together. <strong>Warnings</strong> are general notes about limitations or situational concerns.
        </p>

        <!-- Empty State (when nothing defined) -->
        <div v-if="!hasAnyContent" class="empty-state">
          <span class="empty-title">No restrictions yet</span>
          <span class="empty-hint">This section is optional. Add restrictions if there are specific anti-synergies (e.g., "Don't pair with Bronya because...") or important warnings users should know.</span>
        </div>

        <!-- Avoid List Subsection -->
        <div class="subsection collapsible">
          <button
            type="button"
            class="subsection-header"
            @click="toggleAvoid"
          >
            <div class="subsection-header-content">
              <svg
                class="subsection-chevron"
                :class="{ rotated: !avoidExpanded }"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fill-rule="evenodd"
                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                  clip-rule="evenodd"
                />
              </svg>
              <span class="subsection-title">Characters to Avoid</span>
              <span v-if="avoidCount > 0" class="subsection-count">{{ avoidCount }}</span>
            </div>
          </button>

          <Transition name="subsection-expand">
            <div v-if="avoidExpanded" class="subsection-content">
              <p class="subsection-hint">
                Characters that should not be used together with this character due to anti-synergies.
              </p>

              <div v-if="avoidCount === 0" class="subsection-empty">
                No characters to avoid.
              </div>

              <div
                v-for="(avoid, index) in avoidList"
                :key="index"
                class="avoid-entry"
              >
                <div class="avoid-row">
                  <select
                    :value="avoid.id"
                    class="form-select character-select"
                    @change="updateAvoidCharacter(index, ($event.target as HTMLSelectElement).value)"
                  >
                    <option value="">Select character...</option>
                    <option
                      v-for="char in allCharacters"
                      :key="char.id"
                      :value="char.id"
                    >
                      {{ char.name }}
                    </option>
                  </select>
                  <button
                    type="button"
                    class="delete-btn"
                    title="Remove"
                    @click="deleteAvoid(index)"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
                <textarea
                  :value="avoid.reason"
                  class="form-textarea"
                  rows="2"
                  placeholder="Why should these characters not be used together?"
                  @input="updateAvoidReason(index, ($event.target as HTMLTextAreaElement).value)"
                ></textarea>
              </div>

              <button
                type="button"
                class="add-btn"
                @click="addAvoid"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>Add Character to Avoid</span>
              </button>
            </div>
          </Transition>
        </div>

        <!-- Warnings Subsection -->
        <div class="subsection collapsible">
          <button
            type="button"
            class="subsection-header"
            @click="toggleWarnings"
          >
            <div class="subsection-header-content">
              <svg
                class="subsection-chevron"
                :class="{ rotated: !warningsExpanded }"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fill-rule="evenodd"
                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                  clip-rule="evenodd"
                />
              </svg>
              <span class="subsection-title">General Warnings</span>
              <span v-if="warningsCount > 0" class="subsection-count">{{ warningsCount }}</span>
            </div>
          </button>

          <Transition name="subsection-expand">
            <div v-if="warningsExpanded" class="subsection-content">
              <p class="subsection-hint">
                Important caveats or considerations when using this character.
              </p>

              <div v-if="warningsCount === 0" class="subsection-empty">
                No warnings defined.
              </div>

              <div
                v-for="(warning, index) in warnings"
                :key="index"
                class="warning-entry"
              >
                <div class="warning-row">
                  <input
                    :value="warning"
                    class="form-input"
                    placeholder="Enter warning message..."
                    @input="updateWarning(index, ($event.target as HTMLInputElement).value)"
                  />
                  <button
                    type="button"
                    class="delete-btn"
                    title="Remove"
                    @click="deleteWarning(index)"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>

              <button
                type="button"
                class="add-btn"
                @click="addWarning"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>Add Warning</span>
              </button>
            </div>
          </Transition>
        </div>
      </div>
    </Transition>
  </section>
</template>

<style scoped>
/* ==================
   SECTION CONTAINER
   ================== */

.editor-section {
  background: rgba(30, 41, 59, 0.5);
  border: 1px solid rgba(71, 85, 105, 0.5);
  border-radius: 0.75rem;
  overflow: hidden;
}

/* ==================
   SECTION HEADER
   ================== */

.section-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.section-header:hover {
  background: rgba(71, 85, 105, 0.2);
}

.header-content {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.chevron {
  width: 1.25rem;
  height: 1.25rem;
  color: rgba(148, 163, 184, 0.8);
  transition: transform 0.2s ease;
}

.chevron.rotated {
  transform: rotate(-90deg);
}

.header-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: rgba(226, 232, 240, 1);
}

.header-count {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  padding: 0 0.5rem;
  background: rgba(251, 146, 60, 0.2);
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(251, 146, 60, 0.9);
}

/* ==================
   SECTION CONTENT
   ================== */

.section-content {
  padding: 0 1.25rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.section-description {
  margin: 0;
  font-size: 0.8125rem;
  color: rgba(148, 163, 184, 0.85);
  line-height: 1.5;
}

.section-description strong {
  color: rgba(239, 68, 68, 0.9);
}

/* ==================
   SUBSECTIONS
   ================== */

.subsection {
  background: rgba(15, 23, 42, 0.4);
  border: 1px solid rgba(71, 85, 105, 0.3);
  border-radius: 0.625rem;
  padding: 0;
}

.subsection-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.875rem 1rem;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background-color 0.2s ease;
  border-radius: 0.625rem;
}

.subsection-header:hover {
  background: rgba(71, 85, 105, 0.2);
}

.subsection-header-content {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.subsection-chevron {
  width: 1rem;
  height: 1rem;
  color: rgba(148, 163, 184, 0.7);
  transition: transform 0.2s ease;
}

.subsection-chevron.rotated {
  transform: rotate(-90deg);
}

.subsection-title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: rgba(203, 213, 225, 0.95);
}

.subsection-count {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 0.375rem;
  background: rgba(251, 146, 60, 0.2);
  border-radius: 10px;
  font-size: 0.6875rem;
  font-weight: 600;
  color: rgba(251, 146, 60, 0.9);
}

.subsection-content {
  padding: 0.5rem 1rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.subsection-hint {
  font-size: 0.8125rem;
  color: rgba(148, 163, 184, 0.7);
  margin-bottom: 0.25rem;
}

.subsection-empty {
  font-size: 0.8125rem;
  color: rgba(148, 163, 184, 0.5);
  font-style: italic;
  padding: 0.5rem 0;
}

/* ==================
   EMPTY STATE
   ================== */

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 2rem 1rem;
  background: rgba(15, 23, 42, 0.4);
  border: 1px dashed rgba(71, 85, 105, 0.5);
  border-radius: 0.5rem;
  text-align: center;
}

.empty-title {
  font-size: 0.875rem;
  font-weight: 500;
  color: rgba(148, 163, 184, 0.9);
}

.empty-hint {
  font-size: 0.8125rem;
  color: rgba(148, 163, 184, 0.6);
}

/* ==================
   AVOID ENTRIES
   ================== */

.avoid-entry {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  background: rgba(15, 23, 42, 0.3);
  border: 1px solid rgba(71, 85, 105, 0.25);
  border-radius: 0.5rem;
}

.avoid-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.character-select {
  flex: 1;
}

/* ==================
   WARNING ENTRIES
   ================== */

.warning-entry {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.warning-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.warning-row .form-input {
  flex: 1;
}

/* ==================
   FORM ELEMENTS
   ================== */

.form-input,
.form-select,
.form-textarea {
  width: 100%;
  padding: 0.625rem 0.875rem;
  background: rgba(51, 65, 85, 0.5);
  border: 1px solid rgba(71, 85, 105, 0.6);
  border-radius: 0.5rem;
  color: rgba(226, 232, 240, 1);
  font-size: 0.875rem;
  font-family: inherit;
  transition: all 0.2s ease;
}

.form-input:hover,
.form-select:hover,
.form-textarea:hover {
  border-color: rgba(100, 116, 139, 0.8);
}

.form-input:focus,
.form-select:focus,
.form-textarea:focus {
  outline: none;
  border-color: rgba(249, 115, 22, 0.6);
  box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.15);
}

.form-input::placeholder,
.form-textarea::placeholder {
  color: rgba(148, 163, 184, 0.5);
}

.form-select {
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%2394a3b8' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.75rem center;
  background-size: 1.25rem;
  padding-right: 2.5rem;
}

.form-select option {
  background: rgb(30, 41, 59);
  color: rgba(226, 232, 240, 1);
}

.form-textarea {
  resize: vertical;
  min-height: 60px;
}

/* ==================
   DELETE BUTTON
   ================== */

.delete-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 0.375rem;
  color: rgba(248, 113, 113, 0.8);
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.delete-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.5);
  color: rgb(248, 113, 113);
}

.delete-btn svg {
  width: 16px;
  height: 16px;
}

/* ==================
   ADD BUTTON
   ================== */

.add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: transparent;
  border: 1px dashed rgba(71, 85, 105, 0.6);
  border-radius: 0.5rem;
  color: rgba(148, 163, 184, 0.8);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.add-btn:hover {
  background: rgba(251, 146, 60, 0.1);
  border-color: rgba(251, 146, 60, 0.5);
  color: rgba(251, 146, 60, 0.9);
}

.add-btn svg {
  width: 18px;
  height: 18px;
}

/* ==================
   TRANSITIONS
   ================== */

.section-expand-enter-active,
.section-expand-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.section-expand-enter-from,
.section-expand-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.section-expand-enter-to,
.section-expand-leave-from {
  opacity: 1;
  max-height: 2000px;
}

.subsection-expand-enter-active,
.subsection-expand-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.subsection-expand-enter-from,
.subsection-expand-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.subsection-expand-enter-to,
.subsection-expand-leave-from {
  opacity: 1;
  max-height: 1500px;
}
</style>
