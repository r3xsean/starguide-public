<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted } from 'vue';
import type { BestTeam, TeamRating, Character } from '../../../types';

// Auto-resize textarea
const notesTextarea = ref<HTMLTextAreaElement | null>(null);

function autoResize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

interface Props {
  modelValue: BestTeam;
  allCharacters: Character[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: BestTeam];
  delete: [];
}>();

// Rating options
const ratings: TeamRating[] = ['S', 'A', 'B', 'C'];

// Structure options
const structures = ['hypercarry', 'dual-carry', 'balanced', 'specialized'];

// Auto-resize on value change
watch(() => props.modelValue.notes, () => {
  nextTick(() => autoResize(notesTextarea.value));
});

onMounted(() => {
  nextTick(() => autoResize(notesTextarea.value));
});

// Sorted character list for pickers
const sortedCharacters = computed(() => {
  return [...props.allCharacters].sort((a, b) => a.name.localeCompare(b.name));
});

// Get character by ID for display
function getCharacter(id: string): Character | undefined {
  return props.allCharacters.find(c => c.id === id);
}

function updateField<K extends keyof BestTeam>(field: K, value: BestTeam[K]) {
  emit('update:modelValue', {
    ...props.modelValue,
    [field]: value,
  });
}

function updateCharacterSlot(index: number, characterId: string) {
  const newCharacters = [...props.modelValue.characters] as [string, string, string, string];
  newCharacters[index] = characterId;
  updateField('characters', newCharacters);
}

function handleRatingClick(rating: TeamRating) {
  updateField('rating', rating);
}
</script>

<template>
  <div class="best-team-editor">
    <!-- Header row with team name and delete -->
    <div class="editor-header">
      <input
        :value="modelValue.name"
        class="team-name-input"
        placeholder="Team Name"
        @input="updateField('name', ($event.target as HTMLInputElement).value)"
      />
      <button
        type="button"
        class="delete-btn"
        title="Remove team"
        @click="emit('delete')"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
          <line x1="10" y1="11" x2="10" y2="17" />
          <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
      </button>
    </div>

    <!-- Character Slots (4 in a row) -->
    <div class="character-slots">
      <div
        v-for="(charId, index) in modelValue.characters"
        :key="index"
        class="character-slot"
      >
        <div class="slot-header">
          <span class="slot-label">Slot {{ index + 1 }}</span>
          <img
            v-if="getCharacter(charId)"
            :src="`/icons/${charId}.webp`"
            :alt="getCharacter(charId)?.name"
            class="slot-icon"
          />
          <div v-else class="slot-icon-placeholder">?</div>
        </div>
        <select
          :value="charId"
          class="form-select"
          @change="updateCharacterSlot(index, ($event.target as HTMLSelectElement).value)"
        >
          <option value="" disabled>Select...</option>
          <option
            v-for="char in sortedCharacters"
            :key="char.id"
            :value="char.id"
          >
            {{ char.name }}
          </option>
        </select>
      </div>
    </div>

    <!-- Rating and Structure Row -->
    <div class="form-row">
      <!-- Rating -->
      <div class="form-group">
        <label class="form-label">Rating</label>
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

      <!-- Structure -->
      <div class="form-group flex-1">
        <label class="form-label">Structure</label>
        <select
          :value="modelValue.structure"
          class="form-select"
          @change="updateField('structure', ($event.target as HTMLSelectElement).value)"
        >
          <option
            v-for="s in structures"
            :key="s"
            :value="s"
          >
            {{ s }}
          </option>
        </select>
      </div>
    </div>

    <!-- Notes -->
    <div class="form-group">
      <label class="form-label">
        Notes
        <span class="label-hint">(optional)</span>
      </label>
      <textarea
        ref="notesTextarea"
        :value="modelValue.notes || ''"
        class="form-textarea auto-resize"
        rows="2"
        placeholder="Why does this team work? What synergies are key?"
        @input="updateField('notes', ($event.target as HTMLTextAreaElement).value || undefined); autoResize($event.target as HTMLTextAreaElement)"
      ></textarea>
    </div>
  </div>
</template>

<style scoped>
.best-team-editor {
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
  gap: 0.75rem;
}

.team-name-input {
  flex: 1;
  padding: 0.5rem 0.75rem;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(71, 85, 105, 0.5);
  border-radius: 0.375rem;
  color: white;
  font-size: 0.9375rem;
  font-weight: 600;
  font-family: inherit;
  transition: all 0.2s;
}

.team-name-input:focus {
  outline: none;
  border-color: rgba(251, 146, 60, 0.6);
  box-shadow: 0 0 0 2px rgba(251, 146, 60, 0.15);
}

.team-name-input::placeholder {
  color: rgba(148, 163, 184, 0.5);
  font-weight: 400;
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

/* Character Slots */
.character-slots {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.5rem;
}

@media (max-width: 640px) {
  .character-slots {
    grid-template-columns: repeat(2, 1fr);
  }
}

.character-slot {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.slot-header {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.slot-label {
  font-size: 0.6875rem;
  font-weight: 600;
  color: rgba(148, 163, 184, 0.8);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.slot-icon {
  width: 24px;
  height: 24px;
  border-radius: 0.25rem;
  object-fit: cover;
  border: 1px solid rgba(71, 85, 105, 0.5);
}

.slot-icon-placeholder {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(71, 85, 105, 0.3);
  border: 1px dashed rgba(71, 85, 105, 0.5);
  border-radius: 0.25rem;
  color: rgba(148, 163, 184, 0.5);
  font-size: 0.75rem;
  font-weight: 600;
}

/* Form Elements */
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
  min-width: 140px;
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
  min-height: 60px;
}

.form-textarea.auto-resize {
  resize: none;
  overflow: hidden;
}

/* Rating Buttons */
.rating-buttons {
  display: flex;
  gap: 0.375rem;
}

.rating-btn {
  padding: 0.5rem 0.75rem;
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
</style>
