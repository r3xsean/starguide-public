<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted } from 'vue';
import type { SynergyModifier, Character } from '../../../types';

// Auto-resize textarea
const reasonTextarea = ref<HTMLTextAreaElement | null>(null);

function autoResize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

interface Props {
  modelValue: SynergyModifier;
  allCharacters: Character[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: SynergyModifier];
  delete: [];
}>();

// Sorted character list for picker
const sortedCharacters = computed(() => {
  return [...props.allCharacters].sort((a, b) => a.name.localeCompare(b.name));
});

// Auto-resize on value change
watch(() => props.modelValue.reason, () => {
  nextTick(() => autoResize(reasonTextarea.value));
});

onMounted(() => {
  nextTick(() => autoResize(reasonTextarea.value));
});


function updateField<K extends keyof SynergyModifier>(field: K, value: SynergyModifier[K]) {
  emit('update:modelValue', {
    ...props.modelValue,
    [field]: value,
  });
}

function handleModifierInput(event: Event) {
  const target = event.target as HTMLInputElement;
  const value = parseFloat(target.value);
  if (!isNaN(value)) {
    updateField('modifier', value);
  }
}
</script>

<template>
  <div class="synergy-modifier-editor">
    <!-- Header with delete button -->
    <div class="editor-header">
      <span class="header-label">Synergy Modifier</span>
      <button
        type="button"
        class="delete-btn"
        title="Remove synergy modifier"
        @click="emit('delete')"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
          <line x1="10" y1="11" x2="10" y2="17" />
          <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
      </button>
    </div>

    <!-- Character Picker -->
    <div class="form-group">
      <label class="form-label">With Character</label>
      <select
        :value="modelValue.withCharacterId"
        class="form-select"
        @change="updateField('withCharacterId', ($event.target as HTMLSelectElement).value)"
      >
        <option value="" disabled>Select a character...</option>
        <option
          v-for="char in sortedCharacters"
          :key="char.id"
          :value="char.id"
        >
          {{ char.name }}
        </option>
      </select>
    </div>

    <!-- Modifier Input -->
    <div class="form-group">
      <label class="form-label">
        Modifier
        <span class="label-hint">(+10 = one tier improvement)</span>
      </label>
      <input
        type="number"
        :value="modelValue.modifier"
        class="form-input modifier-input"
        step="1"
        @input="handleModifierInput"
      />
      <div class="modifier-preview">
        <span v-if="modelValue.modifier > 0" class="modifier-positive">
          +{{ modelValue.modifier }} boost
        </span>
        <span v-else-if="modelValue.modifier < 0" class="modifier-negative">
          {{ modelValue.modifier }} penalty
        </span>
        <span v-else class="modifier-neutral">
          No effect
        </span>
      </div>
    </div>

    <!-- Reason Textarea -->
    <div class="form-group">
      <label class="form-label">Reason</label>
      <textarea
        ref="reasonTextarea"
        :value="modelValue.reason"
        class="form-textarea auto-resize"
        rows="2"
        placeholder="Why does this investment affect synergy with this character?"
        @input="updateField('reason', ($event.target as HTMLTextAreaElement).value); autoResize($event.target as HTMLTextAreaElement)"
      ></textarea>
    </div>
  </div>
</template>

<style scoped>
.synergy-modifier-editor {
  background: rgba(30, 41, 59, 0.5);
  border: 1px solid rgba(71, 85, 105, 0.5);
  border-radius: 0.5rem;
  padding: 0.875rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.25rem;
}

.header-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(148, 163, 184, 0.9);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.delete-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 0.375rem;
  color: rgba(248, 113, 113, 0.8);
  cursor: pointer;
  transition: all 0.2s;
}

.delete-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.5);
  color: rgb(248, 113, 113);
}

.delete-btn svg {
  width: 14px;
  height: 14px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.form-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: rgba(203, 213, 225, 0.9);
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.label-hint {
  font-size: 0.6875rem;
  font-weight: 400;
  color: rgba(148, 163, 184, 0.7);
}

.form-select,
.form-input,
.form-textarea {
  width: 100%;
  padding: 0.5rem 0.75rem;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(71, 85, 105, 0.5);
  border-radius: 0.375rem;
  color: white;
  font-size: 0.875rem;
  font-family: inherit;
  transition: all 0.2s;
}

.form-select:focus,
.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: rgba(251, 146, 60, 0.6);
  box-shadow: 0 0 0 2px rgba(251, 146, 60, 0.15);
}

.form-select {
  cursor: pointer;
}

.form-select option {
  background: #1e293b;
  color: white;
}

.form-textarea {
  resize: vertical;
  min-height: 60px;
}

.form-textarea.auto-resize {
  resize: none;
  overflow: hidden;
}

.modifier-input {
  width: 100%;
  max-width: 120px;
}

.modifier-preview {
  font-size: 0.75rem;
  margin-top: 0.25rem;
}

.modifier-positive {
  color: rgba(34, 197, 94, 0.9);
}

.modifier-negative {
  color: rgba(248, 113, 113, 0.9);
}

.modifier-neutral {
  color: rgba(148, 163, 184, 0.7);
}
</style>
