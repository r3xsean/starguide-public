<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ValidationError } from '../../composables/useCharacterEditor';

// ==================
// PROPS
// ==================

const props = withDefaults(defineProps<{
  errors: ValidationError[];
  field?: string;
  inline?: boolean;
}>(), {
  inline: false,
});

// ==================
// EMITS
// ==================

const emit = defineEmits<{
  scrollToField: [fieldPath: string];
}>();

// ==================
// STATE
// ==================

const isCollapsed = ref(false);

// ==================
// COMPUTED
// ==================

const filteredErrors = computed(() => {
  if (props.field) {
    // Inline mode: filter to exact field or fields starting with it
    return props.errors.filter(
      e => e.field === props.field || e.field.startsWith(`${props.field}.`) || e.field.startsWith(`${props.field}[`)
    );
  }
  return props.errors;
});

const errorCount = computed(() =>
  filteredErrors.value.filter(e => e.severity === 'error').length
);

const warningCount = computed(() =>
  filteredErrors.value.filter(e => e.severity === 'warning').length
);

const hasContent = computed(() => filteredErrors.value.length > 0);

// Group errors by field category for summary mode
const groupedErrors = computed(() => {
  if (props.inline) return {};

  const groups: Record<string, ValidationError[]> = {};

  for (const error of filteredErrors.value) {
    // Extract top-level category from field path
    const fieldParts = error.field.split('.');
    const firstPart = fieldParts[0] || error.field;
    const category = firstPart.split('[')[0] || firstPart;
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(error);
  }

  return groups;
});

// ==================
// METHODS
// ==================

function handleClick(fieldPath: string) {
  emit('scrollToField', fieldPath);
}

function formatFieldPath(fieldPath: string): string {
  // Convert field paths like "baseTeammates.amplifiers[0].reason" to readable format
  return fieldPath
    .replace(/\./g, ' > ')
    .replace(/\[(\d+)\]/g, ' #$1')
    .replace(/baseTeammates/g, 'Teammates')
    .replace(/amplifiers/g, 'Amplifiers')
    .replace(/sustains/g, 'Sustains')
    .replace(/subDPS/g, 'Sub DPS')
    .replace(/dps/g, 'DPS')
    .replace(/compositions/g, 'Compositions')
    .replace(/investment/g, 'Investment')
    .replace(/lightCones/g, 'Light Cones')
    .replace(/eidolons/g, 'Eidolons')
    .replace(/teammateOverrides/g, 'Overrides');
}

function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    description: 'Description',
    labels: 'Labels',
    roles: 'Roles',
    baseTeammates: 'Base Teammates',
    compositions: 'Compositions',
    investment: 'Investment',
    tiers: 'Tier Ratings',
    restrictions: 'Restrictions',
  };
  return labels[category] || category;
}
</script>

<template>
  <!-- Inline Mode: Single field error display -->
  <div v-if="inline && hasContent" class="validation-inline">
    <div
      v-for="error in filteredErrors"
      :key="error.field + error.message"
      :class="['inline-error', `inline-${error.severity}`]"
    >
      <svg
        v-if="error.severity === 'error'"
        viewBox="0 0 20 20"
        fill="currentColor"
        class="inline-icon"
      >
        <path
          fill-rule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
          clip-rule="evenodd"
        />
      </svg>
      <svg
        v-else
        viewBox="0 0 20 20"
        fill="currentColor"
        class="inline-icon"
      >
        <path
          fill-rule="evenodd"
          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
          clip-rule="evenodd"
        />
      </svg>
      <span class="inline-message">{{ error.message }}</span>
    </div>
  </div>

  <!-- Summary Mode: Full error panel -->
  <div v-else-if="!inline && hasContent" class="validation-summary">
    <!-- Header -->
    <button
      class="summary-header"
      @click="isCollapsed = !isCollapsed"
    >
      <div class="header-left">
        <svg
          :class="['collapse-icon', { collapsed: isCollapsed }]"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fill-rule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clip-rule="evenodd"
          />
        </svg>
        <span class="header-title">Validation Issues</span>
      </div>
      <div class="header-badges">
        <span v-if="errorCount > 0" class="count-badge count-error">
          {{ errorCount }} Error{{ errorCount !== 1 ? 's' : '' }}
        </span>
        <span v-if="warningCount > 0" class="count-badge count-warning">
          {{ warningCount }} Warning{{ warningCount !== 1 ? 's' : '' }}
        </span>
      </div>
    </button>

    <!-- Error List -->
    <div v-show="!isCollapsed" class="summary-content">
      <div
        v-for="(categoryErrors, category) in groupedErrors"
        :key="category"
        class="error-category"
      >
        <div class="category-header">{{ getCategoryLabel(category) }}</div>
        <div class="category-errors">
          <button
            v-for="error in categoryErrors"
            :key="error.field + error.message"
            :class="['error-item', `error-${error.severity}`]"
            @click="handleClick(error.field)"
          >
            <span class="error-indicator">
              <svg
                v-if="error.severity === 'error'"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fill-rule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clip-rule="evenodd"
                />
              </svg>
              <svg
                v-else
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fill-rule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clip-rule="evenodd"
                />
              </svg>
            </span>
            <span class="error-field">{{ formatFieldPath(error.field) }}:</span>
            <span class="error-message">{{ error.message }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ==================
   INLINE MODE
   ================== */

.validation-inline {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-top: 0.375rem;
}

.inline-error {
  display: flex;
  align-items: flex-start;
  gap: 0.375rem;
  font-size: 0.75rem;
  line-height: 1.4;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
}

.inline-error {
  background: rgba(239, 68, 68, 0.1);
  color: rgba(239, 68, 68, 0.9);
}

.inline-warning {
  background: rgba(251, 191, 36, 0.1);
  color: rgba(251, 191, 36, 0.9);
}

.inline-icon {
  width: 0.875rem;
  height: 0.875rem;
  flex-shrink: 0;
  margin-top: 0.0625rem;
}

.inline-message {
  flex: 1;
}

/* ==================
   SUMMARY MODE
   ================== */

.validation-summary {
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 0.625rem;
  overflow: hidden;
}

/* Header */
.summary-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: rgba(239, 68, 68, 0.08);
  border: none;
  cursor: pointer;
  transition: background 0.2s ease;
}

.summary-header:hover {
  background: rgba(239, 68, 68, 0.12);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.collapse-icon {
  width: 1rem;
  height: 1rem;
  color: rgba(148, 163, 184, 0.8);
  transition: transform 0.2s ease;
}

.collapse-icon.collapsed {
  transform: rotate(-90deg);
}

.header-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: rgba(226, 232, 240, 1);
}

.header-badges {
  display: flex;
  gap: 0.5rem;
}

.count-badge {
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 0.1875rem 0.5rem;
  border-radius: 0.25rem;
}

.count-error {
  background: rgba(239, 68, 68, 0.2);
  color: rgba(239, 68, 68, 0.95);
}

.count-warning {
  background: rgba(251, 191, 36, 0.2);
  color: rgba(251, 191, 36, 0.95);
}

/* Content */
.summary-content {
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-height: 300px;
  overflow-y: auto;
}

.summary-content::-webkit-scrollbar {
  width: 6px;
}

.summary-content::-webkit-scrollbar-track {
  background: rgba(15, 23, 42, 0.3);
}

.summary-content::-webkit-scrollbar-thumb {
  background: rgba(71, 85, 105, 0.5);
  border-radius: 3px;
}

/* Category */
.error-category {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.category-header {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(148, 163, 184, 0.7);
  padding-left: 0.25rem;
}

.category-errors {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

/* Error Item */
.error-item {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.5rem 0.625rem;
  background: rgba(15, 23, 42, 0.4);
  border: 1px solid transparent;
  border-radius: 0.375rem;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;
  width: 100%;
}

.error-item:hover {
  background: rgba(15, 23, 42, 0.6);
}

.error-error {
  border-color: rgba(239, 68, 68, 0.2);
}

.error-error:hover {
  border-color: rgba(239, 68, 68, 0.4);
}

.error-warning {
  border-color: rgba(251, 191, 36, 0.2);
}

.error-warning:hover {
  border-color: rgba(251, 191, 36, 0.4);
}

.error-indicator {
  flex-shrink: 0;
  width: 1rem;
  height: 1rem;
  margin-top: 0.0625rem;
}

.error-error .error-indicator svg {
  color: rgba(239, 68, 68, 0.9);
}

.error-warning .error-indicator svg {
  color: rgba(251, 191, 36, 0.9);
}

.error-field {
  font-size: 0.75rem;
  font-weight: 500;
  color: rgba(148, 163, 184, 0.9);
  flex-shrink: 0;
}

.error-message {
  font-size: 0.75rem;
  color: rgba(203, 213, 225, 0.85);
  line-height: 1.4;
}

/* ==================
   RESPONSIVE
   ================== */

@media (max-width: 640px) {
  .summary-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .header-badges {
    width: 100%;
  }

  .error-item {
    flex-wrap: wrap;
  }

  .error-field {
    width: 100%;
  }

  .error-message {
    width: 100%;
    padding-left: 1.5rem;
  }
}
</style>
