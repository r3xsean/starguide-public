<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Character, TeamComposition, TeammateRating } from '../types';
import { hasCompositions, getCompositionById } from '../utils/characterUtils';
import { getCharacterById } from '../data';
import FeedbackButton from './FeedbackButton.vue';
import ContextualFeedbackModal from './ContextualFeedbackModal.vue';
import type { FeedbackContext } from './ContextualFeedbackModal.vue';

// Types for tracking composition changes
interface RatingChange {
  characterId: string;
  characterName: string;
  role: string;
  fromRating: TeammateRating | null; // null means not in base
  toRating: TeammateRating;
  reason?: string;
}

interface ExcludedCharacter {
  characterId: string;
  characterName: string;
  role: string;
}

interface CompositionChanges {
  ratingChanges: RatingChange[];
  excludedCharacters: ExcludedCharacter[];
  hasAnyChanges: boolean;
}

interface Props {
  character: Character;
  selectedCompositionId: string | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:selectedCompositionId': [id: string | null];
}>();

// Check if character has compositions
const characterHasCompositions = computed(() => hasCompositions(props.character));

// Get all compositions for this character
const compositions = computed((): TeamComposition[] => {
  return props.character.compositions || [];
});

// Get selected composition object
const selectedComposition = computed((): TeamComposition | undefined => {
  if (!props.selectedCompositionId) return undefined;
  return getCompositionById(props.character, props.selectedCompositionId);
});

// Calculate what changed in this composition vs baseTeammates
const compositionChanges = computed((): CompositionChanges => {
  const changes: CompositionChanges = {
    ratingChanges: [],
    excludedCharacters: [],
    hasAnyChanges: false,
  };

  const comp = selectedComposition.value;
  if (!comp?.teammateOverrides) return changes;

  const base = props.character.baseTeammates || props.character.teammates || {};
  const roles = ['dps', 'subDPS', 'amplifiers', 'sustains'] as const;
  const roleLabels: Record<string, string> = {
    dps: 'DPS',
    subDPS: 'Sub-DPS',
    amplifiers: 'Amplifier',
    sustains: 'Sustain',
  };

  for (const role of roles) {
    const overrides = comp.teammateOverrides[role];
    if (!overrides) continue;

    const baseList = base[role] || [];

    for (const override of overrides) {
      const char = getCharacterById(override.id);
      const charName = char?.name || override.id;
      const baseEntry = baseList.find(t => t.id === override.id);

      const roleLabel = roleLabels[role] || role;

      if (override.excluded) {
        // Character excluded from this composition
        if (baseEntry) {
          changes.excludedCharacters.push({
            characterId: override.id,
            characterName: charName,
            role: roleLabel,
          });
        }
      } else if (override.rating) {
        // Check if this is a new addition or rating change
        const fromRating = baseEntry?.rating || null;
        if (fromRating !== override.rating) {
          changes.ratingChanges.push({
            characterId: override.id,
            characterName: charName,
            role: roleLabel,
            fromRating,
            toRating: override.rating,
            reason: override.reason,
          });
        }
      }
    }
  }

  changes.hasAnyChanges = changes.ratingChanges.length > 0 || changes.excludedCharacters.length > 0;
  return changes;
});

// Check if composition has any requirements or changes to display
const hasCompositionDetails = computed(() => {
  const comp = selectedComposition.value;
  if (!comp) return false;

  return (
    compositionChanges.value.hasAnyChanges ||
    (comp.core && comp.core.length > 0) ||
    (comp.pathRequirements && comp.pathRequirements.length > 0) ||
    (comp.labelRequirements && comp.labelRequirements.length > 0) ||
    (comp.investmentNotes && comp.investmentNotes.length > 0)
  );
});

// Helper to check if composition has a weakness in a mode
function hasWeakMode(composition: TeamComposition | undefined, mode: 'moc' | 'pf' | 'as'): boolean {
  if (!composition?.weakModes) return false;
  return composition.weakModes.some(wm => wm.mode === mode);
}

// Helper to get weak mode reason
function getWeakModeReason(composition: TeamComposition | undefined, mode: 'moc' | 'pf' | 'as'): string {
  if (!composition?.weakModes) return '';
  const weakMode = composition.weakModes.find(wm => wm.mode === mode);
  return weakMode?.reason || '';
}

// Check if composition has any weak modes
function hasAnyWeakModes(composition: TeamComposition | undefined): boolean {
  return (composition?.weakModes?.length ?? 0) > 0;
}

function selectComposition(id: string) {
  emit('update:selectedCompositionId', id);
}

// Get icon for playstyle based on keywords
function getPlaystyleIcon(comp: TeamComposition): string {
  const name = comp.name.toLowerCase();
  const desc = (comp.description || '').toLowerCase();
  const combined = name + ' ' + desc;

  if (combined.includes('hypercarry') || combined.includes('hyper')) return '⚡';
  if (combined.includes('dot') || combined.includes('damage over time')) return '🔥';
  if (combined.includes('break') || combined.includes('super break')) return '💥';
  if (combined.includes('dual') || combined.includes('double')) return '⚔️';
  if (combined.includes('follow') || combined.includes('fua')) return '🎯';
  if (combined.includes('mono') || combined.includes('element')) return '✨';
  if (combined.includes('sustain') || combined.includes('tank')) return '🛡️';
  if (combined.includes('speed') || combined.includes('fast')) return '💨';
  if (combined.includes('ultimate') || combined.includes('ult')) return '🌟';
  if (combined.includes('summon') || combined.includes('memorial')) return '👻';
  if (combined.includes('debuff') || combined.includes('nihility')) return '☠️';
  if (combined.includes('crit') || combined.includes('critical')) return '💎';
  return '◆';
}

// ==================
// CONTEXTUAL FEEDBACK
// ==================

const showFeedbackModal = ref(false);

const feedbackContext = computed((): FeedbackContext => ({
  characterId: props.character.id,
  characterName: props.character.name,
}));

function openCompositionFeedback() {
  showFeedbackModal.value = true;
}

function closeFeedbackModal() {
  showFeedbackModal.value = false;
}
</script>

<template>
  <div
    v-if="characterHasCompositions && compositions.length >= 1"
    class="playstyle-selector"
  >
    <!-- Decorative corner accents -->
    <div class="corner-accent top-left"></div>
    <div class="corner-accent top-right"></div>
    <div class="corner-accent bottom-left"></div>
    <div class="corner-accent bottom-right"></div>

    <!-- Header Section -->
    <div class="selector-header">
      <div class="header-glow"></div>
      <div class="header-content">
        <div class="header-icon">
          <div class="icon-hex">
            <span class="icon-symbol">⬡</span>
          </div>
          <div class="icon-pulse"></div>
        </div>
        <div class="header-text">
          <div class="header-label">
            <span class="label-line"></span>
            <span class="label-text">PLAYSTYLE</span>
            <span class="label-line"></span>
          </div>
          <p class="header-subtitle">Select how you want to build {{ character.name }}</p>
        </div>
      </div>

      <!-- Feedback Button -->
      <FeedbackButton
        class="header-feedback"
        label="Missing playstyle?"
        tooltip="Report a missing playstyle/composition"
        size="sm"
        @click="openCompositionFeedback"
      />
    </div>

    <!-- Playstyle Cards Grid -->
    <div class="playstyle-grid" :class="{ 'two-items': compositions.length === 2, 'three-items': compositions.length === 3 }">
      <button
        v-for="(comp, index) in compositions"
        :key="comp.id"
        @click="selectComposition(comp.id)"
        class="playstyle-card"
        :class="{
          active: selectedCompositionId === comp.id,
          primary: comp.isPrimary
        }"
        :style="{ '--card-index': index }"
      >
        <!-- Card background effects -->
        <div class="card-bg"></div>
        <div class="card-glow"></div>
        <div class="card-border"></div>

        <!-- Selection indicator -->
        <div class="selection-indicator">
          <div class="indicator-ring"></div>
          <div class="indicator-dot"></div>
        </div>

        <!-- Card content -->
        <div class="card-content">
          <div class="card-icon">
            <span>{{ getPlaystyleIcon(comp) }}</span>
          </div>
          <div class="card-info">
            <div class="card-name">
              <span>{{ comp.name }}</span>
            </div>
          </div>
        </div>

        <!-- Primary star badge -->
        <div v-if="comp.isPrimary" class="primary-badge" title="Recommended playstyle">★</div>

        <!-- Active edge indicator -->
        <div class="active-edge"></div>
      </button>
    </div>

    <!-- Selected Playstyle Details -->
    <Transition name="details-expand">
      <div v-if="selectedComposition" class="playstyle-details">
        <div class="details-connector">
          <div class="connector-line"></div>
          <div class="connector-dot"></div>
        </div>

        <div class="details-content">
          <!-- Description -->
          <div class="details-description">
            <p>{{ selectedComposition.description }}</p>
          </div>

          <!-- Impact notice -->
          <div class="impact-notice">
            <div class="notice-icon">
              <span>⚙️</span>
            </div>
            <div class="notice-content">
              <span class="notice-label">ACTIVE CONFIGURATION</span>
              <p>Teammate recommendations, pre-built teams, and generated teams are tailored for this playstyle.</p>
            </div>
          </div>

          <!-- Weak Modes Warning -->
          <div v-if="hasAnyWeakModes(selectedComposition)" class="weak-modes-warning">
            <div class="warning-header">
              <span class="warning-icon">⚠</span>
              <span class="warning-label">MODE LIMITATIONS</span>
            </div>
            <div class="weak-modes-list">
              <div
                v-if="hasWeakMode(selectedComposition, 'moc')"
                class="weak-mode-badge moc"
                :title="getWeakModeReason(selectedComposition, 'moc')"
              >
                <span class="mode-name">MoC</span>
                <span class="mode-reason">{{ getWeakModeReason(selectedComposition, 'moc') }}</span>
              </div>
              <div
                v-if="hasWeakMode(selectedComposition, 'pf')"
                class="weak-mode-badge pf"
                :title="getWeakModeReason(selectedComposition, 'pf')"
              >
                <span class="mode-name">PF</span>
                <span class="mode-reason">{{ getWeakModeReason(selectedComposition, 'pf') }}</span>
              </div>
              <div
                v-if="hasWeakMode(selectedComposition, 'as')"
                class="weak-mode-badge as"
                :title="getWeakModeReason(selectedComposition, 'as')"
              >
                <span class="mode-name">AS</span>
                <span class="mode-reason">{{ getWeakModeReason(selectedComposition, 'as') }}</span>
              </div>
            </div>
          </div>

          <!-- Composition Changes Section -->
          <div v-if="hasCompositionDetails" class="composition-changes">
            <div class="changes-header">
              <span class="changes-icon">⚡</span>
              <span class="changes-label">PLAYSTYLE DIFFERENCES</span>
            </div>

            <!-- Core Requirements -->
            <div v-if="selectedComposition.core && selectedComposition.core.length > 0" class="changes-section">
              <div class="section-label">
                <span class="label-icon">★</span>
                <span>Core Characters</span>
              </div>
              <div class="changes-list">
                <div
                  v-for="core in selectedComposition.core"
                  :key="core.characterId"
                  class="change-item core"
                >
                  <div class="core-header">
                    <span class="char-name">{{ getCharacterById(core.characterId)?.name || core.characterId }}</span>
                    <span v-if="core.minEidolon" class="eidolon-badge">E{{ core.minEidolon }}+</span>
                  </div>
                  <div class="change-reason">{{ core.reason }}</div>
                </div>
              </div>
            </div>

            <!-- Path Requirements -->
            <div v-if="selectedComposition.pathRequirements && selectedComposition.pathRequirements.length > 0" class="changes-section">
              <div class="section-label">
                <span class="label-icon">◆</span>
                <span>Path Requirements</span>
              </div>
              <div class="changes-list">
                <div
                  v-for="req in selectedComposition.pathRequirements"
                  :key="req.path"
                  class="change-item path-req"
                >
                  <div class="req-title">{{ req.count }}× {{ req.path }}</div>
                  <div class="change-reason">{{ req.reason }}</div>
                </div>
              </div>
            </div>

            <!-- Label Requirements -->
            <div v-if="selectedComposition.labelRequirements && selectedComposition.labelRequirements.length > 0" class="changes-section">
              <div class="section-label">
                <span class="label-icon">◇</span>
                <span>Label Requirements</span>
              </div>
              <div class="changes-list">
                <div
                  v-for="req in selectedComposition.labelRequirements"
                  :key="req.label"
                  class="change-item label-req"
                >
                  <div class="req-title">{{ req.count }}× {{ req.label }}</div>
                  <div class="change-reason">{{ req.reason }}</div>
                </div>
              </div>
            </div>

            <!-- Rating Changes (New/Modified teammates) -->
            <div v-if="compositionChanges.ratingChanges.length > 0" class="changes-section">
              <div class="section-label">
                <span class="label-icon">↑</span>
                <span>Teammate Changes</span>
              </div>
              <div class="changes-list">
                <div
                  v-for="change in compositionChanges.ratingChanges"
                  :key="change.characterId"
                  class="change-item rating-change"
                >
                  <div class="change-main">
                    <span class="char-name">{{ change.characterName }}</span>
                    <span class="role-badge">{{ change.role }}</span>
                    <span class="rating-transition">
                      <span v-if="change.fromRating" class="from-rating" :class="'rating-' + change.fromRating.toLowerCase()">{{ change.fromRating }}</span>
                      <span v-else class="from-rating new">NEW</span>
                      <span class="arrow">→</span>
                      <span class="to-rating" :class="'rating-' + change.toRating.toLowerCase()">{{ change.toRating }}</span>
                    </span>
                  </div>
                  <div v-if="change.reason" class="change-reason">{{ change.reason }}</div>
                </div>
              </div>
            </div>

            <!-- Excluded Characters -->
            <div v-if="compositionChanges.excludedCharacters.length > 0" class="changes-section">
              <div class="section-label">
                <span class="label-icon">✕</span>
                <span>Not Recommended</span>
              </div>
              <div class="changes-list">
                <div
                  v-for="excluded in compositionChanges.excludedCharacters"
                  :key="excluded.characterId"
                  class="change-item excluded"
                >
                  <span class="char-name">{{ excluded.characterName }}</span>
                  <span class="role-badge">{{ excluded.role }}</span>
                  <span class="excluded-label">Excluded in this playstyle</span>
                </div>
              </div>
            </div>

            <!-- Investment Notes -->
            <div v-if="selectedComposition.investmentNotes && selectedComposition.investmentNotes.length > 0" class="changes-section">
              <div class="section-label">
                <span class="label-icon">💎</span>
                <span>{{ character.name }} Investment for This Playstyle</span>
              </div>
              <div class="investment-notes-list">
                <div
                  v-for="(note, index) in selectedComposition.investmentNotes"
                  :key="index"
                  class="investment-note"
                >
                  {{ note }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Feedback Modal -->
    <ContextualFeedbackModal
      :is-open="showFeedbackModal"
      feedback-type="composition-missing"
      :context="feedbackContext"
      @close="closeFeedbackModal"
    />
  </div>
</template>

<style scoped>
/* ================================
   PLAYSTYLE SELECTOR - TACTICAL HUD
   ================================ */

.playstyle-selector {
  position: relative;
  margin-bottom: 1.5rem;
  padding: 1.5rem;
  background: linear-gradient(
    135deg,
    rgba(10, 10, 25, 0.95) 0%,
    rgba(15, 15, 40, 0.9) 50%,
    rgba(10, 10, 25, 0.95) 100%
  );
  border: 1px solid rgba(139, 92, 246, 0.25);
  border-radius: 1rem;
  overflow: hidden;
}

/* Corner Accents */
.corner-accent {
  position: absolute;
  width: 20px;
  height: 20px;
  border: 2px solid rgba(139, 92, 246, 0.4);
  pointer-events: none;
}

.corner-accent.top-left {
  top: 0;
  left: 0;
  border-right: none;
  border-bottom: none;
  border-top-left-radius: 0.75rem;
}

.corner-accent.top-right {
  top: 0;
  right: 0;
  border-left: none;
  border-bottom: none;
  border-top-right-radius: 0.75rem;
}

.corner-accent.bottom-left {
  bottom: 0;
  left: 0;
  border-right: none;
  border-top: none;
  border-bottom-left-radius: 0.75rem;
}

.corner-accent.bottom-right {
  bottom: 0;
  right: 0;
  border-left: none;
  border-top: none;
  border-bottom-right-radius: 0.75rem;
}

/* ============ HEADER ============ */

.selector-header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.25rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid rgba(139, 92, 246, 0.15);
}

.header-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 200px;
  height: 60px;
  background: radial-gradient(ellipse, rgba(139, 92, 246, 0.15) 0%, transparent 70%);
  pointer-events: none;
}

.header-content {
  display: flex;
  align-items: center;
  gap: 1rem;
  z-index: 1;
}

.header-icon {
  position: relative;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-hex {
  position: relative;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(99, 102, 241, 0.15) 100%);
  border: 1px solid rgba(139, 92, 246, 0.4);
  border-radius: 8px;
  transform: rotate(0deg);
}

.icon-symbol {
  font-size: 1.25rem;
  color: rgba(167, 139, 250, 0.9);
  text-shadow: 0 0 10px rgba(139, 92, 246, 0.5);
}

.icon-pulse {
  position: absolute;
  inset: -4px;
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: 10px;
  animation: icon-breathe 3s ease-in-out infinite;
}

@keyframes icon-breathe {
  0%, 100% { transform: scale(1); opacity: 0.5; }
  50% { transform: scale(1.15); opacity: 0; }
}

.header-text {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.header-label {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.label-line {
  width: 12px;
  height: 1px;
  background: linear-gradient(90deg, rgba(139, 92, 246, 0.6), transparent);
}

.label-line:last-child {
  background: linear-gradient(90deg, transparent, rgba(139, 92, 246, 0.6));
}

.label-text {
  font-family: var(--font-display);
  font-size: 0.875rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  color: rgba(167, 139, 250, 0.95);
  text-shadow: 0 0 20px rgba(139, 92, 246, 0.4);
}

.header-subtitle {
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.5);
  margin: 0;
}

.header-feedback {
  z-index: 1;
}

/* ============ PLAYSTYLE CARDS ============ */

.playstyle-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.875rem;
}

.playstyle-grid.two-items {
  grid-template-columns: repeat(2, 1fr);
  max-width: 500px;
}

.playstyle-grid.three-items {
  grid-template-columns: repeat(3, 1fr);
}

.playstyle-card {
  position: relative;
  padding: 1rem;
  background: transparent;
  border: none;
  border-radius: 0.75rem;
  cursor: pointer;
  text-align: left;
  overflow: visible;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  animation: card-enter 0.4s ease-out both;
  animation-delay: calc(var(--card-index) * 0.1s);
}

@keyframes card-enter {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.playstyle-card:hover {
  transform: translateY(-2px);
}

.playstyle-card:active {
  transform: translateY(0);
}

/* Card Background Layers */
.card-bg {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    135deg,
    rgba(30, 30, 60, 0.8) 0%,
    rgba(20, 20, 45, 0.9) 100%
  );
  border-radius: 0.75rem;
  transition: background 0.3s ease;
}

.playstyle-card:hover .card-bg {
  background: linear-gradient(
    135deg,
    rgba(45, 40, 80, 0.9) 0%,
    rgba(30, 25, 60, 0.95) 100%
  );
}

.playstyle-card.active .card-bg {
  background: linear-gradient(
    135deg,
    rgba(139, 92, 246, 0.15) 0%,
    rgba(99, 102, 241, 0.1) 50%,
    rgba(139, 92, 246, 0.15) 100%
  );
}

.card-glow {
  position: absolute;
  inset: 0;
  border-radius: 0.75rem;
  opacity: 0;
  background: radial-gradient(
    ellipse at center,
    rgba(139, 92, 246, 0.2) 0%,
    transparent 70%
  );
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.playstyle-card.active .card-glow {
  opacity: 1;
  animation: glow-pulse 2s ease-in-out infinite;
}

@keyframes glow-pulse {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 1; }
}

.card-border {
  position: absolute;
  inset: 0;
  border-radius: 0.75rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  transition: border-color 0.3s ease, box-shadow 0.3s ease;
  pointer-events: none;
}

.playstyle-card:hover .card-border {
  border-color: rgba(139, 92, 246, 0.3);
}

.playstyle-card.active .card-border {
  border-color: rgba(139, 92, 246, 0.5);
  box-shadow:
    0 0 20px rgba(139, 92, 246, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

/* Selection Indicator */
.selection-indicator {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
}

.indicator-ring {
  position: absolute;
  inset: 0;
  border: 2px solid rgba(255, 255, 255, 0.15);
  border-radius: 50%;
  transition: all 0.3s ease;
}

.playstyle-card.active .indicator-ring {
  border-color: rgba(139, 92, 246, 0.6);
  box-shadow: 0 0 10px rgba(139, 92, 246, 0.3);
}

.indicator-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: transparent;
  transition: all 0.3s ease;
}

.playstyle-card.active .indicator-dot {
  background: linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%);
  box-shadow: 0 0 8px rgba(139, 92, 246, 0.6);
}

/* Card Content */
.card-content {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.card-icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(139, 92, 246, 0.1);
  border: 1px solid rgba(139, 92, 246, 0.2);
  border-radius: 8px;
  font-size: 1.125rem;
  transition: all 0.3s ease;
}

.playstyle-card.active .card-icon {
  background: rgba(139, 92, 246, 0.2);
  border-color: rgba(139, 92, 246, 0.4);
  box-shadow: 0 0 15px rgba(139, 92, 246, 0.2);
}

.card-info {
  flex: 1;
  min-width: 0;
  padding-right: 1.5rem;
}

.card-name {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-family: var(--font-display);
  font-size: 0.9375rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
  transition: color 0.3s ease;
  line-height: 1.3;
}

.playstyle-card:hover .card-name {
  color: rgba(255, 255, 255, 0.9);
}

.playstyle-card.active .card-name {
  color: white;
  text-shadow: 0 0 20px rgba(139, 92, 246, 0.3);
}

/* Primary Badge - Bottom Right */
.primary-badge {
  position: absolute;
  bottom: 0.5rem;
  right: 0.5rem;
  font-size: 0.875rem;
  color: #fbbf24;
  text-shadow: 0 0 10px rgba(251, 191, 36, 0.5);
  z-index: 2;
  opacity: 0.8;
  transition: opacity 0.3s ease;
}

.playstyle-card:hover .primary-badge,
.playstyle-card.active .primary-badge {
  opacity: 1;
}

/* Active Edge Indicator */
.active-edge {
  position: absolute;
  top: 0.5rem;
  bottom: 0.5rem;
  left: 0;
  width: 3px;
  background: linear-gradient(180deg, #a78bfa 0%, #8b5cf6 50%, #a78bfa 100%);
  border-radius: 0 2px 2px 0;
  opacity: 0;
  transform: scaleY(0);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 3;
}

.playstyle-card.active .active-edge {
  opacity: 1;
  transform: scaleY(1);
  box-shadow: 0 0 12px rgba(139, 92, 246, 0.6);
}

/* ============ DETAILS SECTION ============ */

.playstyle-details {
  margin-top: 1.25rem;
  position: relative;
}

.details-connector {
  position: absolute;
  top: -1.25rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.connector-line {
  width: 1px;
  height: 1rem;
  background: linear-gradient(to bottom, transparent, rgba(139, 92, 246, 0.4));
}

.connector-dot {
  width: 6px;
  height: 6px;
  background: rgba(139, 92, 246, 0.6);
  border-radius: 50%;
  box-shadow: 0 0 8px rgba(139, 92, 246, 0.4);
}

.details-content {
  padding: 1.25rem;
  background: linear-gradient(
    135deg,
    rgba(139, 92, 246, 0.05) 0%,
    rgba(99, 102, 241, 0.03) 50%,
    rgba(139, 92, 246, 0.05) 100%
  );
  border: 1px solid rgba(139, 92, 246, 0.15);
  border-radius: 0.75rem;
}

.details-description {
  margin-bottom: 1rem;
}

.details-description p {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.7);
}

/* Impact Notice */
.impact-notice {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  background: linear-gradient(
    135deg,
    rgba(59, 130, 246, 0.08) 0%,
    rgba(99, 102, 241, 0.05) 100%
  );
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 0.5rem;
}

.notice-icon {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(59, 130, 246, 0.15);
  border-radius: 6px;
  font-size: 0.875rem;
}

.notice-content {
  flex: 1;
}

.notice-label {
  display: block;
  font-family: var(--font-display);
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: rgba(96, 165, 250, 0.9);
  margin-bottom: 0.25rem;
}

.notice-content p {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: rgba(147, 197, 253, 0.8);
}

/* Weak Modes Warning */
.weak-modes-warning {
  margin-top: 1rem;
  padding: 0.875rem 1rem;
  background: rgba(251, 146, 60, 0.06);
  border: 1px solid rgba(251, 146, 60, 0.2);
  border-radius: 0.5rem;
}

.warning-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.625rem;
}

.warning-icon {
  font-size: 0.875rem;
  color: rgba(251, 146, 60, 0.9);
}

.warning-label {
  font-family: var(--font-display);
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: rgba(251, 146, 60, 0.9);
}

.weak-modes-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.weak-mode-badge {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 0.75rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 0.375rem;
  border-left: 3px solid;
}

.weak-mode-badge.moc {
  border-left-color: #ef4444;
}

.weak-mode-badge.pf {
  border-left-color: #eab308;
}

.weak-mode-badge.as {
  border-left-color: #3b82f6;
}

.mode-name {
  font-family: var(--font-display);
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.8);
  min-width: 2rem;
}

.mode-reason {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.55);
}

/* ============ COMPOSITION CHANGES ============ */

.composition-changes {
  margin-top: 1rem;
  padding: 1rem;
  background: linear-gradient(
    135deg,
    rgba(139, 92, 246, 0.06) 0%,
    rgba(99, 102, 241, 0.03) 100%
  );
  border: 1px solid rgba(139, 92, 246, 0.2);
  border-radius: 0.5rem;
}

.changes-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.875rem;
  padding-bottom: 0.625rem;
  border-bottom: 1px solid rgba(139, 92, 246, 0.15);
}

.changes-icon {
  font-size: 0.875rem;
  color: rgba(167, 139, 250, 0.9);
}

.changes-label {
  font-family: var(--font-display);
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: rgba(167, 139, 250, 0.9);
}

.changes-section {
  margin-bottom: 0.875rem;
}

.changes-section:last-child {
  margin-bottom: 0;
}

.section-label {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-bottom: 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
}

.label-icon {
  font-size: 0.625rem;
  color: rgba(167, 139, 250, 0.8);
}

.changes-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.change-item {
  padding: 0.625rem 0.75rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 0.375rem;
  border-left: 3px solid rgba(139, 92, 246, 0.4);
}

.change-item.core {
  border-left-color: #fbbf24;
}

.change-item.path-req {
  border-left-color: #a78bfa;
}

.change-item.label-req {
  border-left-color: #60a5fa;
}

.change-item.rating-change {
  border-left-color: #34d399;
}

.change-item.excluded {
  border-left-color: #f87171;
  opacity: 0.8;
}

.change-main {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.core-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.char-name {
  font-weight: 600;
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.9);
}

.role-badge {
  font-size: 0.625rem;
  font-weight: 600;
  padding: 0.125rem 0.375rem;
  background: rgba(139, 92, 246, 0.2);
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: 0.25rem;
  color: rgba(167, 139, 250, 0.9);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.eidolon-badge {
  font-size: 0.625rem;
  font-weight: 700;
  padding: 0.125rem 0.375rem;
  background: rgba(251, 191, 36, 0.2);
  border: 1px solid rgba(251, 191, 36, 0.4);
  border-radius: 0.25rem;
  color: rgba(251, 191, 36, 0.95);
}

.req-title {
  font-weight: 600;
  font-size: 0.8125rem;
  color: rgba(167, 139, 250, 0.95);
  margin-bottom: 0.25rem;
}

.rating-transition {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-left: auto;
}

.from-rating,
.to-rating {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  min-width: 1.5rem;
  text-align: center;
}

.from-rating {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.5);
}

.from-rating.new {
  background: rgba(34, 197, 94, 0.15);
  color: rgba(74, 222, 128, 0.9);
  font-size: 0.625rem;
  letter-spacing: 0.05em;
}

.arrow {
  color: rgba(255, 255, 255, 0.4);
  font-size: 0.75rem;
}

.to-rating {
  background: rgba(139, 92, 246, 0.2);
  color: rgba(167, 139, 250, 0.95);
}

/* Rating colors */
.rating-s\+,
.rating-s {
  background: rgba(251, 191, 36, 0.2) !important;
  color: rgba(251, 191, 36, 0.95) !important;
}

.rating-a {
  background: rgba(139, 92, 246, 0.2) !important;
  color: rgba(167, 139, 250, 0.95) !important;
}

.rating-b {
  background: rgba(59, 130, 246, 0.2) !important;
  color: rgba(96, 165, 250, 0.95) !important;
}

.rating-c {
  background: rgba(34, 197, 94, 0.2) !important;
  color: rgba(74, 222, 128, 0.95) !important;
}

.rating-d {
  background: rgba(255, 255, 255, 0.1) !important;
  color: rgba(255, 255, 255, 0.6) !important;
}

.change-reason {
  font-size: 0.75rem;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.55);
  margin-top: 0.25rem;
}

.excluded-label {
  font-size: 0.6875rem;
  color: rgba(248, 113, 113, 0.8);
  font-style: italic;
  margin-left: auto;
}

.investment-notes-list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.investment-note {
  padding: 0.5rem 0.75rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 0.375rem;
  border-left: 3px solid rgba(251, 191, 36, 0.4);
  font-size: 0.75rem;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.65);
}

/* ============ TRANSITIONS ============ */

.details-expand-enter-active,
.details-expand-leave-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.details-expand-enter-from,
.details-expand-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* ============ RESPONSIVE ============ */

@media (max-width: 768px) {
  .playstyle-selector {
    padding: 1.25rem 1rem;
    margin-bottom: 1.25rem;
  }

  .selector-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .header-feedback {
    align-self: flex-end;
    margin-top: -2rem;
  }

  .playstyle-grid {
    grid-template-columns: 1fr;
  }

  .playstyle-grid.two-items,
  .playstyle-grid.three-items {
    grid-template-columns: 1fr;
    max-width: none;
  }

  .playstyle-card {
    padding: 0.875rem;
  }

  .card-icon {
    width: 32px;
    height: 32px;
    font-size: 1rem;
  }

  .card-name {
    font-size: 0.875rem;
  }

  .details-content {
    padding: 1rem;
  }

  .corner-accent {
    width: 14px;
    height: 14px;
  }

  .composition-changes {
    padding: 0.875rem;
  }

  .change-main {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.375rem;
  }

  .rating-transition {
    margin-left: 0;
  }

  .change-reason {
    margin-top: 0.375rem;
  }
}

@media (max-width: 480px) {
  .header-content {
    gap: 0.75rem;
  }

  .header-icon {
    width: 36px;
    height: 36px;
  }

  .icon-hex {
    width: 28px;
    height: 28px;
  }

  .icon-symbol {
    font-size: 1rem;
  }

  .label-text {
    font-size: 0.75rem;
    letter-spacing: 0.15em;
  }

  .header-subtitle {
    font-size: 0.75rem;
  }
}
</style>
