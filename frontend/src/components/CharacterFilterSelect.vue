<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Character } from '../types';
import CharacterCard from './CharacterCard.vue';
import CharacterGrid from './CharacterGrid.vue';

// ==================
// PROPS
// ==================

interface Props {
  /** Pool of characters to select from */
  characters: Character[];
  /** Currently selected character IDs */
  selectedIds: Set<string>;
  /** Function to get ownership status */
  getOwnership: (id: string) => 'owned' | 'concept' | 'none';
  /** Current game mode for tier display */
  gameMode: 'moc' | 'pf' | 'as';
  /** Button label */
  buttonLabel?: string;
  /** Modal title */
  modalTitle?: string;
  /** Whether to show tier badges on cards */
  showTier?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  buttonLabel: 'Filter by Character',
  modalTitle: 'Select Characters',
  showTier: false,
});

const emit = defineEmits<{
  'update:selectedIds': [ids: Set<string>];
}>();

// ==================
// STATE
// ==================

const showModal = ref(false);

// ==================
// COMPUTED
// ==================

const selectedCharacters = computed(() => {
  return Array.from(props.selectedIds)
    .map(id => props.characters.find(c => c.id === id))
    .filter((c): c is Character => c !== undefined);
});

// Create a roster map for CharacterGrid to show selection state
const selectionRoster = computed(() => {
  return new Map(
    props.characters.map(c => [c.id, props.selectedIds.has(c.id) ? 'owned' : 'none'] as const)
  );
});

// ==================
// METHODS
// ==================

function openModal() {
  showModal.value = true;
}

function closeModal() {
  showModal.value = false;
}

function toggleCharacter(characterId: string) {
  const newSet = new Set(props.selectedIds);
  if (newSet.has(characterId)) {
    newSet.delete(characterId);
  } else {
    newSet.add(characterId);
  }
  emit('update:selectedIds', newSet);
}

function handleCharacterSelect(character: Character) {
  toggleCharacter(character.id);
}

function clearAll() {
  emit('update:selectedIds', new Set());
}
</script>

<template>
  <div v-if="characters.length > 0" class="character-filter-section">
    <div class="filter-header">
      <button class="add-character-btn" @click="openModal">
        <span class="btn-icon">+</span>
        <span class="btn-text">{{ buttonLabel }}</span>
      </button>
      <button v-if="selectedIds.size > 0" class="clear-filters-btn" @click="clearAll">
        Clear All ({{ selectedIds.size }})
      </button>
    </div>

    <!-- Selected Characters Grid -->
    <div v-if="selectedCharacters.length > 0" class="selected-characters-grid">
      <CharacterCard
        v-for="char in selectedCharacters"
        :key="char.id"
        :character="char"
        :ownership="getOwnership(char.id)"
        :selected="false"
        :show-tier="showTier"
        :show-name="true"
        :game-mode="gameMode"
        size="md"
        @click="toggleCharacter(char.id)"
      />
    </div>

    <!-- Character Selection Modal -->
    <Transition name="modal">
      <div v-if="showModal" class="modal-overlay" @click="closeModal">
        <div class="modal-content" @click.stop>
          <div class="modal-header">
            <h2 class="modal-title">{{ modalTitle }}</h2>
            <button class="modal-close" @click="closeModal">×</button>
          </div>
          <div class="modal-body">
            <CharacterGrid
              :characters="characters"
              :selected-character="null"
              :roster="selectionRoster"
              :game-mode="gameMode"
              @select="handleCharacterSelect"
            />
          </div>
          <div class="modal-footer">
            <div class="selected-count">{{ selectedIds.size }} character{{ selectedIds.size !== 1 ? 's' : '' }} selected</div>
            <button class="modal-done-btn" @click="closeModal">Done</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* Character Filter Section */
.character-filter-section {
  margin-bottom: 1rem;
  padding: 0.75rem 1rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.5rem;
}

.filter-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.add-character-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.875rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.8);
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(139, 92, 246, 0.1));
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s;
}

.add-character-btn:hover {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(139, 92, 246, 0.2));
  border-color: rgba(139, 92, 246, 0.5);
}

.btn-icon {
  font-size: 1rem;
  font-weight: 600;
}

.clear-filters-btn {
  padding: 0.5rem 0.875rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-filters-btn:hover {
  color: rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
}

.selected-characters-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(8px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.modal-content {
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.95));
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 1rem;
  max-width: 800px;
  width: 100%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.modal-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: white;
}

.modal-close {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  color: rgba(255, 255, 255, 0.5);
  background: transparent;
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s;
}

.modal-close:hover {
  color: white;
  background: rgba(255, 255, 255, 0.1);
}

.modal-body {
  padding: 1.5rem;
  overflow-y: auto;
  flex: 1;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.selected-count {
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.6);
}

.modal-done-btn {
  padding: 0.625rem 1.25rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: white;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.8), rgba(139, 92, 246, 0.6));
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s;
}

.modal-done-btn:hover {
  background: linear-gradient(135deg, rgba(139, 92, 246, 1), rgba(139, 92, 246, 0.8));
}

/* Modal Transitions */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-active .modal-content,
.modal-leave-active .modal-content {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: scale(0.95);
  opacity: 0;
}
</style>
