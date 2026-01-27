<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Role } from '../../../types';

// ==================
// TYPES
// ==================

interface ClassificationData {
  roles: Role[];
  description?: string;
  labels?: string[];
}

// ==================
// PROPS & EMITS
// ==================

interface Props {
  modelValue: ClassificationData;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: ClassificationData];
}>();

// ==================
// STATE
// ==================

const isExpanded = ref(true);
const newLabelInput = ref('');

// ==================
// CONSTANTS
// ==================

const ALL_ROLES: Role[] = ['DPS', 'Support DPS', 'Amplifier', 'Sustain'];

const DESCRIPTION_MIN = 150;
const DESCRIPTION_MAX = 250;
const LABELS_MIN = 5;
const LABELS_MAX = 12;

// ==================
// COMPUTED
// ==================

const currentDescription = computed(() => props.modelValue.description || '');
const currentLabels = computed(() => props.modelValue.labels || []);

const descriptionLength = computed(() => currentDescription.value.length);
const descriptionValid = computed(
  () => descriptionLength.value >= DESCRIPTION_MIN && descriptionLength.value <= DESCRIPTION_MAX
);
const descriptionWarning = computed(() => {
  if (descriptionLength.value === 0) return 'Description is required';
  if (descriptionLength.value < DESCRIPTION_MIN)
    return `Too short (${descriptionLength.value}/${DESCRIPTION_MIN} min)`;
  if (descriptionLength.value > DESCRIPTION_MAX)
    return `Too long (${descriptionLength.value}/${DESCRIPTION_MAX} max)`;
  return null;
});

const labelsCount = computed(() => currentLabels.value.length);
const labelsValid = computed(
  () => labelsCount.value >= LABELS_MIN && labelsCount.value <= LABELS_MAX
);
const labelsWarning = computed(() => {
  if (labelsCount.value < LABELS_MIN) return `Need at least ${LABELS_MIN} labels`;
  if (labelsCount.value > LABELS_MAX) return `Maximum ${LABELS_MAX} labels`;
  return null;
});

// ==================
// HANDLERS
// ==================

function toggleExpanded() {
  isExpanded.value = !isExpanded.value;
}

function toggleRole(role: Role) {
  const currentRoles = [...props.modelValue.roles];
  const index = currentRoles.indexOf(role);

  if (index === -1) {
    currentRoles.push(role);
  } else {
    currentRoles.splice(index, 1);
  }

  emit('update:modelValue', {
    ...props.modelValue,
    roles: currentRoles,
  });
}

function updateDescription(value: string) {
  emit('update:modelValue', {
    ...props.modelValue,
    description: value,
  });
}

function addLabel() {
  const label = newLabelInput.value.trim();
  if (!label) return;
  if (currentLabels.value.includes(label)) return;
  if (labelsCount.value >= LABELS_MAX) return;

  emit('update:modelValue', {
    ...props.modelValue,
    labels: [...currentLabels.value, label],
  });
  newLabelInput.value = '';
}

function removeLabel(label: string) {
  emit('update:modelValue', {
    ...props.modelValue,
    labels: currentLabels.value.filter((l) => l !== label),
  });
}

function handleLabelKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault();
    addLabel();
  }
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
        <span class="header-title">Classification</span>
      </div>
    </button>

    <!-- Section Content -->
    <Transition name="section-expand">
      <div v-if="isExpanded" class="section-content">
        <!-- Section Description -->
        <p class="section-description">
          Define how this character is categorized and searchable. Roles determine which teammate categories they appear in. Labels help users filter and find characters.
        </p>

        <!-- Roles Multi-Select -->
        <div class="form-group">
          <label class="form-label">Roles</label>
          <div class="roles-grid">
            <label
              v-for="role in ALL_ROLES"
              :key="role"
              class="role-checkbox"
              :class="{ checked: modelValue.roles.includes(role) }"
            >
              <input
                type="checkbox"
                :checked="modelValue.roles.includes(role)"
                @change="toggleRole(role)"
                class="role-input"
              />
              <span class="role-label">{{ role }}</span>
            </label>
          </div>
        </div>

        <!-- Description Textarea -->
        <div class="form-group">
          <div class="label-row">
            <label class="form-label" for="description-input">Description</label>
            <span
              class="char-count"
              :class="{
                valid: descriptionValid,
                warning: !descriptionValid && descriptionLength > 0,
              }"
            >
              {{ descriptionLength }}/{{ DESCRIPTION_MIN }}-{{ DESCRIPTION_MAX }}
            </span>
          </div>
          <textarea
            id="description-input"
            class="form-textarea"
            :class="{ invalid: !descriptionValid && descriptionLength > 0 }"
            :value="currentDescription"
            @input="updateDescription(($event.target as HTMLTextAreaElement).value)"
            placeholder="Brief description of the character's playstyle..."
            rows="3"
          ></textarea>
          <p v-if="descriptionWarning" class="field-warning">
            {{ descriptionWarning }}
          </p>
        </div>

        <!-- Labels Tag Input -->
        <div class="form-group">
          <div class="label-row">
            <label class="form-label">Labels</label>
            <span
              class="tag-count"
              :class="{
                valid: labelsValid,
                warning: !labelsValid,
              }"
            >
              {{ labelsCount }}/{{ LABELS_MIN }}-{{ LABELS_MAX }} labels
            </span>
          </div>

          <!-- Existing Labels -->
          <div class="labels-container" v-if="currentLabels.length > 0">
            <div
              v-for="label in currentLabels"
              :key="label"
              class="label-chip"
            >
              <span class="chip-text">{{ label }}</span>
              <button
                type="button"
                class="chip-remove"
                @click="removeLabel(label)"
                :aria-label="`Remove ${label}`"
              >
                <svg viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fill-rule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </div>

          <!-- Add Label Input -->
          <div class="add-label-row">
            <input
              type="text"
              class="form-input label-input"
              v-model="newLabelInput"
              @keydown="handleLabelKeydown"
              placeholder="Add a label..."
              :disabled="labelsCount >= LABELS_MAX"
            />
            <button
              type="button"
              class="add-label-btn"
              @click="addLabel"
              :disabled="!newLabelInput.trim() || labelsCount >= LABELS_MAX"
            >
              Add
            </button>
          </div>
          <p v-if="labelsWarning" class="field-warning">
            {{ labelsWarning }}
          </p>
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

/* ==================
   FORM ELEMENTS
   ================== */

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: rgba(148, 163, 184, 1);
}

.label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.char-count,
.tag-count {
  font-size: 0.75rem;
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  color: rgba(100, 116, 139, 0.8);
}

.char-count.valid,
.tag-count.valid {
  color: rgba(74, 222, 128, 0.8);
}

.char-count.warning,
.tag-count.warning {
  color: rgba(251, 191, 36, 0.8);
}

/* ==================
   ROLES GRID
   ================== */

.roles-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
}

@media (min-width: 480px) {
  .roles-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

.role-checkbox {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem;
  background: rgba(51, 65, 85, 0.3);
  border: 1px solid rgba(71, 85, 105, 0.5);
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.role-checkbox:hover {
  background: rgba(71, 85, 105, 0.3);
  border-color: rgba(100, 116, 139, 0.6);
}

.role-checkbox.checked {
  background: rgba(249, 115, 22, 0.15);
  border-color: rgba(249, 115, 22, 0.5);
}

.role-input {
  appearance: none;
  width: 1rem;
  height: 1rem;
  border: 2px solid rgba(71, 85, 105, 0.6);
  border-radius: 0.25rem;
  background: rgba(30, 41, 59, 0.5);
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.role-checkbox.checked .role-input {
  border-color: rgba(249, 115, 22, 0.8);
  background: rgba(249, 115, 22, 0.8);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='white'%3E%3Cpath fill-rule='evenodd' d='M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z' clip-rule='evenodd'/%3E%3C/svg%3E");
  background-size: 0.75rem;
  background-position: center;
  background-repeat: no-repeat;
}

.role-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: rgba(203, 213, 225, 0.9);
}

.role-checkbox.checked .role-label {
  color: rgba(251, 146, 60, 0.95);
}

/* ==================
   TEXTAREA
   ================== */

.form-textarea {
  width: 100%;
  padding: 0.75rem 0.875rem;
  background: rgba(51, 65, 85, 0.5);
  border: 1px solid rgba(71, 85, 105, 0.6);
  border-radius: 0.5rem;
  color: rgba(226, 232, 240, 1);
  font-size: 0.9375rem;
  font-family: inherit;
  line-height: 1.5;
  resize: vertical;
  transition: all 0.2s ease;
}

.form-textarea:hover {
  border-color: rgba(100, 116, 139, 0.8);
}

.form-textarea:focus {
  outline: none;
  border-color: rgba(249, 115, 22, 0.6);
  box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.15);
}

.form-textarea.invalid {
  border-color: rgba(251, 191, 36, 0.6);
}

.form-textarea::placeholder {
  color: rgba(100, 116, 139, 0.6);
}

/* ==================
   LABELS / TAGS
   ================== */

.labels-container {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.5rem;
  background: rgba(15, 23, 42, 0.3);
  border: 1px solid rgba(71, 85, 105, 0.3);
  border-radius: 0.5rem;
  min-height: 2.5rem;
}

.label-chip {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.375rem 0.25rem 0.625rem;
  background: rgba(99, 102, 241, 0.2);
  border: 1px solid rgba(99, 102, 241, 0.4);
  border-radius: 9999px;
  font-size: 0.8125rem;
  color: rgba(165, 180, 252, 0.95);
}

.chip-text {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  background: rgba(239, 68, 68, 0.2);
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s ease;
}

.chip-remove svg {
  width: 0.75rem;
  height: 0.75rem;
  color: rgba(239, 68, 68, 0.8);
}

.chip-remove:hover {
  background: rgba(239, 68, 68, 0.4);
}

.chip-remove:hover svg {
  color: rgba(252, 165, 165, 1);
}

/* ==================
   ADD LABEL INPUT
   ================== */

.add-label-row {
  display: flex;
  gap: 0.5rem;
}

.form-input {
  flex: 1;
  padding: 0.625rem 0.875rem;
  background: rgba(51, 65, 85, 0.5);
  border: 1px solid rgba(71, 85, 105, 0.6);
  border-radius: 0.5rem;
  color: rgba(226, 232, 240, 1);
  font-size: 0.9375rem;
  font-family: inherit;
  transition: all 0.2s ease;
}

.form-input:hover:not(:disabled) {
  border-color: rgba(100, 116, 139, 0.8);
}

.form-input:focus {
  outline: none;
  border-color: rgba(249, 115, 22, 0.6);
  box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.15);
}

.form-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.form-input::placeholder {
  color: rgba(100, 116, 139, 0.6);
}

.add-label-btn {
  padding: 0.625rem 1rem;
  background: rgba(99, 102, 241, 0.2);
  border: 1px solid rgba(99, 102, 241, 0.4);
  border-radius: 0.5rem;
  color: rgba(165, 180, 252, 0.95);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.add-label-btn:hover:not(:disabled) {
  background: rgba(99, 102, 241, 0.3);
  border-color: rgba(99, 102, 241, 0.6);
}

.add-label-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ==================
   WARNINGS
   ================== */

.field-warning {
  font-size: 0.8125rem;
  color: rgba(251, 191, 36, 0.9);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.field-warning::before {
  content: '!';
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1rem;
  height: 1rem;
  background: rgba(251, 191, 36, 0.2);
  border-radius: 50%;
  font-size: 0.6875rem;
  font-weight: 700;
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
  max-height: 800px;
}
</style>
