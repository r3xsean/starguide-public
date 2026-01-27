<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted } from 'vue';
import type { TeammateRec, TeammateRating, Character } from '../../../types';

interface InvestmentModifier {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  modifier: number;
  reason?: string;
}

// Extended model for override mode (includes excluded field)
interface TeammateModel extends TeammateRec {
  excluded?: boolean;
}

interface Props {
  modelValue: TeammateModel;
  allCharacters: Character[];
  /** When true, shows the "Exclude from composition" toggle */
  isOverride?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isOverride: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: TeammateModel];
  delete: [];
}>();

// Rating options
const ratings: TeammateRating[] = ['S', 'A', 'B', 'C', 'D'];

// Eidolon levels
const eidolonLevels: (1 | 2 | 3 | 4 | 5 | 6)[] = [1, 2, 3, 4, 5, 6];

// Collapsible state for investment modifiers
const showInvestmentModifiers = ref(false);

// Auto-resize textarea
const reasonTextarea = ref<HTMLTextAreaElement | null>(null);

function autoResize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

watch(() => props.modelValue.reason, () => {
  nextTick(() => autoResize(reasonTextarea.value));
});

onMounted(() => {
  nextTick(() => autoResize(reasonTextarea.value));
});

// Sorted character list for picker
const sortedCharacters = computed(() => {
  return [...props.allCharacters].sort((a, b) => a.name.localeCompare(b.name));
});

// Find current character for display
const currentCharacter = computed(() => {
  return props.allCharacters.find(c => c.id === props.modelValue.id);
});

// Character count for reason validation
const reasonLength = computed(() => props.modelValue.reason?.length || 0);
const reasonStatus = computed(() => {
  if (reasonLength.value < 80) return { valid: false, message: `${80 - reasonLength.value} more chars needed` };
  if (reasonLength.value > 400) return { valid: false, message: `${reasonLength.value - 400} chars over limit` };
  return { valid: true, message: `${reasonLength.value}/400` };
});

// Investment modifiers count
const investmentModifiersCount = computed(() => props.modelValue.theirInvestmentModifiers?.length || 0);

function updateField<K extends keyof TeammateModel>(field: K, value: TeammateModel[K]) {
  emit('update:modelValue', {
    ...props.modelValue,
    [field]: value,
  });
}

function handleExcludedToggle(event: Event) {
  const target = event.target as HTMLInputElement;
  updateField('excluded', target.checked || undefined);
}

function handleRatingClick(rating: TeammateRating) {
  updateField('rating', rating);
}

// Investment modifier handlers
function addInvestmentModifier() {
  const modifiers = [...(props.modelValue.theirInvestmentModifiers || [])];
  // Find first unused level
  const usedLevels = modifiers.map(m => m.level);
  const availableLevel = eidolonLevels.find(l => !usedLevels.includes(l)) || 1;
  modifiers.push({ level: availableLevel, modifier: 10 });
  updateField('theirInvestmentModifiers', modifiers);
}

function updateInvestmentModifier(index: number, field: keyof InvestmentModifier, value: number | string | undefined) {
  const modifiers = [...(props.modelValue.theirInvestmentModifiers || [])];
  const current = modifiers[index];
  if (!current) return;

  modifiers[index] = {
    ...current,
    [field]: field === 'reason' && value === '' ? undefined : value,
  };
  updateField('theirInvestmentModifiers', modifiers);
}

function deleteInvestmentModifier(index: number) {
  const modifiers = [...(props.modelValue.theirInvestmentModifiers || [])];
  modifiers.splice(index, 1);
  updateField('theirInvestmentModifiers', modifiers.length > 0 ? modifiers : undefined);
}
</script>

<template>
  <div class="teammate-editor" :class="{ 'is-excluded': modelValue.excluded }">
    <!-- Header row with character info and delete -->
    <div class="editor-header">
      <div class="character-info">
        <img
          v-if="currentCharacter"
          :src="`/icons/${currentCharacter.id}.webp`"
          :alt="currentCharacter.name"
          class="character-icon"
        />
        <span class="character-name">{{ currentCharacter?.name || modelValue.id }}</span>
        <span v-if="modelValue.excluded" class="excluded-badge">Excluded</span>
      </div>
      <button
        type="button"
        class="delete-btn"
        title="Remove teammate"
        @click="emit('delete')"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
          <line x1="10" y1="11" x2="10" y2="17" />
          <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
      </button>
    </div>

    <!-- Exclude Toggle (Override mode only) -->
    <div v-if="isOverride" class="exclude-toggle-row">
      <label class="exclude-toggle-label">
        <input
          type="checkbox"
          :checked="modelValue.excluded"
          class="exclude-checkbox"
          @change="handleExcludedToggle"
        />
        <span class="exclude-slider"></span>
        <span class="exclude-text">Exclude from this composition</span>
      </label>
      <p v-if="modelValue.excluded" class="exclude-hint">
        This character will not appear in this composition's recommendations.
      </p>
    </div>

    <!-- Character Picker -->
    <div class="form-group">
      <label class="form-label">Character</label>
      <select
        :value="modelValue.id"
        class="form-select"
        @change="updateField('id', ($event.target as HTMLSelectElement).value)"
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

    <!-- Rating Selector -->
    <div class="form-group">
      <label class="form-label">Rating <span class="label-hint">(S = Best, D = Not recommended)</span></label>
      <div class="rating-buttons">
        <button
          v-for="r in ratings"
          :key="r"
          type="button"
          class="rating-btn"
          :class="[
            `rating-${r.toLowerCase()}`,
            { active: modelValue.rating === r }
          ]"
          @click="handleRatingClick(r)"
        >
          {{ r }}
        </button>
      </div>
    </div>

    <!-- Reason Textarea -->
    <div class="form-group">
      <label class="form-label">
        Reason
        <span class="char-count" :class="{ invalid: !reasonStatus.valid }">
          {{ reasonStatus.message }}
        </span>
      </label>
      <textarea
        ref="reasonTextarea"
        :value="modelValue.reason"
        class="form-textarea auto-resize"
        :class="{ invalid: !reasonStatus.valid }"
        rows="2"
        placeholder="Explain the specific synergy or mechanic that makes this pairing good/bad..."
        @input="updateField('reason', ($event.target as HTMLTextAreaElement).value); autoResize($event.target as HTMLTextAreaElement)"
      ></textarea>
    </div>

    <!-- Investment Modifiers (Collapsible) -->
    <div class="investment-section">
      <button
        type="button"
        class="investment-toggle"
        @click="showInvestmentModifiers = !showInvestmentModifiers"
      >
        <svg
          class="toggle-icon"
          :class="{ expanded: showInvestmentModifiers }"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span>Their Investment Modifiers</span>
        <span v-if="investmentModifiersCount > 0" class="investment-count">{{ investmentModifiersCount }}</span>
      </button>

      <div v-if="showInvestmentModifiers" class="investment-content">
        <p class="investment-hint">
          Add bonuses when THIS teammate has certain eidolons (from your perspective).
        </p>

        <div v-if="investmentModifiersCount === 0" class="investment-empty">
          No investment modifiers. Add one if this teammate's eidolons affect their synergy with this character.
        </div>

        <div
          v-for="(mod, index) in modelValue.theirInvestmentModifiers"
          :key="index"
          class="investment-modifier"
        >
          <div class="modifier-row">
            <div class="modifier-field">
              <label class="modifier-label">Eidolon</label>
              <select
                :value="mod.level"
                class="form-select level-select"
                @change="updateInvestmentModifier(index, 'level', parseInt(($event.target as HTMLSelectElement).value) as 1|2|3|4|5|6)"
              >
                <option
                  v-for="level in eidolonLevels"
                  :key="level"
                  :value="level"
                >
                  E{{ level }}
                </option>
              </select>
            </div>
            <div class="modifier-field">
              <label class="modifier-label">Modifier</label>
              <input
                type="number"
                :value="mod.modifier"
                class="form-input modifier-input"
                step="1"
                @input="updateInvestmentModifier(index, 'modifier', parseFloat(($event.target as HTMLInputElement).value) || 0)"
              />
            </div>
            <button
              type="button"
              class="mini-delete-btn"
              @click="deleteInvestmentModifier(index)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <input
            :value="mod.reason || ''"
            class="form-input reason-input"
            placeholder="Why does their eidolon affect synergy? (optional)"
            @input="updateInvestmentModifier(index, 'reason', ($event.target as HTMLInputElement).value)"
          />
        </div>

        <button
          type="button"
          class="add-investment-btn"
          @click="addInvestmentModifier"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Investment Modifier
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.teammate-editor {
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

.character-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.character-icon {
  width: 32px;
  height: 32px;
  border-radius: 0.375rem;
  object-fit: cover;
  border: 1px solid rgba(71, 85, 105, 0.5);
}

.character-name {
  font-size: 0.9375rem;
  font-weight: 600;
  color: white;
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
  justify-content: space-between;
}

.label-hint {
  font-weight: 400;
  color: rgba(148, 163, 184, 0.7);
  font-size: 0.75rem;
}

.char-count {
  font-size: 0.6875rem;
  font-weight: 400;
  color: rgba(148, 163, 184, 0.7);
}

.char-count.invalid {
  color: rgba(248, 113, 113, 0.9);
}

.form-select,
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
  min-height: 72px;
}

.form-textarea.auto-resize {
  resize: none;
  overflow: hidden;
  min-height: 60px;
}

.form-textarea.invalid {
  border-color: rgba(239, 68, 68, 0.5);
}

.form-textarea.invalid:focus {
  border-color: rgba(239, 68, 68, 0.7);
  box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.15);
}

/* Rating Buttons */
.rating-buttons {
  display: flex;
  gap: 0.375rem;
}

.rating-btn {
  flex: 1;
  padding: 0.5rem 0.25rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.375rem;
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.875rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.rating-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
}

.rating-btn.active {
  color: white;
  transform: scale(1.02);
}

/* Rating colors */
.rating-btn.rating-s.active {
  background: linear-gradient(135deg, #ff9500, #ff6b00);
  border-color: #ff9500;
}

.rating-btn.rating-a.active {
  background: linear-gradient(135deg, #a855f7, #8b5cf6);
  border-color: #a855f7;
}

.rating-btn.rating-b.active {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  border-color: #3b82f6;
}

.rating-btn.rating-c.active {
  background: linear-gradient(135deg, #22c55e, #16a34a);
  border-color: #22c55e;
}

.rating-btn.rating-d.active {
  background: linear-gradient(135deg, #6b7280, #4b5563);
  border-color: #6b7280;
}

/* Investment Modifiers Section */
.investment-section {
  border-top: 1px solid rgba(71, 85, 105, 0.3);
  padding-top: 0.75rem;
  margin-top: 0.25rem;
}

.investment-toggle {
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

.investment-toggle:hover {
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

.investment-count {
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

.investment-content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 0.75rem;
  padding-left: 0.5rem;
}

.investment-hint {
  font-size: 0.75rem;
  color: rgba(148, 163, 184, 0.7);
  margin: 0;
}

.investment-empty {
  font-size: 0.8125rem;
  color: rgba(148, 163, 184, 0.6);
  font-style: italic;
  padding: 0.5rem;
}

.investment-modifier {
  background: rgba(15, 23, 42, 0.4);
  border: 1px solid rgba(71, 85, 105, 0.4);
  border-radius: 0.375rem;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.modifier-row {
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
}

.modifier-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.modifier-label {
  font-size: 0.6875rem;
  font-weight: 600;
  color: rgba(148, 163, 184, 0.8);
}

.level-select {
  width: 80px;
}

.modifier-input {
  width: 80px;
}

.reason-input {
  width: 100%;
}

.form-input {
  padding: 0.5rem 0.75rem;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(71, 85, 105, 0.5);
  border-radius: 0.375rem;
  color: white;
  font-size: 0.875rem;
  font-family: inherit;
  transition: all 0.2s;
}

.form-input:focus {
  outline: none;
  border-color: rgba(251, 146, 60, 0.6);
  box-shadow: 0 0 0 2px rgba(251, 146, 60, 0.15);
}

.mini-delete-btn {
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
  flex-shrink: 0;
  align-self: flex-end;
  margin-bottom: 2px;
}

.mini-delete-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.5);
}

.mini-delete-btn svg {
  width: 14px;
  height: 14px;
}

.add-investment-btn {
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

.add-investment-btn:hover {
  background: rgba(251, 146, 60, 0.15);
  border-color: rgba(251, 146, 60, 0.6);
}

.add-investment-btn svg {
  width: 16px;
  height: 16px;
}

/* Excluded State */
.teammate-editor.is-excluded {
  opacity: 0.7;
  border-color: rgba(239, 68, 68, 0.4);
  background: rgba(239, 68, 68, 0.05);
}

.excluded-badge {
  padding: 0.125rem 0.375rem;
  background: rgba(239, 68, 68, 0.2);
  border: 1px solid rgba(239, 68, 68, 0.4);
  border-radius: 0.25rem;
  font-size: 0.625rem;
  font-weight: 600;
  color: rgba(248, 113, 113, 0.9);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

/* Exclude Toggle */
.exclude-toggle-row {
  padding: 0.625rem 0.75rem;
  background: rgba(239, 68, 68, 0.05);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 0.375rem;
  margin-bottom: 0.25rem;
}

.exclude-toggle-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.exclude-checkbox {
  display: none;
}

.exclude-slider {
  position: relative;
  width: 36px;
  height: 20px;
  background: rgba(71, 85, 105, 0.6);
  border-radius: 10px;
  transition: all 0.2s;
  flex-shrink: 0;
}

.exclude-slider::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: white;
  border-radius: 50%;
  transition: all 0.2s;
}

.exclude-checkbox:checked + .exclude-slider {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
}

.exclude-checkbox:checked + .exclude-slider::after {
  transform: translateX(16px);
}

.exclude-text {
  font-size: 0.8125rem;
  color: rgba(203, 213, 225, 0.9);
}

.exclude-hint {
  font-size: 0.75rem;
  color: rgba(248, 113, 113, 0.8);
  margin: 0.5rem 0 0 0;
  font-style: italic;
}
</style>
