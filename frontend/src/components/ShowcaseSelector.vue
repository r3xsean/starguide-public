<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Character, UserRosterMap } from '../types';
import { characters } from '../data';
import CharacterCard from './CharacterCard.vue';

// ==================
// PROPS & EMITS
// ==================

interface Props {
  isOpen: boolean;
  roster: UserRosterMap;
  initialShowcase: string[]; // Current showcase character IDs
}

const props = defineProps<Props>();

const emit = defineEmits<{
  close: [];
  save: [showcaseIds: string[]];
}>();

// ==================
// STATE
// ==================

const MAX_SHOWCASE = 8;

// Track selected characters (order matters)
const selectedIds = ref<string[]>([...props.initialShowcase]);

// ==================
// COMPUTED
// ==================

// Get only owned characters from roster
const ownedCharacters = computed(() => {
  return characters
    .filter(char => {
      const investment = props.roster.get(char.id);
      return investment?.ownership === 'owned';
    })
    .sort((a, b) => a.name.localeCompare(b.name));
});

const selectedCount = computed(() => selectedIds.value.length);

// Always allow saving (including empty showcase to clear it)
const canSave = computed(() => true);

// ==================
// METHODS
// ==================

const isSelected = (charId: string): boolean => {
  return selectedIds.value.includes(charId);
};

const getSelectionOrder = (charId: string): number => {
  const index = selectedIds.value.indexOf(charId);
  return index >= 0 ? index + 1 : 0;
};

const toggleCharacter = (char: Character) => {
  const index = selectedIds.value.indexOf(char.id);

  if (index >= 0) {
    // Remove from selection
    selectedIds.value.splice(index, 1);
  } else if (selectedIds.value.length < MAX_SHOWCASE) {
    // Add to selection
    selectedIds.value.push(char.id);
  }
};

const clearSelection = () => {
  selectedIds.value = [];
};

const handleSave = () => {
  emit('save', [...selectedIds.value]);
  emit('close');
};

const handleClose = () => {
  // Reset to initial state
  selectedIds.value = [...props.initialShowcase];
  emit('close');
};
</script>

<template>
  <Teleport to="body">
    <Transition name="showcase-fade">
      <div v-if="isOpen" class="showcase-overlay">
        <div class="showcase-backdrop" @click="handleClose"></div>

        <div class="showcase-modal">
          <!-- Decorative elements -->
          <div class="modal-glow"></div>
          <div class="modal-border"></div>

          <!-- Content -->
          <div class="modal-content">
            <!-- Header -->
            <div class="modal-header">
              <div class="header-icon">
                <svg viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clip-rule="evenodd" />
                </svg>
              </div>
              <div class="header-text">
                <h2 class="header-title">Select Showcase</h2>
                <p class="header-subtitle">{{ selectedCount }}/{{ MAX_SHOWCASE }} characters</p>
              </div>
              <button class="close-btn" @click="handleClose" aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <!-- Character Grid -->
            <div class="character-grid">
              <div
                v-for="char in ownedCharacters"
                :key="char.id"
                class="character-slot"
                :class="{ disabled: !isSelected(char.id) && selectedCount >= MAX_SHOWCASE }"
                @click="toggleCharacter(char)"
              >
                <!-- Card wrapper for proper overlay positioning -->
                <div class="card-wrapper" :class="{ selected: isSelected(char.id) }">
                  <CharacterCard
                    :character="char"
                    size="md"
                    :show-name="false"
                  />
                  <div v-if="isSelected(char.id)" class="selection-badge">
                    {{ getSelectionOrder(char.id) }}
                  </div>
                </div>
                <span class="char-name">{{ char.name }}</span>
              </div>
            </div>

            <!-- Empty State -->
            <div v-if="ownedCharacters.length === 0" class="empty-state">
              <p>No owned characters to display.</p>
              <p class="empty-hint">Mark characters as owned in your roster to add them to your showcase.</p>
            </div>

            <!-- Footer Actions -->
            <div class="modal-footer">
              <button class="clear-btn" @click="clearSelection" :disabled="selectedCount === 0">
                Clear All
              </button>
              <div class="footer-spacer"></div>
              <button class="cancel-btn" @click="handleClose">
                Cancel
              </button>
              <button class="save-btn" @click="handleSave" :disabled="!canSave">
                Save Showcase
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ==================
   OVERLAY
   ================== */

.showcase-overlay {
  position: fixed;
  inset: 0;
  z-index: 10002;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.showcase-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(3, 3, 12, 0.9);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

/* ==================
   MODAL
   ================== */

.showcase-modal {
  position: relative;
  width: 100%;
  max-width: 600px;
  max-height: calc(100vh - 2rem);
  border-radius: 1.25rem;
  overflow: hidden;
}

.modal-glow {
  position: absolute;
  inset: -2px;
  background: conic-gradient(
    from 0deg,
    rgba(249, 147, 7, 0.5) 0%,
    rgba(168, 85, 247, 0.3) 25%,
    rgba(249, 147, 7, 0.5) 50%,
    rgba(168, 85, 247, 0.3) 75%,
    rgba(249, 147, 7, 0.5) 100%
  );
  border-radius: 1.35rem;
  animation: rotateGlow 8s linear infinite;
  opacity: 0.7;
}

@keyframes rotateGlow {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.modal-border {
  position: absolute;
  inset: 2px;
  background: linear-gradient(145deg, rgba(20, 20, 45, 0.98) 0%, rgba(12, 12, 30, 0.98) 100%);
  border-radius: 1.15rem;
}

.modal-content {
  position: relative;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 2rem);
}

/* ==================
   HEADER
   ================== */

.modal-header {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.header-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(249, 147, 7, 0.15) 0%, rgba(249, 147, 7, 0.05) 100%);
  border: 1px solid rgba(249, 147, 7, 0.25);
  border-radius: 0.75rem;
  flex-shrink: 0;
}

.header-icon svg {
  width: 22px;
  height: 22px;
  color: #f99307;
}

.header-text {
  flex: 1;
}

.header-title {
  font-family: var(--font-display, 'Orbitron', sans-serif);
  font-size: 1.125rem;
  font-weight: 700;
  color: white;
  margin: 0;
}

.header-subtitle {
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.5);
  margin: 0.125rem 0 0;
}

.close-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.close-btn svg {
  width: 16px;
  height: 16px;
  color: rgba(255, 255, 255, 0.5);
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.close-btn:hover svg {
  color: white;
}

/* ==================
   CHARACTER GRID
   ================== */

.character-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
  gap: 0.75rem;
  padding: 1.25rem 1.5rem;
  overflow-y: auto;
  max-height: 50vh;
}

.character-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.character-slot:hover:not(.disabled) {
  transform: scale(1.05);
}

.character-slot.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Wrapper around just the card - fixed size for proper overlay */
.card-wrapper {
  position: relative;
  width: 72px;
  height: 72px;
  border-radius: 0.625rem;
  transition: all 0.2s ease;
}

.card-wrapper.selected {
  box-shadow: 0 0 0 3px rgba(249, 147, 7, 0.7), 0 0 20px rgba(249, 147, 7, 0.4);
}

/* Selection number badge */
.selection-badge {
  position: absolute;
  top: -8px;
  left: -8px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f99307 0%, #e67e00 100%);
  border-radius: 50%;
  font-size: 0.75rem;
  font-weight: 700;
  color: white;
  z-index: 10;
  box-shadow: 0 2px 8px rgba(249, 147, 7, 0.5);
}

/* Character name */
.char-name {
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.7);
  text-align: center;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ==================
   EMPTY STATE
   ================== */

.empty-state {
  padding: 3rem 1.5rem;
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
}

.empty-state p {
  margin: 0;
}

.empty-hint {
  margin-top: 0.5rem !important;
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.35);
}

/* ==================
   FOOTER
   ================== */

.modal-footer {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.footer-spacer {
  flex: 1;
}

.clear-btn,
.cancel-btn,
.save-btn {
  padding: 0.625rem 1rem;
  border-radius: 0.5rem;
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.clear-btn {
  background: transparent;
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
}

.clear-btn:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.1);
}

.clear-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.cancel-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.7);
}

.cancel-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.save-btn {
  background: linear-gradient(135deg, #f99307 0%, #e67e00 100%);
  border: none;
  color: white;
}

.save-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(249, 147, 7, 0.3);
}

.save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ==================
   TRANSITIONS
   ================== */

.showcase-fade-enter-active {
  transition: opacity 0.3s ease;
}

.showcase-fade-enter-active .showcase-modal {
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.showcase-fade-leave-active {
  transition: opacity 0.2s ease;
}

.showcase-fade-leave-active .showcase-modal {
  transition: all 0.2s ease;
}

.showcase-fade-enter-from {
  opacity: 0;
}

.showcase-fade-enter-from .showcase-modal {
  opacity: 0;
  transform: scale(0.95) translateY(10px);
}

.showcase-fade-leave-to {
  opacity: 0;
}

.showcase-fade-leave-to .showcase-modal {
  opacity: 0;
  transform: scale(0.98);
}

/* ==================
   RESPONSIVE
   ================== */

@media (max-width: 640px) {
  .showcase-modal {
    max-width: 100%;
  }

  .character-grid {
    grid-template-columns: repeat(auto-fill, minmax(75px, 1fr));
    gap: 0.5rem;
  }

  .modal-footer {
    flex-wrap: wrap;
  }

  .footer-spacer {
    display: none;
  }

  .clear-btn {
    order: 3;
    flex: 1;
  }

  .cancel-btn,
  .save-btn {
    flex: 1;
  }
}
</style>
