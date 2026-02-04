<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { supabase, isSupabaseConfigured, getBrowserId } from '../lib/supabase';
import { characters } from '../data';
import type { TeammateRating, TierRating } from '../types';

// ==================
// TYPES
// ==================

export type FeedbackType =
  | 'teammate-missing'
  | 'rating-wrong'
  | 'tier-wrong'
  | 'team-issue'
  | 'composition-missing'
  | 'investment-wrong'
  | 'restriction-wrong';

export interface FeedbackContext {
  // Common
  characterId?: string;
  characterName?: string;

  // For teammate-missing
  role?: string;

  // For rating-wrong
  teammateId?: string;
  teammateName?: string;
  currentRating?: TeammateRating;

  // For tier-wrong (single mode - legacy)
  gameMode?: 'moc' | 'pf' | 'as';
  currentTier?: TierRating;
  // For tier-wrong (all modes - new combined button)
  allTiers?: {
    moc: TierRating;
    pf: TierRating;
    as: TierRating;
  };

  // For team-issue
  teamName?: string;
  teamCharacters?: string[];
  teamRating?: string;

  // For composition-missing (no extra context needed)

  // For investment-wrong (no extra context needed)

  // For restriction-wrong
  restrictionType?: 'warning' | 'avoid';
}

interface Props {
  isOpen: boolean;
  feedbackType: FeedbackType;
  context: FeedbackContext;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  close: [];
}>();

// ==================
// STATE
// ==================

const isSubmitting = ref(false);
const showSuccess = ref(false);
const submitError = ref<string | null>(null);

// Form data
const additionalText = ref('');

// Type-specific form data
const suggestedCharacterId = ref<string | null>(null);
const suggestedRating = ref<TeammateRating | null>(null);
const suggestedTier = ref<TierRating | null>(null);
const selectedMode = ref<'moc' | 'pf' | 'as'>('moc');
const issueType = ref<'doesnt-work' | 'outdated' | 'other'>('doesnt-work');
const compositionName = ref('');
const compositionDescription = ref('');
const investmentArea = ref<'eidolons' | 'lightcones' | 'priority' | 'other'>('eidolons');
const restrictionIssueType = ref<'wrong-warning' | 'missing-warning' | 'wrong-avoid' | 'missing-avoid' | 'other'>('wrong-warning');

// Get current tier for selected mode (when allTiers is provided)
const currentTierForSelectedMode = computed(() => {
  if (props.context.allTiers) {
    return props.context.allTiers[selectedMode.value];
  }
  return props.context.currentTier;
});

// Check if we have all tiers (combined mode selector)
const hasAllTiers = computed(() => !!props.context.allTiers);

// ==================
// COMPUTED
// ==================

const modalTitle = computed(() => {
  const titles: Record<FeedbackType, string> = {
    'teammate-missing': 'Suggest Missing Teammate',
    'rating-wrong': 'Report Incorrect Rating',
    'tier-wrong': 'Report Incorrect Tier',
    'team-issue': 'Report Team Issue',
    'composition-missing': 'Suggest Missing Playstyle',
    'investment-wrong': 'Report Investment Issue',
    'restriction-wrong': 'Report Restriction Issue',
  };
  return titles[props.feedbackType];
});

const modalSubtitle = computed(() => {
  const subtitles: Record<FeedbackType, string> = {
    'teammate-missing': `For ${props.context.characterName || 'this character'}`,
    'rating-wrong': `${props.context.teammateName || 'Teammate'} for ${props.context.characterName || 'this character'}`,
    'tier-wrong': props.context.characterName || 'Character',
    'team-issue': props.context.teamName || 'Pre-built team',
    'composition-missing': `For ${props.context.characterName || 'this character'}`,
    'investment-wrong': `For ${props.context.characterName || 'this character'}`,
    'restriction-wrong': `For ${props.context.characterName || 'this character'}`,
  };
  return subtitles[props.feedbackType];
});

// Character list for picker (excluding current character)
const availableCharacters = computed(() => {
  return characters
    .filter(c => c.id !== props.context.characterId)
    .sort((a, b) => a.name.localeCompare(b.name));
});

const canSubmit = computed(() => {
  switch (props.feedbackType) {
    case 'teammate-missing':
      return suggestedCharacterId.value !== null;
    case 'rating-wrong':
      return suggestedRating.value !== null && suggestedRating.value !== props.context.currentRating;
    case 'tier-wrong':
      return suggestedTier.value !== null && suggestedTier.value !== currentTierForSelectedMode.value;
    case 'team-issue':
      return issueType.value !== null;
    case 'composition-missing':
      return compositionName.value.trim().length > 0;
    case 'investment-wrong':
      return additionalText.value.trim().length > 0;
    case 'restriction-wrong':
      return additionalText.value.trim().length > 0;
    default:
      return false;
  }
});

// ==================
// HELPERS
// ==================

function gameModeLabel(mode?: string): string {
  const labels: Record<string, string> = {
    moc: 'Memory of Chaos',
    pf: 'Pure Fiction',
    as: 'Apocalyptic Shadow',
  };
  return mode ? labels[mode] || mode.toUpperCase() : 'Unknown Mode';
}

const ratings: TeammateRating[] = ['S', 'A', 'B', 'C', 'D'];
const tiers: TierRating[] = ['T-1', 'T-0.5', 'T0', 'T0.5', 'T1', 'T1.5', 'T2', 'T3', 'T4', 'T5'];

// ==================
// SUBMISSION
// ==================


// Build the structured row for content_corrections table
function buildCorrectionRow() {
  const ctx = props.context;
  const pageUrl = window.location.pathname + window.location.hash;

  // Base fields common to all corrections
  const base = {
    character_id: ctx.characterId || '',
    browser_id: getBrowserId(),
    user_agent: navigator.userAgent,
    page_url: pageUrl,
    notes: additionalText.value.trim() || null,
    status: 'pending',
  };

  switch (props.feedbackType) {
    case 'teammate-missing':
      return {
        ...base,
        category: 'teammate-missing',
        target_type: 'character',
        target_id: suggestedCharacterId.value,
        role: ctx.role || null,
        suggested_value: suggestedRating.value,
      };

    case 'rating-wrong':
      return {
        ...base,
        category: 'teammate-rating',
        target_type: 'character',
        target_id: ctx.teammateId,
        current_value: ctx.currentRating,
        suggested_value: suggestedRating.value,
      };

    case 'tier-wrong':
      return {
        ...base,
        category: 'tier',
        game_mode: hasAllTiers.value ? selectedMode.value : ctx.gameMode,
        current_value: currentTierForSelectedMode.value,
        suggested_value: suggestedTier.value,
      };

    case 'team-issue':
      return {
        ...base,
        category: 'team',
        target_type: 'team',
        target_id: ctx.teamName,
        team_characters: ctx.teamCharacters || [],
        current_value: ctx.teamRating,
        issue_subtype: issueType.value,
      };

    case 'composition-missing':
      return {
        ...base,
        category: 'composition',
        suggested_name: compositionName.value,
        suggested_description: compositionDescription.value.trim() || null,
      };

    case 'investment-wrong':
      return {
        ...base,
        category: 'investment',
        investment_area: investmentArea.value,
      };

    case 'restriction-wrong':
      return {
        ...base,
        category: 'restriction',
        issue_subtype: restrictionIssueType.value,
      };

    default:
      return {
        ...base,
        category: 'other',
      };
  }
}

async function submitFeedback() {
  if (!canSubmit.value || isSubmitting.value) return;

  isSubmitting.value = true;
  submitError.value = null;

  if (!isSupabaseConfigured()) {
    submitError.value = 'Feedback system not configured';
    isSubmitting.value = false;
    return;
  }

  try {
    const row = buildCorrectionRow();

    const { error } = await supabase.from('content_corrections').insert(row);

    if (error) {
      console.error('Supabase error:', error);
      submitError.value = 'Failed to submit feedback';
      isSubmitting.value = false;
      return;
    }

    isSubmitting.value = false;
    showSuccess.value = true;

    // Auto-close after success
    setTimeout(() => {
      handleClose();
    }, 1500);
  } catch (e) {
    console.error('Failed to submit feedback:', e);
    submitError.value = 'Failed to submit feedback';
    isSubmitting.value = false;
  }
}

// ==================
// LIFECYCLE
// ==================

function handleClose() {
  // Reset state
  additionalText.value = '';
  suggestedCharacterId.value = null;
  suggestedRating.value = null;
  suggestedTier.value = null;
  selectedMode.value = 'moc';
  issueType.value = 'doesnt-work';
  compositionName.value = '';
  compositionDescription.value = '';
  investmentArea.value = 'eidolons';
  restrictionIssueType.value = 'wrong-warning';
  showSuccess.value = false;
  submitError.value = null;
  emit('close');
}

// Reset form when modal opens with new context
watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    additionalText.value = '';
    suggestedCharacterId.value = null;
    suggestedRating.value = null;
    suggestedTier.value = null;
    selectedMode.value = 'moc';
    showSuccess.value = false;
    submitError.value = null;
  }
});
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="isOpen" class="modal-overlay" @click.self="handleClose">
        <div class="modal-container">
          <!-- Header -->
          <div class="modal-header">
            <div class="header-content">
              <div class="header-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                  <line x1="4" y1="22" x2="4" y2="15" />
                </svg>
              </div>
              <div class="header-text">
                <h2 class="modal-title">{{ modalTitle }}</h2>
                <p class="modal-subtitle">{{ modalSubtitle }}</p>
              </div>
            </div>
            <button class="close-btn" @click="handleClose">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Success State -->
          <div v-if="showSuccess" class="success-state">
            <div class="success-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h3 class="success-title">Feedback Submitted!</h3>
            <p class="success-text">Thank you for helping improve StarGuide</p>
          </div>

          <!-- Form Content -->
          <div v-else class="modal-body">
            <!-- TEAMMATE MISSING -->
            <template v-if="feedbackType === 'teammate-missing'">
              <div class="form-group">
                <label class="form-label">Select Missing Character</label>
                <select v-model="suggestedCharacterId" class="form-select">
                  <option :value="null" disabled>Choose a character...</option>
                  <option v-for="char in availableCharacters" :key="char.id" :value="char.id">
                    {{ char.name }}
                  </option>
                </select>
              </div>

              <div v-if="suggestedCharacterId" class="form-group">
                <label class="form-label">Suggested Rating (optional)</label>
                <div class="rating-buttons">
                  <button
                    v-for="r in ratings"
                    :key="r"
                    class="rating-btn"
                    :class="{ active: suggestedRating === r, [`rating-${r.toLowerCase()}`]: true }"
                    @click="suggestedRating = suggestedRating === r ? null : r"
                  >
                    {{ r }}
                  </button>
                </div>
              </div>
            </template>

            <!-- RATING WRONG -->
            <template v-if="feedbackType === 'rating-wrong'">
              <div class="current-value">
                <span class="current-label">Current rating:</span>
                <span class="current-badge" :class="`rating-${context.currentRating?.toLowerCase()}`">
                  {{ context.currentRating }}
                </span>
              </div>

              <div class="form-group">
                <label class="form-label">What should it be?</label>
                <div class="rating-buttons">
                  <button
                    v-for="r in ratings"
                    :key="r"
                    class="rating-btn"
                    :class="{
                      active: suggestedRating === r,
                      [`rating-${r.toLowerCase()}`]: true,
                      disabled: r === context.currentRating
                    }"
                    :disabled="r === context.currentRating"
                    @click="suggestedRating = r"
                  >
                    {{ r }}
                  </button>
                </div>
              </div>
            </template>

            <!-- TIER WRONG -->
            <template v-if="feedbackType === 'tier-wrong'">
              <!-- Mode selector (when allTiers provided) -->
              <div v-if="hasAllTiers" class="form-group">
                <label class="form-label">Which game mode?</label>
                <div class="mode-buttons">
                  <button
                    v-for="mode in (['moc', 'pf', 'as'] as const)"
                    :key="mode"
                    class="mode-btn"
                    :class="{ active: selectedMode === mode }"
                    @click="selectedMode = mode; suggestedTier = null"
                  >
                    <span class="mode-label">{{ mode === 'moc' ? 'MoC' : mode === 'pf' ? 'PF' : 'AS' }}</span>
                    <span class="mode-tier">{{ context.allTiers?.[mode] }}</span>
                  </button>
                </div>
              </div>

              <div class="current-value">
                <span class="current-label">Current tier in {{ gameModeLabel(hasAllTiers ? selectedMode : context.gameMode) }}:</span>
                <span class="current-badge tier-badge">{{ currentTierForSelectedMode }}</span>
              </div>

              <div class="form-group">
                <label class="form-label">What should it be?</label>
                <div class="tier-buttons">
                  <button
                    v-for="t in tiers"
                    :key="t"
                    class="tier-btn"
                    :class="{
                      active: suggestedTier === t,
                      disabled: t === currentTierForSelectedMode
                    }"
                    :disabled="t === currentTierForSelectedMode"
                    @click="suggestedTier = t"
                  >
                    {{ t }}
                  </button>
                </div>
              </div>
            </template>

            <!-- TEAM ISSUE -->
            <template v-if="feedbackType === 'team-issue'">
              <div class="form-group">
                <label class="form-label">What's the issue?</label>
                <div class="issue-buttons">
                  <button
                    v-for="type in [
                      { id: 'doesnt-work', label: 'Team doesn\'t work' },
                      { id: 'outdated', label: 'Outdated/nerfed' },
                      { id: 'other', label: 'Other' },
                    ]"
                    :key="type.id"
                    class="issue-btn"
                    :class="{ active: issueType === type.id }"
                    @click="issueType = type.id as any"
                  >
                    {{ type.label }}
                  </button>
                </div>
              </div>
            </template>

            <!-- COMPOSITION MISSING -->
            <template v-if="feedbackType === 'composition-missing'">
              <div class="form-group">
                <label class="form-label">Playstyle Name</label>
                <input
                  v-model="compositionName"
                  type="text"
                  class="form-input"
                  placeholder="e.g., DoT Focus, Break Build..."
                />
              </div>

              <div class="form-group">
                <label class="form-label">Description (optional)</label>
                <textarea
                  v-model="compositionDescription"
                  class="form-textarea"
                  rows="2"
                  placeholder="Describe when to use this playstyle..."
                ></textarea>
              </div>
            </template>

            <!-- INVESTMENT WRONG -->
            <template v-if="feedbackType === 'investment-wrong'">
              <div class="form-group">
                <label class="form-label">What area has issues?</label>
                <div class="issue-buttons">
                  <button
                    v-for="area in [
                      { id: 'eidolons', label: 'Eidolons' },
                      { id: 'lightcones', label: 'Light Cones' },
                      { id: 'priority', label: 'Priority Order' },
                      { id: 'other', label: 'Other' },
                    ]"
                    :key="area.id"
                    class="issue-btn"
                    :class="{ active: investmentArea === area.id }"
                    @click="investmentArea = area.id as any"
                  >
                    {{ area.label }}
                  </button>
                </div>
              </div>
            </template>

            <!-- RESTRICTION WRONG -->
            <template v-if="feedbackType === 'restriction-wrong'">
              <div class="form-group">
                <label class="form-label">What's the issue?</label>
                <div class="issue-buttons">
                  <button
                    v-for="issue in [
                      { id: 'wrong-warning', label: 'Warning is wrong' },
                      { id: 'missing-warning', label: 'Missing warning' },
                      { id: 'wrong-avoid', label: 'Avoid pairing wrong' },
                      { id: 'missing-avoid', label: 'Missing avoid' },
                      { id: 'other', label: 'Other' },
                    ]"
                    :key="issue.id"
                    class="issue-btn"
                    :class="{ active: restrictionIssueType === issue.id }"
                    @click="restrictionIssueType = issue.id as any"
                  >
                    {{ issue.label }}
                  </button>
                </div>
              </div>
            </template>

            <!-- Additional Notes (always shown) -->
            <div class="form-group">
              <label class="form-label">
                {{ (feedbackType === 'investment-wrong' || feedbackType === 'restriction-wrong') ? 'Describe the issue' : 'Additional notes (optional)' }}
              </label>
              <textarea
                v-model="additionalText"
                class="form-textarea"
                rows="3"
                :placeholder="(feedbackType === 'investment-wrong' || feedbackType === 'restriction-wrong')
                  ? 'Please explain what\'s wrong...'
                  : 'Any additional context...'"
              ></textarea>
            </div>

            <!-- Error Message -->
            <div v-if="submitError" class="error-message">
              {{ submitError }}
            </div>
          </div>

          <!-- Footer -->
          <div v-if="!showSuccess" class="modal-footer">
            <button class="cancel-btn" @click="handleClose">Cancel</button>
            <button
              class="submit-btn"
              :disabled="!canSubmit || isSubmitting"
              @click="submitFeedback"
            >
              <span v-if="isSubmitting" class="loading-dots">
                <span></span><span></span><span></span>
              </span>
              <span v-else>Submit Feedback</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Overlay */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 1rem;
}

/* Container */
.modal-container {
  width: 100%;
  max-width: 440px;
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
  background: linear-gradient(145deg, rgba(22, 22, 48, 0.98) 0%, rgba(14, 14, 32, 0.99) 100%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 1rem;
  box-shadow:
    0 24px 80px rgba(0, 0, 0, 0.6),
    0 0 1px rgba(255, 255, 255, 0.1);
}

/* Header */
.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 1.25rem 1.25rem 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.header-content {
  display: flex;
  align-items: flex-start;
  gap: 0.875rem;
}

.header-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(251, 146, 60, 0.15);
  border: 1px solid rgba(251, 146, 60, 0.3);
  border-radius: 10px;
  color: rgba(251, 146, 60, 0.9);
  flex-shrink: 0;
}

.header-icon svg {
  width: 20px;
  height: 20px;
}

.header-text {
  flex: 1;
}

.modal-title {
  font-family: var(--font-display, system-ui);
  font-size: 1.125rem;
  font-weight: 700;
  color: white;
  margin: 0;
}

.modal-subtitle {
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.5);
  margin: 0.25rem 0 0;
}

.close-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.5);
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.close-btn svg {
  width: 18px;
  height: 18px;
}

/* Body */
.modal-body {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* Form Groups */
.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
}

.form-select,
.form-input,
.form-textarea {
  width: 100%;
  padding: 0.75rem;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  color: white;
  font-size: 0.875rem;
  font-family: inherit;
  transition: all 0.2s;
}

.form-select:focus,
.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: rgba(251, 146, 60, 0.5);
  box-shadow: 0 0 0 3px rgba(251, 146, 60, 0.1);
}

.form-select {
  cursor: pointer;
}

.form-select option {
  background: #1a1a2e;
  color: white;
}

.form-textarea {
  resize: vertical;
  min-height: 80px;
}

/* Current Value Display */
.current-value {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 0.5rem;
}

.current-label {
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.6);
}

.current-badge {
  padding: 0.25rem 0.625rem;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  font-weight: 700;
  color: white;
}

.current-badge.tier-badge {
  background: linear-gradient(135deg, #a855f7, #8b5cf6);
}

/* Rating Buttons */
.rating-buttons,
.tier-buttons {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.rating-btn,
.tier-btn {
  flex: 1;
  min-width: 50px;
  padding: 0.625rem 0.5rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.875rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.rating-btn:hover:not(.disabled),
.tier-btn:hover:not(.disabled) {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
}

.rating-btn.disabled,
.tier-btn.disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.rating-btn.active,
.tier-btn.active {
  color: white;
  transform: scale(1.02);
}

/* Rating colors */
.rating-btn.rating-s.active,
.current-badge.rating-s {
  background: linear-gradient(135deg, #ff9500, #ff6b00);
  border-color: #ff9500;
}

.rating-btn.rating-a.active,
.current-badge.rating-a {
  background: linear-gradient(135deg, #a855f7, #8b5cf6);
  border-color: #a855f7;
}

.rating-btn.rating-b.active,
.current-badge.rating-b {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  border-color: #3b82f6;
}

.rating-btn.rating-c.active,
.current-badge.rating-c {
  background: linear-gradient(135deg, #6b7280, #4b5563);
  border-color: #6b7280;
}

.rating-btn.rating-d.active,
.current-badge.rating-d {
  background: linear-gradient(135deg, #374151, #1f2937);
  border-color: #374151;
}

.tier-btn.active {
  background: linear-gradient(135deg, #a855f7, #8b5cf6);
  border-color: #a855f7;
}

/* Mode Buttons (for tier selection) */
.mode-buttons {
  display: flex;
  gap: 0.5rem;
}

.mode-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.75rem 0.5rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: all 0.2s;
}

.mode-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
}

.mode-btn.active {
  background: rgba(139, 92, 246, 0.15);
  border-color: rgba(139, 92, 246, 0.4);
  color: white;
}

.mode-label {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.mode-tier {
  font-size: 0.875rem;
  font-weight: 600;
  color: rgba(168, 85, 247, 0.9);
}

.mode-btn.active .mode-tier {
  color: #c4b5fd;
}

/* Issue Buttons */
.issue-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.issue-btn {
  flex: 1 1 calc(50% - 0.25rem);
  min-width: 120px;
  padding: 0.625rem 0.75rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.issue-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.issue-btn.active {
  background: rgba(251, 146, 60, 0.15);
  border-color: rgba(251, 146, 60, 0.4);
  color: rgba(251, 146, 60, 0.95);
}

/* Error Message */
.error-message {
  padding: 0.75rem;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 0.5rem;
  color: rgba(248, 113, 113, 0.9);
  font-size: 0.8125rem;
}

/* Footer */
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.25rem 1.25rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.cancel-btn,
.submit-btn {
  padding: 0.75rem 1.25rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.cancel-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.6);
}

.cancel-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.submit-btn {
  background: linear-gradient(135deg, #fb923c, #f97316);
  border: none;
  color: white;
  min-width: 140px;
}

.submit-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(251, 146, 60, 0.3);
}

.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Loading Dots */
.loading-dots {
  display: flex;
  gap: 4px;
  justify-content: center;
}

.loading-dots span {
  width: 6px;
  height: 6px;
  background: white;
  border-radius: 50%;
  animation: loading-pulse 1s ease-in-out infinite;
}

.loading-dots span:nth-child(2) {
  animation-delay: 0.15s;
}

.loading-dots span:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes loading-pulse {
  0%, 100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}

/* Success State */
.success-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 3rem 2rem;
  text-align: center;
}

.success-icon {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, #22c55e, #16a34a);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
  animation: success-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.success-icon svg {
  width: 32px;
  height: 32px;
  color: white;
}

@keyframes success-pop {
  from {
    transform: scale(0);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

.success-title {
  font-family: var(--font-display, system-ui);
  font-size: 1.25rem;
  font-weight: 700;
  color: white;
  margin: 0 0 0.5rem;
}

.success-text {
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.5);
  margin: 0;
}

/* Modal Transition */
.modal-enter-active {
  animation: modal-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.modal-leave-active {
  animation: modal-out 0.2s ease-in;
}

@keyframes modal-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes modal-out {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

.modal-enter-active .modal-container {
  animation: modal-container-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.modal-leave-active .modal-container {
  animation: modal-container-out 0.2s ease-in;
}

@keyframes modal-container-in {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes modal-container-out {
  from {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  to {
    opacity: 0;
    transform: scale(0.98) translateY(5px);
  }
}

/* Mobile Responsive */
@media (max-width: 480px) {
  .modal-overlay {
    padding: 0.5rem;
    align-items: flex-end;
  }

  .modal-container {
    max-height: calc(100vh - 1rem);
    border-radius: 1rem 1rem 0 0;
  }

  .modal-header {
    padding: 1rem;
  }

  .header-icon {
    width: 36px;
    height: 36px;
  }

  .header-icon svg {
    width: 18px;
    height: 18px;
  }

  .modal-title {
    font-size: 1rem;
  }

  .modal-body {
    padding: 1rem;
  }

  .tier-buttons {
    flex-wrap: wrap;
  }

  .tier-btn {
    flex: 1 1 calc(25% - 0.375rem);
    min-width: 50px;
    padding: 0.5rem 0.25rem;
    font-size: 0.75rem;
  }

  .rating-btn {
    min-width: 40px;
    padding: 0.5rem 0.25rem;
  }

  .issue-btn {
    flex: 1 1 100%;
    min-width: unset;
  }

  .modal-footer {
    flex-direction: column;
    padding: 1rem;
  }

  .cancel-btn,
  .submit-btn {
    width: 100%;
    justify-content: center;
  }

  .submit-btn {
    order: -1;
    min-width: unset;
  }
}
</style>
