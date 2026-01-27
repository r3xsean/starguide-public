<script setup lang="ts">
import { ref, computed } from 'vue';
import type { TeamComposition, Character } from '../../../types';
import CompositionEditor from '../editors/CompositionEditor.vue';

// ==================
// PROPS & EMITS
// ==================

interface Props {
  modelValue: TeamComposition[];
  allCharacters: Character[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: TeamComposition[]];
}>();

// ==================
// STATE
// ==================

const isExpanded = ref(true);

// ==================
// COMPUTED
// ==================

const compositions = computed(() => props.modelValue || []);

const count = computed(() => compositions.value.length);

const primaryCount = computed(() => compositions.value.filter(c => c.isPrimary).length);

const primaryValidation = computed(() => {
  if (primaryCount.value === 0) {
    return { valid: false, message: 'No primary composition set. Exactly one composition must be marked as primary.' };
  }
  if (primaryCount.value > 1) {
    return { valid: false, message: `Multiple primary compositions (${primaryCount.value}). Only one should be primary.` };
  }
  return { valid: true, message: '' };
});

// Check if a composition is the only primary (to prevent unchecking)
function isOnlyPrimary(index: number): boolean {
  if (!compositions.value[index]?.isPrimary) return false;
  return primaryCount.value === 1;
}

// ==================
// HANDLERS
// ==================

function toggleExpanded() {
  isExpanded.value = !isExpanded.value;
}

function updateComposition(index: number, value: TeamComposition) {
  const updated = [...compositions.value];

  // If this composition is being set as primary, unset all others
  if (value.isPrimary && !compositions.value[index]?.isPrimary) {
    for (let i = 0; i < updated.length; i++) {
      const comp = updated[i];
      if (comp && i !== index && comp.isPrimary) {
        updated[i] = { ...comp, isPrimary: false };
      }
    }
  }

  updated[index] = value;
  emit('update:modelValue', updated);
}

function addComposition() {
  const updated = [...compositions.value];
  updated.push({
    id: '',
    name: 'New Composition',
    description: '',
    isPrimary: compositions.value.length === 0, // First one is primary
    coreMechanic: '',
    structure: { dps: 1, amplifier: 2, sustain: 1 },
  });
  emit('update:modelValue', updated);
}

function deleteComposition(index: number) {
  const updated = [...compositions.value];
  const wasDeleted = updated[index];
  updated.splice(index, 1);

  // If we deleted the primary and there are remaining compositions,
  // make the first one primary
  const firstComp = updated[0];
  if (wasDeleted?.isPrimary && updated.length > 0 && firstComp) {
    updated[0] = { ...firstComp, isPrimary: true };
  }

  emit('update:modelValue', updated);
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
        <span class="header-title">Compositions</span>
        <span v-if="count > 0" class="header-count">{{ count }}</span>
        <span
          v-if="!primaryValidation.valid && count > 0"
          class="header-warning"
          :title="primaryValidation.message"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </span>
      </div>
    </button>

    <!-- Section Content -->
    <Transition name="section-expand">
      <div v-if="isExpanded" class="section-content">
        <!-- Section Description -->
        <p class="section-description">
          Define different team contexts for this character. The <strong>Primary</strong> composition is shown by default; others appear when users select them from the dropdown. Use compositions to handle different playstyles (e.g., "Hypercarry" vs "Dual DPS").
        </p>

        <!-- Validation Warning Banner -->
        <div v-if="!primaryValidation.valid && count > 0" class="validation-warning">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{{ primaryValidation.message }}</span>
        </div>

        <!-- Empty State -->
        <div v-if="count === 0" class="empty-state">
          <span class="empty-title">No compositions yet</span>
          <span class="empty-hint">Add at least one composition to define team structures and pre-built teams. Most characters have a "Hypercarry" or "Standard" composition as their primary.</span>
        </div>

        <!-- Compositions List -->
        <div class="compositions-list">
          <div
            v-for="(composition, index) in compositions"
            :key="composition.id || index"
            :data-field-path="`compositions[${index}]`"
            class="composition-wrapper"
          >
            <CompositionEditor
              :model-value="composition"
              :all-characters="allCharacters"
              :is-only-primary="isOnlyPrimary(index)"
              @update:model-value="updateComposition(index, $event)"
              @delete="deleteComposition(index)"
            />
          </div>
        </div>

        <!-- Add Button -->
        <button
          type="button"
          class="add-btn"
          @click="addComposition"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>Add Composition</span>
        </button>
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

.header-warning {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: rgba(251, 191, 36, 0.9);
}

.header-warning svg {
  width: 18px;
  height: 18px;
}

/* ==================
   SECTION CONTENT
   ================== */

.section-content {
  padding: 0 1.25rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.section-description {
  margin: 0;
  font-size: 0.8125rem;
  color: rgba(148, 163, 184, 0.85);
  line-height: 1.5;
}

.section-description strong {
  color: rgba(251, 146, 60, 0.95);
}

/* ==================
   VALIDATION WARNING
   ================== */

.validation-warning {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.3);
  border-radius: 0.5rem;
  color: rgba(251, 191, 36, 0.95);
  font-size: 0.8125rem;
}

.validation-warning svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

/* ==================
   COMPOSITIONS LIST
   ================== */

.compositions-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.composition-wrapper {
  border-radius: 0.75rem;
  transition: box-shadow 0.3s ease, outline 0.3s ease;
}

.composition-wrapper.highlight-error {
  outline: 2px solid rgba(251, 146, 60, 0.8);
  box-shadow: 0 0 12px rgba(251, 146, 60, 0.4);
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
  color: rgba(148, 163, 184, 0.7);
  line-height: 1.5;
  max-width: 400px;
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
  max-height: 5000px;
}
</style>
