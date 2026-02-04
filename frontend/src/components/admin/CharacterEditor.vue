<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useCharacterEditor, type TierEdits } from '../../composables/useCharacterEditor';
import { useBidirectionalCheck, type BidirectionalSuggestion } from '../../composables/useBidirectionalCheck';
import { characters } from '../../data';
import type { Role, TeammateRec, CharacterInvestment, TeamComposition, Teammates } from '../../types';

// Section components
import EditorIdentitySection from './sections/EditorIdentitySection.vue';
import EditorClassificationSection from './sections/EditorClassificationSection.vue';
import EditorTierSection from './sections/EditorTierSection.vue';
import EditorTeammatesSection from './sections/EditorTeammatesSection.vue';
import EditorInvestmentSection from './sections/EditorInvestmentSection.vue';
import EditorCompositionsSection from './sections/EditorCompositionsSection.vue';
import EditorRestrictionsSection from './sections/EditorRestrictionsSection.vue';

// UI components
import ValidationErrors from './ValidationErrors.vue';
import ChangePreview from './ChangePreview.vue';
import BidirectionalPrompt from './BidirectionalPrompt.vue';

// ==================
// ROUTER
// ==================

const route = useRoute();
const router = useRouter();

// ==================
// COMPUTED - CHARACTER ID
// ==================

const characterId = computed(() => route.params.id as string);

// ==================
// COMPOSABLES
// ==================

// Main editor composable
const {
  originalData,
  editedData,
  tierEdits,
  originalTiers,
  validationErrors,
  isLoading,
  loadError,
  isDirty,
  changedFields,
  hasErrors,
  validate,
  submitForReview,
  resetChanges,
} = useCharacterEditor(characterId);

// Bidirectional check composable
const {
  pendingSuggestions,
  showPrompt,
  currentSuggestion,
  acceptSuggestion,
  skipSuggestion,
  clearSuggestions,
} = useBidirectionalCheck();

// ==================
// UI STATE
// ==================

const showPreview = ref(false);
const showDiscardConfirm = ref(false);
const successMessage = ref('');
const errorMessage = ref('');

// Section refs for scroll navigation
const teammateSectionRef = ref<InstanceType<typeof EditorTeammatesSection> | null>(null);

// ==================
// COMPUTED - CHARACTER INFO
// ==================

const characterName = computed(() => {
  return editedData.value?.name || originalData.value?.name || 'Unknown Character';
});

const characterIcon = computed(() => {
  const id = editedData.value?.id || originalData.value?.id;
  if (!id) return '/icons/placeholder.webp';
  return `/icons/${id}.webp`;
});

const characterElement = computed(() => {
  return editedData.value?.element || originalData.value?.element || 'Physical';
});

const characterPath = computed(() => {
  return editedData.value?.path || originalData.value?.path || 'Destruction';
});

const characterRarity = computed(() => {
  return editedData.value?.rarity || originalData.value?.rarity || 5;
});

const characterRoles = computed((): Role[] => {
  return editedData.value?.roles || originalData.value?.roles || [];
});

// Computed properties with defaults for section components
const baseTeammates = computed({
  get(): Teammates {
    return editedData.value?.baseTeammates || {};
  },
  set(value: Teammates) {
    if (editedData.value) {
      editedData.value.baseTeammates = value;
    }
  },
});

const investment = computed({
  get(): CharacterInvestment {
    return editedData.value?.investment || { eidolons: [], lightCones: [] };
  },
  set(value: CharacterInvestment) {
    if (editedData.value) {
      editedData.value.investment = value;
    }
  },
});

const compositions = computed({
  get(): TeamComposition[] {
    return editedData.value?.compositions || [];
  },
  set(value: TeamComposition[]) {
    if (editedData.value) {
      editedData.value.compositions = value;
    }
  },
});

// Tier edits with default - need to bind to the actual ref for v-model to work
// The local TierEdits type in EditorTierSection uses { [role: string]: TierRating }
// while useCharacterEditor uses Record<Role, TierRating | undefined>, so we cast here
type LocalTierEdits = {
  moc?: { [role: string]: import('../../types').TierRating };
  pf?: { [role: string]: import('../../types').TierRating };
  as?: { [role: string]: import('../../types').TierRating };
};

const tierEditsWithDefault = computed({
  get(): LocalTierEdits {
    const tiers = tierEdits.value || {};
    // Clean up undefined values when getting
    const cleanMode = (mode: Record<string, import('../../types').TierRating | undefined> | undefined) => {
      if (!mode) return undefined;
      const cleaned: { [role: string]: import('../../types').TierRating } = {};
      for (const [key, val] of Object.entries(mode)) {
        if (val !== undefined) {
          cleaned[key] = val;
        }
      }
      return Object.keys(cleaned).length > 0 ? cleaned : undefined;
    };
    return {
      moc: cleanMode(tiers.moc),
      pf: cleanMode(tiers.pf),
      as: cleanMode(tiers.as),
    };
  },
  set(value: LocalTierEdits) {
    tierEdits.value = value as unknown as TierEdits;
  },
});

// Element color for header glow
const elementColor = computed(() => {
  const colors: Record<string, string> = {
    Physical: 'rgba(156, 163, 175, 0.4)',
    Fire: 'rgba(239, 68, 68, 0.4)',
    Ice: 'rgba(96, 165, 250, 0.4)',
    Lightning: 'rgba(167, 139, 250, 0.4)',
    Wind: 'rgba(52, 211, 153, 0.4)',
    Quantum: 'rgba(99, 102, 241, 0.4)',
    Imaginary: 'rgba(251, 191, 36, 0.4)',
  };
  return colors[characterElement.value] || colors.Physical;
});

// Preview button state
const canPreview = computed(() => {
  return isDirty.value && !hasErrors.value && !isLoading.value;
});

// ==================
// WATCHERS
// ==================

// Validate on changes
watch(editedData, () => {
  validate();
}, { deep: true });

// Clear messages when editing
watch(editedData, () => {
  successMessage.value = '';
  errorMessage.value = '';
}, { deep: true });

// ==================
// HANDLERS - NAVIGATION
// ==================

function handleBackClick() {
  if (isDirty.value) {
    showDiscardConfirm.value = true;
  } else {
    router.push('/admin');
  }
}

function confirmDiscard() {
  resetChanges();
  clearSuggestions();
  showDiscardConfirm.value = false;
  router.push('/admin');
}

function cancelDiscard() {
  showDiscardConfirm.value = false;
}

// ==================
// HANDLERS - PREVIEW & SUBMIT
// ==================

function handlePreview() {
  validate();
  if (!hasErrors.value) {
    showPreview.value = true;
  }
}

function handlePreviewClose() {
  showPreview.value = false;
}

async function handleSubmit(changeSummary: string) {
  const result = await submitForReview(changeSummary);

  if (result.success) {
    showPreview.value = false;
    successMessage.value = 'Changes submitted for review!';

    // Navigate back after a short delay
    setTimeout(() => {
      router.push('/admin');
    }, 1500);
  } else {
    errorMessage.value = result.error || 'Failed to submit changes';
  }
}

// ==================
// HANDLERS - DISCARD
// ==================

function handleDiscard() {
  if (isDirty.value) {
    showDiscardConfirm.value = true;
  } else {
    // No changes, just go back
    router.push('/admin');
  }
}

// ==================
// HANDLERS - BIDIRECTIONAL
// ==================

function handleBidirectionalAccept(suggestion: BidirectionalSuggestion, customReason?: string) {
  acceptSuggestion(suggestion, customReason);
}

function handleBidirectionalSkip() {
  skipSuggestion();
}

// Transform pendingSuggestions to format expected by ChangePreview
const transformedSuggestions = computed(() => {
  return pendingSuggestions.value.map(s => ({
    targetCharacterId: s.targetCharacterId,
    suggestionType: s.action as 'add' | 'update' | 'remove',
    targetField: s.targetRole,
    suggestedValue: {
      id: s.sourceCharacterId,
      rating: s.suggestedRating as TeammateRec['rating'],
      reason: s.suggestedReason,
    },
    reason: s.suggestedReason,
  }));
});

// ==================
// HANDLERS - SCROLL TO FIELD
// ==================

function handleScrollToField(fieldPath: string) {
  // Extract the section name from the field path
  const sectionMap: Record<string, string> = {
    description: 'classification',
    labels: 'classification',
    roles: 'classification',
    baseTeammates: 'teammates',
    compositions: 'compositions',
    investment: 'investment',
    tiers: 'tier',
    restrictions: 'restrictions',
  };

  const firstPart = fieldPath.split('.')[0]?.split('[')[0] || fieldPath;
  const sectionId = sectionMap[firstPart] || firstPart;

  // Special handling for baseTeammates - parse role and index
  if (fieldPath.startsWith('baseTeammates.')) {
    const match = fieldPath.match(/baseTeammates\.(\w+)\[(\d+)\]/);
    if (match && match[1] && match[2] && teammateSectionRef.value) {
      const role = match[1] as 'dps' | 'subDPS' | 'amplifiers' | 'sustains';
      const index = parseInt(match[2], 10);
      teammateSectionRef.value.scrollToTeammate(role, index);
      return;
    }
  }

  // Special handling for compositions - try to scroll to specific item
  if (fieldPath.startsWith('compositions[')) {
    const match = fieldPath.match(/compositions\[(\d+)\]/);
    if (match && match[1]) {
      const index = parseInt(match[1], 10);
      // Try to find the specific composition element
      setTimeout(() => {
        const element = document.querySelector(`[data-field-path="compositions[${index}]"]`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.classList.add('highlight-error');
          setTimeout(() => element.classList.remove('highlight-error'), 2000);
        }
      }, 100);
      return;
    }
  }

  // Special handling for investment - try to scroll to specific item
  if (fieldPath.startsWith('investment.eidolons[') || fieldPath.startsWith('investment.lightCones[')) {
    const eidolonMatch = fieldPath.match(/investment\.eidolons\[(\d+)\]/);
    const lcMatch = fieldPath.match(/investment\.lightCones\[(\d+)\]/);

    setTimeout(() => {
      let element: Element | null = null;
      if (eidolonMatch && eidolonMatch[1]) {
        element = document.querySelector(`[data-field-path="investment.eidolons[${eidolonMatch[1]}]"]`);
      } else if (lcMatch && lcMatch[1]) {
        element = document.querySelector(`[data-field-path="investment.lightCones[${lcMatch[1]}]"]`);
      }

      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('highlight-error');
        setTimeout(() => element.classList.remove('highlight-error'), 2000);
      }
    }, 100);
    return;
  }

  // Default: scroll to section
  const section = document.getElementById(`section-${sectionId}`);
  if (section) {
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// ==================
// IMAGE ERROR HANDLER
// ==================

function handleImageError(event: Event) {
  const img = event.target as HTMLImageElement;
  img.src = '/icons/placeholder.webp';
}
</script>

<template>
  <div class="character-editor">
    <!-- Loading State -->
    <div v-if="isLoading" class="loading-container">
      <div class="loading-spinner">
        <svg class="spinner-icon" viewBox="0 0 24 24">
          <circle class="spinner-track" cx="12" cy="12" r="10" fill="none" stroke-width="3" />
          <circle class="spinner-progress" cx="12" cy="12" r="10" fill="none" stroke-width="3" />
        </svg>
      </div>
      <p class="loading-text">Loading character data...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="loadError" class="error-container">
      <div class="error-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h2 class="error-title">Failed to Load Character</h2>
      <p class="error-message">{{ loadError }}</p>
      <button class="error-btn" @click="router.push('/admin')">
        Back to Dashboard
      </button>
    </div>

    <!-- Main Editor Content -->
    <template v-else-if="editedData">
      <!-- Header -->
      <header class="editor-header">
        <button class="back-btn" @click="handleBackClick">
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clip-rule="evenodd" />
          </svg>
          <span>Back to Dashboard</span>
        </button>

        <div class="header-content" :style="{ '--element-color': elementColor }">
          <img
            :src="characterIcon"
            :alt="characterName"
            class="character-icon"
            @error="handleImageError"
          />
          <div class="header-info">
            <h1 class="header-title">Editing: {{ characterName }}</h1>
            <div class="header-meta">
              <span class="meta-element">{{ characterElement }}</span>
              <span class="meta-separator">-</span>
              <span class="meta-path">{{ characterPath }}</span>
              <span class="meta-separator">-</span>
              <span class="meta-rarity">{{ characterRarity }}★</span>
            </div>
          </div>
        </div>
      </header>

      <!-- Success/Error Messages -->
      <Transition name="message">
        <div v-if="successMessage" class="message message-success">
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
          </svg>
          <span>{{ successMessage }}</span>
        </div>
      </Transition>

      <Transition name="message">
        <div v-if="errorMessage" class="message message-error">
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
          </svg>
          <span>{{ errorMessage }}</span>
        </div>
      </Transition>

      <!-- Sections Container -->
      <main class="sections-container">
        <!-- Identity Section -->
        <div id="section-identity">
          <EditorIdentitySection
            v-model="editedData"
          />
        </div>

        <!-- Classification Section -->
        <div id="section-classification">
          <EditorClassificationSection
            v-model="editedData"
          />
        </div>

        <!-- Tier Ratings Section -->
        <div id="section-tier">
          <EditorTierSection
            v-model="tierEditsWithDefault"
            :character-roles="characterRoles"
          />
        </div>

        <!-- Base Teammates Section -->
        <div id="section-teammates">
          <EditorTeammatesSection
            ref="teammateSectionRef"
            v-model="baseTeammates"
            :all-characters="characters"
          />
        </div>

        <!-- Investment Section -->
        <div id="section-investment">
          <EditorInvestmentSection
            v-model="investment"
            :all-characters="characters"
          />
        </div>

        <!-- Compositions Section -->
        <div id="section-compositions">
          <EditorCompositionsSection
            v-model="compositions"
            :all-characters="characters"
          />
        </div>

        <!-- Restrictions Section -->
        <div id="section-restrictions">
          <EditorRestrictionsSection
            v-model="editedData.restrictions"
            :all-characters="characters"
          />
        </div>

        <!-- Validation Summary -->
        <div v-if="validationErrors.length > 0" id="section-validation">
          <ValidationErrors
            :errors="validationErrors"
            @scroll-to-field="handleScrollToField"
          />
        </div>
      </main>

      <!-- Sticky Footer -->
      <footer class="editor-footer">
        <div class="footer-content">
          <div class="footer-left">
            <span v-if="isDirty" class="unsaved-indicator">
              <span class="unsaved-dot"></span>
              Unsaved changes
            </span>
          </div>
          <div class="footer-actions">
            <button
              class="btn btn-discard"
              :disabled="!isDirty"
              @click="handleDiscard"
            >
              Discard Changes
            </button>
            <button
              class="btn btn-preview"
              :disabled="!canPreview"
              @click="handlePreview"
            >
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                <path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd" />
              </svg>
              <span>Preview Changes</span>
            </button>
          </div>
        </div>
      </footer>
    </template>

    <!-- Modals -->

    <!-- Change Preview Modal -->
    <ChangePreview
      :show="showPreview"
      :original-data="originalData"
      :edited-data="editedData"
      :tier-edits="tierEdits ?? {}"
      :original-tiers="originalTiers ?? {}"
      :changed-fields="changedFields"
      :bidirectional-suggestions="transformedSuggestions"
      @close="handlePreviewClose"
      @submit="handleSubmit"
    />

    <!-- Bidirectional Prompt Modal -->
    <BidirectionalPrompt
      :show="showPrompt"
      :suggestion="currentSuggestion"
      @accept="handleBidirectionalAccept"
      @skip="handleBidirectionalSkip"
    />

    <!-- Discard Confirmation Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showDiscardConfirm" class="modal-overlay" @click.self="cancelDiscard">
          <div class="discard-modal">
            <div class="discard-header">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h3>Discard Changes?</h3>
            </div>
            <p class="discard-message">
              You have unsaved changes. Are you sure you want to discard them? This action cannot be undone.
            </p>
            <div class="discard-actions">
              <button class="btn btn-cancel" @click="cancelDiscard">
                Keep Editing
              </button>
              <button class="btn btn-discard-confirm" @click="confirmDiscard">
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
/* ==================
   CONTAINER
   ================== */

.character-editor {
  min-height: 100vh;
  padding-bottom: 100px; /* Space for sticky footer */
}

/* ==================
   LOADING STATE
   ================== */

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  gap: 1.5rem;
}

.loading-spinner {
  width: 48px;
  height: 48px;
}

.spinner-icon {
  width: 100%;
  height: 100%;
  animation: rotate 1.5s linear infinite;
}

.spinner-track {
  stroke: rgba(71, 85, 105, 0.3);
}

.spinner-progress {
  stroke: rgba(249, 115, 22, 0.8);
  stroke-linecap: round;
  stroke-dasharray: 60;
  stroke-dashoffset: 45;
  animation: dash 1.5s ease-in-out infinite;
}

@keyframes rotate {
  100% {
    transform: rotate(360deg);
  }
}

@keyframes dash {
  0% {
    stroke-dashoffset: 60;
  }
  50% {
    stroke-dashoffset: 15;
  }
  100% {
    stroke-dashoffset: 60;
  }
}

.loading-text {
  font-size: 1rem;
  color: rgba(148, 163, 184, 0.8);
}

/* ==================
   ERROR STATE
   ================== */

.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  gap: 1rem;
  padding: 2rem;
  text-align: center;
}

.error-icon {
  width: 64px;
  height: 64px;
  color: rgba(239, 68, 68, 0.8);
}

.error-icon svg {
  width: 100%;
  height: 100%;
}

.error-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: rgba(241, 245, 249, 1);
  margin: 0;
}

.error-message {
  font-size: 1rem;
  color: rgba(148, 163, 184, 0.8);
  margin: 0;
  max-width: 400px;
}

.error-btn {
  margin-top: 1rem;
  padding: 0.75rem 1.5rem;
  background: rgba(249, 115, 22, 0.9);
  border: none;
  border-radius: 0.5rem;
  color: white;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.error-btn:hover {
  background: rgba(249, 115, 22, 1);
  box-shadow: 0 0 20px rgba(249, 115, 22, 0.4);
}

/* ==================
   HEADER
   ================== */

.editor-header {
  padding: 1.5rem;
  padding-bottom: 0;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: transparent;
  border: 1px solid rgba(71, 85, 105, 0.5);
  border-radius: 0.5rem;
  color: rgba(148, 163, 184, 0.9);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: 1.5rem;
}

.back-btn:hover {
  background: rgba(71, 85, 105, 0.3);
  border-color: rgba(100, 116, 139, 0.6);
  color: rgba(226, 232, 240, 1);
}

.back-btn svg {
  width: 1.125rem;
  height: 1.125rem;
}

.header-content {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  padding: 1.5rem;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(71, 85, 105, 0.5);
  border-radius: 0.75rem;
  box-shadow: 0 0 30px var(--element-color, rgba(156, 163, 175, 0.2));
}

.character-icon {
  width: 72px;
  height: 72px;
  border-radius: 0.625rem;
  border: 2px solid rgba(249, 115, 22, 0.5);
  object-fit: cover;
  flex-shrink: 0;
}

.header-info {
  flex: 1;
  min-width: 0;
}

.header-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: rgba(241, 245, 249, 1);
  margin: 0 0 0.5rem 0;
  font-family: var(--font-display, 'Orbitron', system-ui);
}

.header-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9375rem;
  color: rgba(148, 163, 184, 0.9);
}

.meta-separator {
  color: rgba(71, 85, 105, 0.6);
}

.meta-rarity {
  color: rgba(251, 191, 36, 0.9);
  font-weight: 600;
}

/* ==================
   MESSAGES
   ================== */

.message {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  margin: 1rem 1.5rem 0;
  padding: 0.875rem 1rem;
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  font-weight: 500;
}

.message svg {
  width: 1.25rem;
  height: 1.25rem;
  flex-shrink: 0;
}

.message-success {
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
  color: rgba(34, 197, 94, 0.95);
}

.message-error {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: rgba(248, 113, 113, 0.95);
}

.message-enter-active,
.message-leave-active {
  transition: all 0.3s ease;
}

.message-enter-from,
.message-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* ==================
   SECTIONS CONTAINER
   ================== */

.sections-container {
  max-width: 900px;
  margin: 0 auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

/* ==================
   STICKY FOOTER
   ================== */

.editor-footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(15, 23, 42, 0.95);
  backdrop-filter: blur(8px);
  border-top: 1px solid rgba(71, 85, 105, 0.5);
  z-index: 100;
}

.footer-content {
  max-width: 900px;
  margin: 0 auto;
  padding: 1rem 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.footer-left {
  flex: 1;
}

.unsaved-indicator {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: rgba(251, 191, 36, 0.9);
}

.unsaved-dot {
  width: 8px;
  height: 8px;
  background: rgba(251, 191, 36, 0.9);
  border-radius: 50%;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

.footer-actions {
  display: flex;
  gap: 0.75rem;
}

/* ==================
   BUTTONS
   ================== */

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  border: none;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-discard {
  background: rgba(71, 85, 105, 0.5);
  color: rgba(203, 213, 225, 0.9);
}

.btn-discard:hover:not(:disabled) {
  background: rgba(71, 85, 105, 0.7);
  color: rgba(241, 245, 249, 1);
}

.btn-preview {
  background: rgba(249, 115, 22, 0.9);
  color: white;
}

.btn-preview:hover:not(:disabled) {
  background: rgba(249, 115, 22, 1);
  box-shadow: 0 0 16px rgba(249, 115, 22, 0.4);
}

.btn-preview svg {
  width: 1.125rem;
  height: 1.125rem;
}

/* ==================
   DISCARD MODAL
   ================== */

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.discard-modal {
  background: rgb(30, 41, 59);
  border: 1px solid rgba(71, 85, 105, 0.6);
  border-radius: 0.75rem;
  max-width: 420px;
  width: 100%;
  padding: 1.5rem;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}

.discard-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.discard-header svg {
  width: 1.75rem;
  height: 1.75rem;
  color: rgba(251, 191, 36, 0.9);
}

.discard-header h3 {
  font-size: 1.25rem;
  font-weight: 600;
  color: rgba(241, 245, 249, 1);
  margin: 0;
}

.discard-message {
  font-size: 0.9375rem;
  color: rgba(148, 163, 184, 0.9);
  line-height: 1.6;
  margin: 0 0 1.5rem 0;
}

.discard-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.btn-cancel {
  background: rgba(71, 85, 105, 0.5);
  color: rgba(203, 213, 225, 0.9);
}

.btn-cancel:hover {
  background: rgba(71, 85, 105, 0.7);
  color: rgba(241, 245, 249, 1);
}

.btn-discard-confirm {
  background: rgba(239, 68, 68, 0.9);
  color: white;
}

.btn-discard-confirm:hover {
  background: rgba(239, 68, 68, 1);
  box-shadow: 0 0 16px rgba(239, 68, 68, 0.4);
}

/* Modal transitions */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-active .discard-modal,
.modal-leave-active .discard-modal {
  transition: transform 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .discard-modal,
.modal-leave-to .discard-modal {
  transform: scale(0.95) translateY(10px);
}

/* ==================
   RESPONSIVE
   ================== */

@media (max-width: 768px) {
  .character-editor {
    padding-bottom: 120px;
  }

  .editor-header {
    padding: 1rem;
    padding-bottom: 0;
  }

  .header-content {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
    padding: 1rem;
  }

  .character-icon {
    width: 56px;
    height: 56px;
  }

  .header-title {
    font-size: 1.25rem;
  }

  .header-meta {
    flex-wrap: wrap;
    font-size: 0.875rem;
  }

  .sections-container {
    padding: 1rem;
  }

  .footer-content {
    flex-direction: column;
    align-items: stretch;
    padding: 0.875rem 1rem;
  }

  .footer-left {
    text-align: center;
  }

  .footer-actions {
    flex-direction: column;
  }

  .btn {
    width: 100%;
    justify-content: center;
  }

  .discard-actions {
    flex-direction: column;
  }

  .btn-cancel,
  .btn-discard-confirm {
    width: 100%;
    justify-content: center;
  }
}

@media (max-width: 480px) {
  .back-btn span {
    display: none;
  }

  .header-title {
    font-size: 1.125rem;
  }
}
</style>
