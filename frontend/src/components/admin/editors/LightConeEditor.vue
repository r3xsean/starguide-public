<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import type { LightConeDefinition, LightConeSource, Character } from '../../../types';
import SynergyModifierEditor from './SynergyModifierEditor.vue';

// Auto-resize textarea
const notesTextarea = ref<HTMLTextAreaElement | null>(null);
const playstyleNotesTextarea = ref<HTMLTextAreaElement | null>(null);

function autoResize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

interface Props {
  modelValue: LightConeDefinition;
  allCharacters?: Character[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: LightConeDefinition];
  delete: [];
}>();

// Source options
const sourceOptions: { value: LightConeSource; label: string }[] = [
  { value: 'signature', label: 'Signature' },
  { value: 'standard', label: 'Standard Banner' },
  { value: 'event', label: 'Event' },
  { value: 'herta-store', label: 'Herta Store' },
  { value: 'battle-pass', label: 'Battle Pass' },
  { value: 'craftable', label: 'Craftable' },
];

// Auto-resize on value change
watch(() => props.modelValue.notes, () => {
  nextTick(() => autoResize(notesTextarea.value));
});

watch(() => props.modelValue.playstyleNotes, () => {
  nextTick(() => autoResize(playstyleNotesTextarea.value));
});

onMounted(() => {
  nextTick(() => {
    autoResize(notesTextarea.value);
    autoResize(playstyleNotesTextarea.value);
  });
});

// Collapsible state for synergy modifiers
const showSynergyModifiers = ref(false);

// Synergy modifiers count
const synergyCount = computed(() => props.modelValue.synergyModifiers?.length || 0);

// Validation
const isValidId = computed(() => {
  return /^[a-z0-9-]+$/.test(props.modelValue.id);
});

function updateField<K extends keyof LightConeDefinition>(field: K, value: LightConeDefinition[K]) {
  emit('update:modelValue', {
    ...props.modelValue,
    [field]: value,
  });
}

function handleIdInput(event: Event) {
  const target = event.target as HTMLInputElement;
  // Auto-convert to kebab-case
  const value = target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  updateField('id', value);
}

function handlePenaltyInput(field: 's1' | 's5', event: Event) {
  const target = event.target as HTMLInputElement;
  let value = parseFloat(target.value);
  if (!isNaN(value)) {
    // Ensure penalty is negative or zero
    if (value > 0) value = -value;
    updateField('penalties', {
      ...props.modelValue.penalties,
      [field]: value,
    });
  }
}

function handleRarityChange(rarity: 3 | 4 | 5) {
  updateField('rarity', rarity);
}

function handleSignatureToggle(event: Event) {
  const target = event.target as HTMLInputElement;
  updateField('isSignature', target.checked);
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
  <div class="lightcone-editor">
    <!-- Header with name and delete -->
    <div class="editor-header">
      <div class="lc-info">
        <div class="rarity-stars">
          <span v-for="i in modelValue.rarity" :key="i" class="star">&#9733;</span>
        </div>
        <span class="lc-name">{{ modelValue.name || 'New Light Cone' }}</span>
        <span v-if="modelValue.isSignature" class="signature-badge">Signature</span>
      </div>
      <button
        type="button"
        class="delete-btn"
        title="Remove light cone"
        @click="emit('delete')"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
          <line x1="10" y1="11" x2="10" y2="17" />
          <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
      </button>
    </div>

    <!-- ID and Name Row -->
    <div class="form-row">
      <div class="form-group flex-1">
        <label class="form-label">ID</label>
        <input
          type="text"
          :value="modelValue.id"
          class="form-input"
          :class="{ invalid: modelValue.id && !isValidId }"
          placeholder="light-cone-id"
          @input="handleIdInput"
        />
        <span v-if="modelValue.id && !isValidId" class="validation-error">
          Use lowercase letters, numbers, and hyphens only
        </span>
      </div>
      <div class="form-group flex-2">
        <label class="form-label">Name</label>
        <input
          type="text"
          :value="modelValue.name"
          class="form-input"
          placeholder="Light Cone Name"
          @input="updateField('name', ($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>

    <!-- Rarity and Signature Row -->
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Rarity</label>
        <div class="rarity-buttons">
          <button
            type="button"
            class="rarity-btn"
            :class="{ active: modelValue.rarity === 3 }"
            @click="handleRarityChange(3)"
          >
            3&#9733;
          </button>
          <button
            type="button"
            class="rarity-btn"
            :class="{ active: modelValue.rarity === 4 }"
            @click="handleRarityChange(4)"
          >
            4&#9733;
          </button>
          <button
            type="button"
            class="rarity-btn"
            :class="{ active: modelValue.rarity === 5 }"
            @click="handleRarityChange(5)"
          >
            5&#9733;
          </button>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Signature</label>
        <label class="toggle-label">
          <input
            type="checkbox"
            :checked="modelValue.isSignature"
            class="toggle-input"
            @change="handleSignatureToggle"
          />
          <span class="toggle-slider"></span>
          <span class="toggle-text">{{ modelValue.isSignature ? 'Yes' : 'No' }}</span>
        </label>
      </div>

      <div class="form-group flex-1">
        <label class="form-label">Source</label>
        <select
          :value="modelValue.source"
          class="form-select"
          @change="updateField('source', ($event.target as HTMLSelectElement).value as LightConeSource)"
        >
          <option
            v-for="opt in sourceOptions"
            :key="opt.value"
            :value="opt.value"
          >
            {{ opt.label }}
          </option>
        </select>
      </div>
    </div>

    <!-- Penalties Row -->
    <div class="form-group">
      <label class="form-label">
        Penalties
        <span class="label-hint">(relative to Signature S5)</span>
      </label>
      <div class="penalties-row">
        <div class="penalty-input-group">
          <label class="penalty-label">S1</label>
          <input
            type="number"
            :value="modelValue.penalties.s1"
            class="form-input penalty-input"
            :max="0"
            step="1"
            @input="handlePenaltyInput('s1', $event)"
          />
        </div>
        <div class="penalty-input-group">
          <label class="penalty-label">S5</label>
          <input
            type="number"
            :value="modelValue.penalties.s5"
            class="form-input penalty-input"
            :max="0"
            step="1"
            @input="handlePenaltyInput('s5', $event)"
          />
        </div>
        <div class="penalty-hint">
          <span v-if="modelValue.isSignature">Signature: S5 should be 0</span>
          <span v-else>Alternative: Both values should be negative</span>
        </div>
      </div>
    </div>

    <!-- Notes -->
    <div class="form-group">
      <label class="form-label">Notes</label>
      <textarea
        ref="notesTextarea"
        :value="modelValue.notes"
        class="form-textarea auto-resize"
        rows="2"
        placeholder="General notes about this light cone's benefits and how it works with this character..."
        @input="updateField('notes', ($event.target as HTMLTextAreaElement).value); autoResize($event.target as HTMLTextAreaElement)"
      ></textarea>
    </div>

    <!-- Playstyle Notes (Optional) -->
    <div class="form-group">
      <label class="form-label">
        Playstyle Notes
        <span class="label-hint">(optional)</span>
      </label>
      <textarea
        ref="playstyleNotesTextarea"
        :value="modelValue.playstyleNotes || ''"
        class="form-textarea auto-resize"
        rows="2"
        placeholder="Notes about playstyle changes if this LC requires different play..."
        @input="updateField('playstyleNotes', ($event.target as HTMLTextAreaElement).value || undefined); autoResize($event.target as HTMLTextAreaElement)"
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
          No synergy modifiers. Add one if this light cone affects synergy with specific characters.
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
.lightcone-editor {
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

.lc-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.rarity-stars {
  display: flex;
  color: #f59e0b;
  font-size: 0.875rem;
}

.star {
  text-shadow: 0 0 4px rgba(245, 158, 11, 0.5);
}

.lc-name {
  font-size: 0.9375rem;
  font-weight: 600;
  color: white;
}

.signature-badge {
  padding: 0.125rem 0.5rem;
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  border-radius: 0.25rem;
  font-size: 0.6875rem;
  font-weight: 600;
  color: white;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

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
  transition: all 0.2s;
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

.form-row {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.form-group.flex-1 {
  flex: 1;
  min-width: 120px;
}

.form-group.flex-2 {
  flex: 2;
  min-width: 180px;
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
.form-select {
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
.form-select:focus {
  outline: none;
  border-color: rgba(251, 146, 60, 0.6);
  box-shadow: 0 0 0 2px rgba(251, 146, 60, 0.15);
}

.form-input.invalid {
  border-color: rgba(239, 68, 68, 0.5);
}

.form-select {
  cursor: pointer;
}

.form-select option {
  background: #1e293b;
  color: white;
}

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
  resize: vertical;
  min-height: 60px;
}

.form-textarea:focus {
  outline: none;
  border-color: rgba(251, 146, 60, 0.6);
  box-shadow: 0 0 0 2px rgba(251, 146, 60, 0.15);
}

.form-textarea.auto-resize {
  resize: none;
  overflow: hidden;
}

.validation-error {
  font-size: 0.6875rem;
  color: rgba(248, 113, 113, 0.9);
}

/* Rarity Buttons */
.rarity-buttons {
  display: flex;
  gap: 0.375rem;
}

.rarity-btn {
  padding: 0.5rem 0.75rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.375rem;
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.rarity-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.rarity-btn.active {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  border-color: #f59e0b;
  color: white;
}

/* Toggle Switch */
.toggle-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.toggle-input {
  display: none;
}

.toggle-slider {
  position: relative;
  width: 40px;
  height: 22px;
  background: rgba(71, 85, 105, 0.6);
  border-radius: 11px;
  transition: all 0.2s;
}

.toggle-slider::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  background: white;
  border-radius: 50%;
  transition: all 0.2s;
}

.toggle-input:checked + .toggle-slider {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
}

.toggle-input:checked + .toggle-slider::after {
  transform: translateX(18px);
}

.toggle-text {
  font-size: 0.8125rem;
  color: rgba(203, 213, 225, 0.9);
}

/* Penalties */
.penalties-row {
  display: flex;
  align-items: flex-end;
  gap: 1rem;
  flex-wrap: wrap;
}

.penalty-input-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.penalty-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(148, 163, 184, 0.8);
}

.penalty-input {
  width: 80px;
}

.penalty-hint {
  font-size: 0.6875rem;
  color: rgba(148, 163, 184, 0.6);
  align-self: center;
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
