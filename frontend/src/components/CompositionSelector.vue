<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Character, TeamComposition, OwnershipStatus, BestTeam, TeammateRec, TeammateRating } from '../types';
import { hasCompositions, findTeammateRec } from '../utils/characterUtils';
import { getCharacterById } from '../data';
import CharacterCard from './CharacterCard.vue';
import FeedbackButton from './FeedbackButton.vue';
import ContextualFeedbackModal from './ContextualFeedbackModal.vue';
import type { FeedbackContext } from './ContextualFeedbackModal.vue';

// Types for role columns
interface RoleColumn {
  label: string;
  best: string | null;
  rating: TeammateRating | null; // Rating from this composition's perspective
  alts: string[];
}

// Alternative with rating info
interface AltWithRating {
  id: string;
  rating: TeammateRating;
}

// Types for grouped alternatives (spanning multiple columns)
interface RoleGroup {
  role: string;
  startIndex: number;
  span: number;
  alts: AltWithRating[]; // Now includes ratings
  ownedAlts: AltWithRating[]; // Owned characters not in best team or alts (C/D rated)
}

// Types for tracking composition changes
interface RatingChange {
  characterId: string;
  characterName: string;
  role: string;
  fromRating: TeammateRating | null;
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
  getOwnership: (id: string) => OwnershipStatus;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:selectedCompositionId': [id: string | null];
}>();

// Separate state: which composition has details expanded (independent of selection)
const expandedCompositionId = ref<string | null>(null);

// Check if character has compositions
const characterHasCompositions = computed(() => hasCompositions(props.character));

// Get all compositions for this character
const compositions = computed((): TeamComposition[] => {
  return props.character.compositions || [];
});

// Calculate what changed in this composition vs baseTeammates
function getCompositionChanges(comp: TeamComposition): CompositionChanges {
  const changes: CompositionChanges = {
    ratingChanges: [],
    excludedCharacters: [],
    hasAnyChanges: false,
  };

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

      if ('excluded' in override && override.excluded) {
        if (baseEntry) {
          changes.excludedCharacters.push({
            characterId: override.id,
            characterName: charName,
            role: roleLabel,
          });
        }
      } else if (override.rating) {
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
}

// Get best team for a composition (first S-rated, or first team)
function getBestTeam(comp: TeamComposition): BestTeam | null {
  const teams = comp.teams || [];
  return teams.find(t => t.rating === 'S') || teams[0] || null;
}

// Count owned characters in a team
function getOwnedCount(team: BestTeam | null): { owned: number; total: number } {
  if (!team) return { owned: 0, total: 0 };
  const owned = team.characters.filter(id => props.getOwnership(id) === 'owned').length;
  return { owned, total: team.characters.length };
}

// Helper to get the teammate list role from display role
function getRoleKey(displayRole: string): 'amplifiers' | 'sustains' | 'subDPS' | 'dps' | null {
  switch (displayRole) {
    case 'DPS': return 'dps';
    case 'SUB-DPS': return 'subDPS';
    case 'AMPLIFIER': return 'amplifiers';
    case 'SUSTAIN': return 'sustains';
    default: return null;
  }
}

// Helper to get S/A/B-rated alternatives for a role (sorted S first, then A, then B) - returns with ratings
function getAlternatives(
  role: 'amplifiers' | 'sustains' | 'subDPS' | 'dps',
  base: Partial<Record<'amplifiers' | 'sustains' | 'subDPS' | 'dps', TeammateRec[]>>,
  overrides: Partial<Record<string, unknown[]>>,
  excludeIds: string[],
  limit: number = 3
): AltWithRating[] {
  const baseList = base[role] || [];
  const overrideList = (overrides[role] || []) as Array<{ id: string; rating?: string; excluded?: boolean }>;

  // Merge: overrides take precedence
  const merged = new Map<string, TeammateRec>();
  for (const rec of baseList) {
    merged.set(rec.id, rec);
  }
  for (const rec of overrideList) {
    if (!rec.excluded) {
      if (rec.rating) {
        merged.set(rec.id, rec as TeammateRec);
      }
    } else {
      merged.delete(rec.id);
    }
  }

  // Filter to S, A, or B rated, exclude those already in best team, sort by rating
  const ratingOrder: Record<string, number> = { 'S': 0, 'A': 1, 'B': 2 };
  return Array.from(merged.values())
    .filter(rec => (rec.rating === 'S' || rec.rating === 'A' || rec.rating === 'B') && !excludeIds.includes(rec.id))
    .sort((a, b) => (ratingOrder[a.rating] ?? 99) - (ratingOrder[b.rating] ?? 99))
    .slice(0, limit)
    .map(rec => ({ id: rec.id, rating: rec.rating }));
}

// Helper to get owned characters that aren't shown in best team or alts
// Shows C/D rated characters that user owns but weren't included in top alts
function getOwnedAlternatives(
  role: 'amplifiers' | 'sustains' | 'subDPS' | 'dps',
  base: Partial<Record<'amplifiers' | 'sustains' | 'subDPS' | 'dps', TeammateRec[]>>,
  overrides: Partial<Record<string, unknown[]>>,
  excludeIds: string[], // IDs already shown (best team + alts)
  limit: number = 3
): AltWithRating[] {
  const baseList = base[role] || [];
  const overrideList = (overrides[role] || []) as Array<{ id: string; rating?: string; excluded?: boolean }>;

  // Merge: overrides take precedence
  const merged = new Map<string, TeammateRec>();
  for (const rec of baseList) {
    merged.set(rec.id, rec);
  }
  for (const rec of overrideList) {
    if (!rec.excluded) {
      if (rec.rating) {
        merged.set(rec.id, rec as TeammateRec);
      }
    } else {
      merged.delete(rec.id);
    }
  }

  // Get owned characters not already shown, sorted by rating
  const ratingOrder: Record<string, number> = { 'S': 0, 'A': 1, 'B': 2, 'C': 3, 'D': 4 };
  return Array.from(merged.values())
    .filter(rec => !excludeIds.includes(rec.id) && props.getOwnership(rec.id) === 'owned')
    .sort((a, b) => (ratingOrder[a.rating] ?? 99) - (ratingOrder[b.rating] ?? 99))
    .slice(0, limit)
    .map(rec => ({ id: rec.id, rating: rec.rating }));
}

// Get role columns for a composition (just best picks, no alts)
function getRoleColumns(comp: TeamComposition): RoleColumn[] {
  const bestTeam = getBestTeam(comp);
  if (!bestTeam) return [];

  const columns: RoleColumn[] = [];
  const teamChars = bestTeam.characters;

  // Determine structure from the best team
  const coreId = comp.core?.[0]?.characterId;
  const mainCharId = props.character.id;

  // Track role counts for DPS/SUB-DPS logic
  let dpsCount = 0;

  // Classify each team member
  teamChars.forEach((charId) => {
    const char = getCharacterById(charId);
    if (!char) return;

    let role = 'SLOT';

    if (coreId && charId === coreId) {
      role = 'CORE';
    } else if (charId === mainCharId) {
      // The viewed character - label by their actual role
      if (props.character.roles.includes('DPS') || props.character.roles.includes('Support DPS')) {
        role = 'DPS';
        dpsCount++;
      } else if (props.character.roles.includes('Sustain')) {
        role = 'SUSTAIN';
      } else if (props.character.roles.includes('Amplifier')) {
        role = 'AMPLIFIER';
      } else {
        role = 'DPS';
        dpsCount++;
      }
    } else if (char.roles.includes('DPS') || char.roles.includes('Support DPS')) {
      // Another DPS/Support DPS in the team
      role = dpsCount === 0 ? 'DPS' : 'SUB-DPS';
      dpsCount++;
    } else if (char.roles.includes('Sustain')) {
      role = 'SUSTAIN';
    } else if (char.roles.includes('Amplifier')) {
      role = 'AMPLIFIER';
    }

    // Get rating from this composition's perspective (null for main character)
    const isMainChar = charId === mainCharId;
    const rec = isMainChar ? null : findTeammateRec(props.character, charId, comp.id);

    columns.push({
      label: role,
      best: charId,
      rating: rec?.rating || null,
      alts: [] // No alts in columns anymore
    });
  });

  return columns;
}

// Get role groups with alternatives (for spanning display)
function getRoleGroups(comp: TeamComposition): RoleGroup[] {
  const columns = getRoleColumns(comp);
  if (columns.length === 0) return [];

  const bestTeam = getBestTeam(comp);
  if (!bestTeam) return [];

  const teamChars = bestTeam.characters;
  const mainCharId = props.character.id;

  // Get merged teammates (base + overrides)
  const base = props.character.baseTeammates || props.character.teammates || {};
  const overrides = comp.teammateOverrides || {};

  // Group consecutive columns by role
  const groups: RoleGroup[] = [];
  let currentGroup: RoleGroup | null = null;

  columns.forEach((col, index) => {
    const isMainChar = col.best === mainCharId;

    // Skip main character from grouping (no alternatives for yourself)
    if (isMainChar) {
      // Close current group if any
      if (currentGroup) {
        groups.push(currentGroup);
        currentGroup = null;
      }
      return;
    }

    // Check if this continues the current group
    if (currentGroup && currentGroup.role === col.label) {
      currentGroup.span++;
    } else {
      // Close previous group
      if (currentGroup) {
        groups.push(currentGroup);
      }
      // Start new group
      currentGroup = {
        role: col.label,
        startIndex: index,
        span: 1,
        alts: [],
        ownedAlts: []
      };
    }
  });

  // Close final group
  if (currentGroup) {
    groups.push(currentGroup);
  }

  // Now fill in alternatives for each group
  // For groups with multiple slots (span > 1), show more alternatives (up to span * 3)
  groups.forEach(group => {
    const roleKey = getRoleKey(group.role);
    if (roleKey) {
      const limit = Math.min(group.span * 3, 6); // Up to 6 for dual slots
      group.alts = getAlternatives(roleKey, base, overrides, teamChars, limit);

      // Get owned characters not shown in best team or alts
      const shownIds = [...teamChars, ...group.alts.map(a => a.id)];
      const ownedLimit = Math.min(group.span * 3, 6); // Same logic as main alts
      group.ownedAlts = getOwnedAlternatives(roleKey, base, overrides, shownIds, ownedLimit);
    }
  });

  return groups;
}

// Get core requirement summary
function getCoreSummary(comp: TeamComposition): string | null {
  if (!comp.core || comp.core.length === 0) return null;
  const coreItem = comp.core[0];
  if (!coreItem) return null;
  const char = getCharacterById(coreItem.characterId);
  const name = char?.name || coreItem.characterId;
  // Truncate reason to first sentence
  const reason = coreItem.reason?.split('.')[0] || '';
  return `${name} — ${reason}`;
}

// Get weak mode summary
function getWeakModeSummary(comp: TeamComposition): string | null {
  if (!comp.weakModes || comp.weakModes.length === 0) return null;
  const modes = comp.weakModes.map(wm => {
    const label = wm.mode.toUpperCase();
    return label;
  });
  return modes.join(', ');
}

// Check if composition has any weak modes
function hasAnyWeakModes(composition: TeamComposition | undefined): boolean {
  return (composition?.weakModes?.length ?? 0) > 0;
}

function selectComposition(id: string) {
  emit('update:selectedCompositionId', id);
}

function toggleDetails(id: string) {
  if (expandedCompositionId.value === id) {
    expandedCompositionId.value = null;
  } else {
    expandedCompositionId.value = id;
  }
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
    <!-- Header Section -->
    <div class="selector-header">
      <div class="header-content">
        <div class="header-icon">
          <span class="icon-symbol">⬡</span>
        </div>
        <div class="header-text">
          <span class="header-title">PLAYSTYLES</span>
          <span class="header-subtitle">Your selection shapes teammates and teams below</span>
        </div>
      </div>
      <FeedbackButton
        class="header-feedback"
        label="Missing?"
        tooltip="Report a missing playstyle"
        size="sm"
        @click="openCompositionFeedback"
      />
    </div>

    <!-- Composition Cards Stack -->
    <div class="compositions-stack">
      <div
        v-for="comp in compositions"
        :key="comp.id"
        class="composition-card"
        :class="{
          selected: selectedCompositionId === comp.id,
          expanded: expandedCompositionId === comp.id
        }"
        @click="selectComposition(comp.id)"
      >
        <!-- Card Header -->
        <div class="card-header">
          <div class="card-title-row">
            <span class="card-icon">{{ getPlaystyleIcon(comp) }}</span>
            <span class="card-name">{{ comp.name }}</span>
            <span v-if="comp.isPrimary" class="primary-badge">★ PRIMARY</span>
            <span v-if="selectedCompositionId === comp.id" class="active-badge">ACTIVE</span>
          </div>
        </div>

        <!-- Team Grid: CSS Grid with Best picks + Grouped Alternatives -->
        <div class="team-grid">
          <!-- Row 1: Role Labels -->
          <div
            v-for="(col, colIndex) in getRoleColumns(comp)"
            :key="'label-' + colIndex"
            class="role-label-cell"
            :style="{ gridColumn: colIndex + 1 }"
          >
            <span class="role-label">{{ col.label }}</span>
          </div>

          <!-- Row 2: Best Picks -->
          <div
            v-for="(col, colIndex) in getRoleColumns(comp)"
            :key="'best-' + colIndex"
            class="best-pick-cell"
            :class="{ 'has-role-separator': colIndex > 0 && col.label !== getRoleColumns(comp)[colIndex - 1]?.label }"
            :style="{ gridColumn: colIndex + 1 }"
          >
            <CharacterCard
              v-if="col.best && getCharacterById(col.best)"
              :character="getCharacterById(col.best)!"
              :ownership="getOwnership(col.best)"
              :synergy-rating="col.rating || undefined"
              size="xl"
              :show-ownership="true"
            />
          </div>

          <!-- Row 3: Alternatives (grouped and spanning) -->
          <template v-for="(group, groupIndex) in getRoleGroups(comp)" :key="'alts-' + group.role + '-' + group.startIndex">
            <div
              v-if="group.alts.length > 0 || group.ownedAlts.length > 0"
              class="alts-cell"
              :class="{ 'has-separator': groupIndex > 0 }"
              :style="{ gridColumn: `${group.startIndex + 1} / span ${group.span}` }"
            >
              <div class="alts-group">
                <span class="alts-label">{{ group.role }} ALTS</span>
                <div v-if="group.alts.length > 0" class="alts-row">
                  <template v-for="alt in group.alts" :key="alt.id">
                    <CharacterCard
                      v-if="getCharacterById(alt.id)"
                      :character="getCharacterById(alt.id)!"
                      :ownership="getOwnership(alt.id)"
                      :synergy-rating="alt.rating"
                      size="sm"
                      :show-ownership="true"
                      class="alt-portrait"
                    />
                  </template>
                </div>
                <!-- Owned alternatives not shown above -->
                <div v-if="group.ownedAlts.length > 0" class="owned-alts-section">
                  <span class="owned-alts-label">YOU HAVE</span>
                  <div class="owned-alts-row">
                    <template v-for="alt in group.ownedAlts" :key="'owned-' + alt.id">
                      <CharacterCard
                        v-if="getCharacterById(alt.id)"
                        :character="getCharacterById(alt.id)!"
                        :ownership="getOwnership(alt.id)"
                        :synergy-rating="alt.rating"
                        size="xs"
                        :show-ownership="false"
                        class="owned-alt-portrait"
                      />
                    </template>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- Rating + Ownership Summary (spans full width) -->
          <div class="team-summary" :style="{ gridColumn: '1 / -1' }">
            <div class="team-rating" :class="'rating-' + (getBestTeam(comp)?.rating?.toLowerCase() || 'b')">
              ★ {{ getBestTeam(comp)?.rating || '?' }}-tier
            </div>
            <div
              class="owned-count"
              :class="{ 'all-owned': getOwnedCount(getBestTeam(comp)).owned === 4 }"
            >
              {{ getOwnedCount(getBestTeam(comp)).owned }}/{{ getOwnedCount(getBestTeam(comp)).total }} owned
            </div>
          </div>
        </div>

        <!-- Core Summary + Weak Modes -->
        <div class="card-footer">
          <div v-if="getCoreSummary(comp)" class="core-summary">
            <span class="summary-label">CORE:</span>
            <span class="summary-text">{{ getCoreSummary(comp) }}</span>
          </div>
          <div class="footer-right">
            <div v-if="hasAnyWeakModes(comp)" class="weak-modes">
              <span class="weak-icon">⚠</span>
              <span class="weak-label">Weak:</span>
              <span class="weak-list">{{ getWeakModeSummary(comp) }}</span>
            </div>
            <button
              class="details-btn"
              @click.stop="toggleDetails(comp.id)"
            >
              {{ expandedCompositionId === comp.id ? 'HIDE DETAILS ▲' : 'SHOW DETAILS ▼' }}
            </button>
          </div>
        </div>

        <!-- Expanded Details Panel -->
        <Transition name="details-slide">
          <div v-if="expandedCompositionId === comp.id" class="details-panel" @click.stop>
            <!-- Description -->
            <div class="detail-section">
              <div class="detail-label">DESCRIPTION</div>
              <p class="detail-text">{{ comp.description }}</p>
            </div>

            <!-- Impact notice -->
            <div class="impact-notice">
              <div class="notice-icon">⚙️</div>
              <div class="notice-content">
                <span class="notice-label">ACTIVE CONFIGURATION</span>
                <p>Teammate recommendations, pre-built teams, and generated teams are tailored for this playstyle.</p>
              </div>
            </div>

            <!-- Weak Modes Warning -->
            <div v-if="hasAnyWeakModes(comp)" class="detail-section">
              <div class="detail-label">MODE LIMITATIONS</div>
              <div class="weak-modes-detail">
                <div
                  v-for="wm in comp.weakModes"
                  :key="wm.mode"
                  class="weak-mode-item"
                >
                  <span class="wm-badge" :class="wm.mode">{{ wm.mode.toUpperCase() }}</span>
                  <span class="wm-reason">{{ wm.reason }}</span>
                </div>
              </div>
            </div>

            <!-- Core Characters with full details -->
            <div v-if="comp.core && comp.core.length > 0" class="detail-section">
              <div class="detail-label">CORE CHARACTERS</div>
              <div class="core-list">
                <div
                  v-for="core in comp.core"
                  :key="core.characterId"
                  class="core-item"
                >
                  <div class="core-header-row">
                    <span class="core-name">{{ getCharacterById(core.characterId)?.name || core.characterId }}</span>
                    <span v-if="core.minEidolon" class="core-eidolon">E{{ core.minEidolon }}+</span>
                  </div>
                  <p class="core-reason">{{ core.reason }}</p>
                </div>
              </div>
            </div>

            <!-- Path Requirements -->
            <div v-if="comp.pathRequirements && comp.pathRequirements.length > 0" class="detail-section">
              <div class="detail-label">PATH REQUIREMENTS</div>
              <div class="requirements-list">
                <div
                  v-for="req in comp.pathRequirements"
                  :key="req.path"
                  class="requirement-item"
                >
                  <span class="req-title">{{ req.count }}× {{ req.path }}</span>
                  <span class="req-reason">{{ req.reason }}</span>
                </div>
              </div>
            </div>

            <!-- Label Requirements -->
            <div v-if="comp.labelRequirements && comp.labelRequirements.length > 0" class="detail-section">
              <div class="detail-label">LABEL REQUIREMENTS</div>
              <div class="requirements-list">
                <div
                  v-for="req in comp.labelRequirements"
                  :key="req.label"
                  class="requirement-item"
                >
                  <span class="req-title">{{ req.count }}× {{ req.label }}</span>
                  <span class="req-reason">{{ req.reason }}</span>
                </div>
              </div>
            </div>

            <!-- Rating Changes -->
            <div v-if="getCompositionChanges(comp).ratingChanges.length > 0" class="detail-section">
              <div class="detail-label">TEAMMATE CHANGES</div>
              <div class="changes-list">
                <div
                  v-for="change in getCompositionChanges(comp).ratingChanges"
                  :key="change.characterId"
                  class="change-item"
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
                  <p v-if="change.reason" class="change-reason">{{ change.reason }}</p>
                </div>
              </div>
            </div>

            <!-- Excluded Characters -->
            <div v-if="getCompositionChanges(comp).excludedCharacters.length > 0" class="detail-section">
              <div class="detail-label">NOT RECOMMENDED</div>
              <div class="excluded-list">
                <div
                  v-for="excluded in getCompositionChanges(comp).excludedCharacters"
                  :key="excluded.characterId"
                  class="excluded-item"
                >
                  <span class="char-name">{{ excluded.characterName }}</span>
                  <span class="role-badge">{{ excluded.role }}</span>
                  <span class="excluded-label">Excluded in this playstyle</span>
                </div>
              </div>
            </div>

            <!-- Investment Notes -->
            <div v-if="comp.investmentNotes && comp.investmentNotes.length > 0" class="detail-section">
              <div class="detail-label">INVESTMENT NOTES</div>
              <ul class="notes-list">
                <li v-for="(note, idx) in comp.investmentNotes" :key="idx">{{ note }}</li>
              </ul>
            </div>
          </div>
        </Transition>
      </div>
    </div>

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
   PLAYSTYLE SELECTOR - CARD DESIGN
   ================================ */

.playstyle-selector {
  margin-bottom: 1.5rem;
}

/* Header */
.selector-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.25rem;
  padding: 1rem;
  background: rgba(139, 92, 246, 0.08);
  border: 1px solid rgba(139, 92, 246, 0.2);
  border-radius: 0.75rem;
}

.header-content {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.header-icon {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(139, 92, 246, 0.2);
  border: 1px solid rgba(139, 92, 246, 0.4);
  border-radius: 10px;
  box-shadow: 0 0 12px rgba(139, 92, 246, 0.2);
}

.icon-symbol {
  font-size: 1.375rem;
  color: rgba(167, 139, 250, 1);
}

.header-text {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.header-title {
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: rgba(167, 139, 250, 1);
}

.header-subtitle {
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.7);
  font-weight: 500;
}

/* Compositions Stack */
.compositions-stack {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* Composition Card */
.composition-card {
  position: relative;
  padding: 1.25rem;
  background: linear-gradient(135deg, rgba(15, 15, 35, 0.95) 0%, rgba(20, 18, 40, 0.9) 100%);
  border: 1px solid rgba(139, 92, 246, 0.2);
  border-radius: 1rem;
  transition: all 0.3s ease;
  cursor: pointer;
}

.composition-card:hover {
  border-color: rgba(139, 92, 246, 0.35);
  background: linear-gradient(135deg, rgba(20, 18, 45, 0.95) 0%, rgba(25, 22, 50, 0.9) 100%);
}

.composition-card.selected {
  border-color: rgba(139, 92, 246, 0.6);
  box-shadow: 0 0 20px rgba(139, 92, 246, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  background: linear-gradient(135deg, rgba(25, 22, 50, 0.95) 0%, rgba(30, 25, 55, 0.9) 100%);
}

/* Card Header */
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.card-title-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.card-icon {
  font-size: 1.25rem;
}

.card-name {
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
}

.primary-badge {
  font-size: 0.625rem;
  font-weight: 700;
  padding: 0.1875rem 0.5rem;
  background: rgba(251, 191, 36, 0.15);
  border: 1px solid rgba(251, 191, 36, 0.35);
  border-radius: 0.25rem;
  color: rgba(251, 191, 36, 0.95);
  letter-spacing: 0.05em;
}

.active-badge {
  font-size: 0.625rem;
  font-weight: 700;
  padding: 0.1875rem 0.5rem;
  background: rgba(34, 197, 94, 0.15);
  border: 1px solid rgba(34, 197, 94, 0.35);
  border-radius: 0.25rem;
  color: rgba(74, 222, 128, 0.95);
  letter-spacing: 0.05em;
}

.select-btn {
  font-family: var(--font-display);
  font-size: 0.6875rem;
  font-weight: 700;
  padding: 0.375rem 0.875rem;
  background: rgba(139, 92, 246, 0.2);
  border: 1px solid rgba(139, 92, 246, 0.4);
  border-radius: 0.375rem;
  color: rgba(167, 139, 250, 0.95);
  cursor: pointer;
  transition: all 0.2s ease;
  letter-spacing: 0.05em;
}

.select-btn:hover {
  background: rgba(139, 92, 246, 0.35);
  border-color: rgba(139, 92, 246, 0.6);
  color: white;
}

/* Team Grid - CSS Grid Layout */
.team-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.5rem 0.75rem;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 0.75rem;
  margin-bottom: 1rem;
  overflow: hidden;
}

/* Row 1: Role Labels */
.role-label-cell {
  display: flex;
  justify-content: center;
  align-items: center;
  grid-row: 1;
}

.role-label {
  font-family: var(--font-display);
  font-size: 0.5625rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: rgba(139, 92, 246, 0.7);
  text-transform: uppercase;
  text-align: center;
}

/* Row 2: Best Picks */
.best-pick-cell {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  grid-row: 2;
  padding: 0.25rem;
  position: relative;
  min-width: 0; /* Allow shrinking below content size */
}

/* Ensure CharacterCard scales down on narrow screens but doesn't grow beyond original size */
.best-pick-cell :deep(.character-card-wrapper) {
  max-width: 88px; /* xl size cap */
  width: 100%;
  height: auto;
  aspect-ratio: 1;
}

.best-pick-cell.has-role-separator::before {
  content: '';
  position: absolute;
  left: -0.375rem;
  top: 50%;
  transform: translateY(-50%);
  width: 1px;
  height: 80%;
  background: linear-gradient(
    to bottom,
    transparent,
    rgba(139, 92, 246, 0.35),
    transparent
  );
}

/* Row 3: Alternatives (can span multiple columns) */
.alts-cell {
  grid-row: 3;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 0.375rem 0.5rem;
  position: relative;
}

.alts-cell.has-separator::before {
  content: '';
  position: absolute;
  left: -0.375rem;
  top: 50%;
  transform: translateY(-50%);
  width: 1px;
  height: 70%;
  background: linear-gradient(
    to bottom,
    transparent,
    rgba(139, 92, 246, 0.4),
    transparent
  );
}

.alts-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}

.alts-label {
  font-family: var(--font-display);
  font-size: 0.5rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: rgba(139, 92, 246, 0.5);
  text-transform: uppercase;
}

.alts-row {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.25rem;
  min-height: 32px;
}

.alt-portrait {
  opacity: 0.8;
  transition: opacity 0.2s ease;
}

.alt-portrait:hover {
  opacity: 1;
}

/* Owned Alternatives Section - "You have" row */
.owned-alts-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px dashed rgba(74, 222, 128, 0.2);
  position: relative;
  z-index: 1;
}

.owned-alts-label {
  font-family: var(--font-display);
  font-size: 0.4375rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: rgba(74, 222, 128, 0.6);
  text-transform: uppercase;
}

.owned-alts-row {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.1875rem;
}

.owned-alt-portrait {
  opacity: 0.7;
  transition: opacity 0.2s ease;
}

.owned-alt-portrait:hover {
  opacity: 1;
}

/* Team Summary - spans full width */
.team-summary {
  grid-row: 4;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid rgba(139, 92, 246, 0.15);
  margin-top: 0.25rem;
}

.team-rating {
  font-family: var(--font-display);
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.25rem 0.625rem;
  border-radius: 0.375rem;
  letter-spacing: 0.02em;
}

.team-rating.rating-s {
  background: rgba(251, 191, 36, 0.2);
  color: rgba(251, 191, 36, 0.95);
  border: 1px solid rgba(251, 191, 36, 0.3);
}

.team-rating.rating-a {
  background: rgba(139, 92, 246, 0.2);
  color: rgba(167, 139, 250, 0.95);
  border: 1px solid rgba(139, 92, 246, 0.3);
}

.team-rating.rating-b {
  background: rgba(59, 130, 246, 0.2);
  color: rgba(96, 165, 250, 0.95);
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.owned-count {
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
}

.owned-count.all-owned {
  color: rgba(74, 222, 128, 0.9);
}

/* Card Footer */
.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.core-summary {
  display: flex;
  align-items: baseline;
  gap: 0.375rem;
  flex: 1;
  min-width: 200px;
}

.summary-label {
  font-size: 0.625rem;
  font-weight: 700;
  color: rgba(251, 191, 36, 0.8);
  letter-spacing: 0.05em;
}

.summary-text {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
  line-height: 1.4;
}

.footer-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.weak-modes {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  background: rgba(251, 146, 60, 0.1);
  border: 1px solid rgba(251, 146, 60, 0.2);
  border-radius: 0.25rem;
}

.weak-icon {
  font-size: 0.75rem;
  color: rgba(251, 146, 60, 0.9);
}

.weak-label {
  font-size: 0.625rem;
  font-weight: 600;
  color: rgba(251, 146, 60, 0.8);
}

.weak-list {
  font-size: 0.625rem;
  font-weight: 700;
  color: rgba(251, 146, 60, 0.95);
}

.details-btn {
  font-family: var(--font-display);
  font-size: 0.625rem;
  font-weight: 600;
  padding: 0.375rem 0.625rem;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 0.25rem;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: all 0.2s ease;
  letter-spacing: 0.03em;
}

.details-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.25);
  color: rgba(255, 255, 255, 0.8);
}

/* Details Panel */
.details-panel {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(139, 92, 246, 0.15);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.detail-label {
  font-family: var(--font-display);
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: rgba(139, 92, 246, 0.7);
}

.detail-text {
  font-size: 0.8125rem;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.7);
  margin: 0;
}

.core-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.core-item {
  padding: 0.625rem 0.75rem;
  background: rgba(251, 191, 36, 0.05);
  border-left: 3px solid rgba(251, 191, 36, 0.4);
  border-radius: 0 0.25rem 0.25rem 0;
}

.core-name {
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.8125rem;
}

.core-eidolon {
  font-size: 0.625rem;
  font-weight: 700;
  padding: 0.125rem 0.375rem;
  background: rgba(251, 191, 36, 0.2);
  border-radius: 0.25rem;
  color: rgba(251, 191, 36, 0.95);
  margin-left: 0.5rem;
}

.core-reason {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.55);
  margin: 0.25rem 0 0 0;
  line-height: 1.5;
}

.notes-list {
  margin: 0;
  padding-left: 1.25rem;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
  line-height: 1.6;
}

.notes-list li {
  margin-bottom: 0.25rem;
}

/* Impact Notice */
.impact-notice {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(99, 102, 241, 0.05) 100%);
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

.weak-modes-detail {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.weak-mode-item {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 0.75rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 0.375rem;
  border-left: 3px solid;
}

.weak-mode-item .wm-badge.moc {
  border-left-color: #ef4444;
}

.weak-mode-item .wm-badge.pf {
  border-left-color: #eab308;
}

.weak-mode-item .wm-badge.as {
  border-left-color: #3b82f6;
}

.wm-badge {
  font-family: var(--font-display);
  font-size: 0.6875rem;
  font-weight: 700;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  letter-spacing: 0.05em;
  min-width: 2rem;
  text-align: center;
}

.wm-badge.moc {
  background: rgba(239, 68, 68, 0.2);
  color: rgba(252, 165, 165, 0.95);
}

.wm-badge.pf {
  background: rgba(234, 179, 8, 0.2);
  color: rgba(253, 224, 71, 0.95);
}

.wm-badge.as {
  background: rgba(59, 130, 246, 0.2);
  color: rgba(147, 197, 253, 0.95);
}

.wm-reason {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.55);
}

.core-header-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

/* Requirements Lists */
.requirements-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.requirement-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.625rem 0.75rem;
  background: rgba(0, 0, 0, 0.2);
  border-left: 3px solid rgba(167, 139, 250, 0.4);
  border-radius: 0 0.25rem 0.25rem 0;
}

.req-title {
  font-weight: 600;
  font-size: 0.8125rem;
  color: rgba(167, 139, 250, 0.95);
}

.req-reason {
  font-size: 0.75rem;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.55);
}

/* Teammate Changes */
.changes-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.change-item {
  padding: 0.625rem 0.75rem;
  background: rgba(0, 0, 0, 0.2);
  border-left: 3px solid rgba(34, 197, 94, 0.4);
  border-radius: 0 0.25rem 0.25rem 0;
}

.change-main {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
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
.rating-s,
.rating-s\+ {
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
  margin: 0;
}

/* Excluded Characters */
.excluded-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.excluded-item {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem;
  background: rgba(0, 0, 0, 0.2);
  border-left: 3px solid rgba(248, 113, 113, 0.4);
  border-radius: 0 0.25rem 0.25rem 0;
  opacity: 0.8;
}

.excluded-label {
  font-size: 0.6875rem;
  color: rgba(248, 113, 113, 0.8);
  font-style: italic;
  margin-left: auto;
}

/* Transitions */
.details-slide-enter-active,
.details-slide-leave-active {
  transition: all 0.3s ease;
}

.details-slide-enter-from,
.details-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* Responsive */
@media (max-width: 640px) {
  .composition-card {
    padding: 1rem;
  }

  .team-grid {
    padding: 0.5rem;
    gap: 0.25rem 0.375rem;
  }

  .best-pick-cell {
    padding: 0.125rem;
  }

  /* Tighter sizing for best picks on mobile */
  .best-pick-cell :deep(.character-card-wrapper) {
    max-width: 100%;
  }

  .alts-cell {
    padding: 0.125rem;
  }

  .alts-row {
    gap: 0.125rem;
  }

  /* Smaller alt portraits on mobile */
  .alts-row :deep(.character-card-wrapper) {
    max-width: 48px;
  }

  .card-footer {
    flex-direction: column;
    align-items: flex-start;
  }

  .footer-right {
    width: 100%;
    justify-content: space-between;
  }

  .core-summary {
    min-width: 100%;
  }

  .role-label {
    font-size: 0.5rem;
  }

  .alts-label {
    font-size: 0.4375rem;
  }

  .owned-alts-section {
    margin-top: 0.375rem;
    padding-top: 0.375rem;
  }

  .owned-alts-label {
    font-size: 0.375rem;
  }

  .owned-alts-row {
    gap: 0.125rem;
  }

  .owned-alts-row :deep(.character-card-wrapper) {
    max-width: 36px;
  }
}

/* Extra small screens (< 400px) */
@media (max-width: 400px) {
  .team-grid {
    padding: 0.375rem;
    gap: 0.125rem 0.25rem;
  }

  .best-pick-cell :deep(.character-card-wrapper) {
    max-width: 72px;
  }

  .alts-row :deep(.character-card-wrapper) {
    max-width: 40px;
  }

  .owned-alts-row :deep(.character-card-wrapper) {
    max-width: 32px;
  }
}
</style>
