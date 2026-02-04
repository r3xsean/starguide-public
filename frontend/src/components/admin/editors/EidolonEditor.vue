<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import type { EidolonDefinition, Character } from '../../../types';
import SynergyModifierEditor from './SynergyModifierEditor.vue';

// Auto-resize textarea
const descTextarea = ref<HTMLTextAreaElement | null>(null);

function autoResize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

interface Props {
  modelValue: EidolonDefinition;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  allCharacters?: Character[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: EidolonDefinition];
}>();

// Collapsible state for synergy modifiers
const showSynergyModifiers = ref(false);

// Penalty severity indicator
const penaltySeverity = computed(() => {
  const p = Math.abs(props.modelValue.penalty);
  if (p >= 30) return { label: 'Transformative', color: 'text-orange-400' };
  if (p >= 20) return { label: 'Major', color: 'text-purple-400' };
  if (p >= 10) return { label: 'Significant', color: 'text-blue-400' };
  if (p >= 5) return { label: 'Minor', color: 'text-green-400' };
  return { label: 'Negligible', color: 'text-slate-400' };
});

// Synergy modifiers count
const synergyCount = computed(() => props.modelValue.synergyModifiers?.length || 0);

// Auto-resize on value change
watch(() => props.modelValue.description, () => {
  nextTick(() => autoResize(descTextarea.value));
});

onMounted(() => {
  nextTick(() => autoResize(descTextarea.value));
});

function updateField<K extends keyof EidolonDefinition>(field: K, value: EidolonDefinition[K]) {
  emit('update:modelValue', {
    ...props.modelValue,
    [field]: value,
  });
}

function handlePenaltyInput(event: Event) {
  const target = event.target as HTMLInputElement;
  let value = parseFloat(target.value);
  if (!isNaN(value)) {
    // Ensure penalty is negative or zero
    if (value > 0) value = -value;
    updateField('penalty', value);
  }
}

function updateSynergyModifier(index: number, value: typeof props.modelValue.synergyModifiers extends (infer T)[] | undefined ? T : never) {
  const modifiers = [...(props.modelValue.synergyModifiers || [])];
  modifiers[index] = value;
  updateField('synergyModifiers', modifiers);
}

function addSynergyModifier() {
  const modifiers = [...(props.modelValue.synergyModifiers || [])];
  modifiers.push({
    withCharacterId: '',
    modifier: 10,
    reason: '',
  });
  updateField('synergyModifiers', modifiers);
}

function deleteSynergyModifier(index: number) {
  const modifiers = [...(props.modelValue.synergyModifiers || [])];
  modifiers.splice(index, 1);
  updateField('synergyModifiers', modifiers.length > 0 ? modifiers : undefined);
}
</script>

<template>
  <div class="eidolon-editor">
    <!-- Header with level badge -->
    <div class="editor-header">
      <div class="level-badge">E{{ level }}</div>
      <div class="penalty-info">
        <span class="penalty-value">{{ modelValue.penalty }}</span>
        <span class="penalty-severity" :class="penaltySeverity.color">
          {{ penaltySeverity.label }}
        </span>
      </div>
    </div>

    <!-- Penalty Input -->
    <div class="form-group">
      <label class="form-label">
        Penalty
        <span class="label-hint">(negative value, -40 to -1)</span>
      </label>
      <input
        type="number"
        :value="modelValue.penalty"
        class="form-input penalty-input"
        :max="0"
        step="1"
        @input="handlePenaltyInput"
      />
      <div class="penalty-guide">
        <span>-30 to -40: Transformative</span>
        <span>-20 to -29: Major</span>
        <span>-10 to -19: Significant</span>
        <span>-5 to -9: Minor</span>
        <span>-1 to -4: Negligible</span>
      </div>
    </div>

    <!-- Description Textarea -->
    <div class="form-group">
      <label class="form-label">Description</label>
      <textarea
        ref="descTextarea"
        :value="modelValue.description"
        class="form-textarea auto-resize"
        rows="2"
        placeholder="What does this eidolon do mechanically?"
        @input="updateField('description', ($event.target as HTMLTextAreaElement).value); autoResize($event.target as HTMLTextAreaElement)"
      ></textarea>
    </div>

    <!-- Synergy Modifiers (Collapsible) -->
    <div class="synergy-section">
      <button
        type="button"
        class="synergy-toggle"
        @click="showSynergyModifiers = !showSynergyModifiers"
      >
        <svg
          class="toggle-icon"
          :class="{ expanded: showSynergyModifiers }"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span>Synergy Modifiers</span>
        <span v-if="synergyCount > 0" class="synergy-count">{{ synergyCount }}</span>
      </button>

      <div v-if="showSynergyModifiers" class="synergy-content">
        <div v-if="synergyCount === 0" class="synergy-empty">
          No synergy modifiers. Add one if this eidolon affects synergy with specific characters.
        </div>

        <SynergyModifierEditor
          v-for="(modifier, index) in modelValue.synergyModifiers"
          :key="index"
          :model-value="modifier"
          :all-characters="allCharacters || []"
          @update:model-value="updateSynergyModifier(index, $event)"
          @delete="deleteSynergyModifier(index)"
        />

        <button
          type="button"
          class="add-synergy-btn"
          @click="addSynergyModifier"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Synergy Modifier
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.eidolon-editor {
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(71, 85, 105, 0.5);
  border-radius: 0.5rem;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.level-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  border-radius: 0.5rem;
  font-size: 1rem;
  font-weight: 800;
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.penalty-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.penalty-value {
  font-size: 1rem;
  font-weight: 700;
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  color: rgba(248, 113, 113, 0.9);
}

.penalty-severity {
  font-size: 0.75rem;
  font-weight: 500;
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

.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: rgba(251, 146, 60, 0.6);
  box-shadow: 0 0 0 2px rgba(251, 146, 60, 0.15);
}

.form-textarea {
  resize: vertical;
  min-height: 60px;
}

.form-textarea.auto-resize {
  resize: none;
  overflow: hidden;
}

.penalty-input {
  max-width: 120px;
}

.penalty-guide {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem 1rem;
  font-size: 0.6875rem;
  color: rgba(148, 163, 184, 0.6);
  margin-top: 0.25rem;
}

/* Synergy Section */
.synergy-section {
  border-top: 1px solid rgba(71, 85, 105, 0.3);
  padding-top: 0.75rem;
  margin-top: 0.25rem;
}

.synergy-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.5rem;
  background: transparent;
  border: none;
  color: rgba(203, 213, 225, 0.9);
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border-radius: 0.375rem;
}

.synergy-toggle:hover {
  background: rgba(255, 255, 255, 0.05);
}

.toggle-icon {
  width: 16px;
  height: 16px;
  color: rgba(148, 163, 184, 0.7);
  transition: transform 0.2s;
}

.toggle-icon.expanded {
  transform: rotate(90deg);
}

.synergy-count {
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

.synergy-content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 0.75rem;
  padding-left: 0.5rem;
}

.synergy-empty {
  font-size: 0.8125rem;
  color: rgba(148, 163, 184, 0.6);
  font-style: italic;
  padding: 0.5rem;
}

.add-synergy-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: rgba(251, 146, 60, 0.1);
  border: 1px dashed rgba(251, 146, 60, 0.4);
  border-radius: 0.375rem;
  color: rgba(251, 146, 60, 0.9);
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.add-synergy-btn:hover {
  background: rgba(251, 146, 60, 0.15);
  border-color: rgba(251, 146, 60, 0.6);
}

.add-synergy-btn svg {
  width: 16px;
  height: 16px;
}
</style>
