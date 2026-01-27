<script setup lang="ts">
import { computed } from 'vue';
import type { Character, BestTeam, OwnershipStatus, TierRating, GranularRating, UserCharacterInvestment } from '../types';
import type { GeneratedTeam, CharacterContribution, ModeTeamRating } from '../utils/teamGenerator';
import { calculateAllModeRatings } from '../utils/teamGenerator';
import { getCharacterById } from '../data';
import { getTeammatesForComposition } from '../utils/characterUtils';
import { getEffectiveScore, scoreToTier } from '../utils/scaleConverters';
import { getSignatureSuperimposition } from '../utils/investmentUtils';
import CharacterCard from './CharacterCard.vue';
import TeamSynergies from './TeamSynergies.vue';

// ==================
// PROPS - Accepts either BestTeam or GeneratedTeam
// ==================

interface Props {
  // For BestTeam (pre-built teams from character data)
  bestTeam?: BestTeam;
  // For GeneratedTeam (auto-generated teams)
  generatedTeam?: GeneratedTeam;
  // Common props
  getOwnership: (id: string) => OwnershipStatus;
  getInvestment?: (id: string) => UserCharacterInvestment | undefined;
  focalCharacterId?: string;
  // Game mode for tier display (optional - uses averaged tier if not provided)
  gameMode?: 'moc' | 'pf' | 'as';
  // Composition ID (for composition-aware ratings)
  compositionId?: string;
}

const props = withDefaults(defineProps<Props>(), {
  focalCharacterId: '',
});

// ==================
// NORMALIZE DATA - Convert both types to common format
// ==================

// Get team characters (resolving IDs for BestTeam)
const teamCharacters = computed((): Character[] => {
  if (props.generatedTeam) {
    return props.generatedTeam.characters;
  }
  if (props.bestTeam) {
    return props.bestTeam.characters
      .map(id => getCharacterById(id))
      .filter((c): c is Character => c !== undefined);
  }
  return [];
});

// Get team name
const teamName = computed(() => {
  if (props.generatedTeam) {
    return props.generatedTeam.name || `${props.generatedTeam.structure} Team`;
  }
  if (props.bestTeam) {
    return props.bestTeam.name;
  }
  return 'Team';
});

// Get team structure
const teamStructure = computed(() => {
  if (props.generatedTeam) {
    return props.generatedTeam.structure;
  }
  if (props.bestTeam) {
    return props.bestTeam.structure;
  }
  return 'hypercarry';
});

// Get team roles
const teamRoles = computed(() => {
  if (props.generatedTeam?.roles) {
    return props.generatedTeam.roles;
  }
  // For BestTeam, infer roles from character data
  return teamCharacters.value.map(c => c.roles[0] || 'DPS');
});

// Get synergy rating for a character in the team (returns granular rating)
const getSynergyRating = (charId: string): GranularRating | undefined => {
  // For GeneratedTeam, get from contributions (already granular)
  if (props.generatedTeam?.contributions) {
    const contrib = props.generatedTeam.contributions.find(c => c.characterId === charId);
    return contrib?.rating;
  }

  // For BestTeam, look up from the focal character's teammates data
  if (props.bestTeam && props.focalCharacterId) {
    const focalChar = getCharacterById(props.focalCharacterId);
    if (focalChar) {
      // Use composition-aware teammate lookup with compositionId
      const teammates = getTeammatesForComposition(focalChar, props.compositionId);
      // Search all teammate categories
      const allTeammates = [
        ...(teammates.amplifiers || []),
        ...(teammates.sustains || []),
        ...(teammates.subDPS || []),
        ...(teammates.dps || []),
      ];
      const teammate = allTeammates.find(t => t.id === charId);
      return teammate?.rating;
    }
  }

  return undefined;
};

// Get eidolon level for display
// For BestTeam: show composition-required eidolons
// For GeneratedTeam: show user's actual eidolons (only if owned and E1+)
const getEidolonLevel = (charId: string): number | undefined => {
  // For BestTeam: look up composition eidolon requirements
  if (props.bestTeam && props.focalCharacterId && props.compositionId) {
    const focalChar = getCharacterById(props.focalCharacterId);
    if (focalChar) {
      const teammates = getTeammatesForComposition(focalChar, props.compositionId);
      const allTeammates = [
        ...(teammates.amplifiers || []),
        ...(teammates.sustains || []),
        ...(teammates.subDPS || []),
        ...(teammates.dps || []),
      ];
      const teammate = allTeammates.find(t => t.id === charId);
      if (teammate?.theirInvestmentModifiers) {
        // Find most significant eidolon requirement
        const mostSignificant = teammate.theirInvestmentModifiers
          .filter((mod: { level: number; modifier: number; reason?: string }) => mod.modifier !== 0)
          .sort((a: { modifier: number }, b: { modifier: number }) => Math.abs(b.modifier) - Math.abs(a.modifier))[0];
        return mostSignificant?.level;
      }
    }
  }

  // For GeneratedTeam: show user's actual eidolons (owned + E1+)
  if (props.generatedTeam && props.getInvestment) {
    const investment = props.getInvestment(charId);
    if (!investment || investment.ownership !== 'owned') return undefined;
    return investment.eidolonLevel > 0 ? investment.eidolonLevel : undefined;
  }

  return undefined;
};

// Get investment-adjusted tier for a character (ONLY for generated teams)
const getAdjustedTier = (charId: string): TierRating | undefined => {
  // Only calculate for generated teams, NOT pre-built teams
  if (!props.generatedTeam || !props.getInvestment || !props.gameMode) return undefined;

  const char = getCharacterById(charId);
  if (!char) return undefined;

  const investment = props.getInvestment(charId);
  if (!investment) return undefined;

  const score = getEffectiveScore(char, props.gameMode, investment);
  return scoreToTier(score);
};

// Get signature LC superimposition (ONLY for generated teams, owned characters)
const getSignatureSuperimpositionLevel = (charId: string): 1 | 2 | 3 | 4 | 5 | undefined => {
  if (!props.generatedTeam || !props.getInvestment) return undefined;

  const investment = props.getInvestment(charId);
  if (!investment || investment.ownership !== 'owned') return undefined;

  const char = getCharacterById(charId);
  if (!char) return undefined;

  return getSignatureSuperimposition(char, investment);
};

// Get mode ratings (recalculate with investment ONLY for generated teams, not pre-built teams)
const modeRatings = computed((): ModeTeamRating[] => {
  if (teamCharacters.value.length === 4) {
    // Only use investment for generated teams - pre-built teams should use base tier
    const investmentGetter = props.generatedTeam && props.getInvestment
      ? (id: string) => props.getInvestment!(id) ?? undefined
      : undefined;
    return calculateAllModeRatings(teamCharacters.value, investmentGetter);
  }
  return [];
});

// Get breakdown for synergies
const teamBreakdown = computed(() => {
  if (props.generatedTeam?.breakdown) {
    return props.generatedTeam.breakdown;
  }
  return [];
});

// Get key synergies
const keySynergies = computed(() => {
  if (props.generatedTeam?.keySynergies) {
    return props.generatedTeam.keySynergies;
  }
  return [];
});

// ==================
// STYLING
// ==================

const elementColors: Record<string, string> = {
  Physical: '#c4c4c4',
  Fire: '#f4634e',
  Ice: '#47c7fd',
  Lightning: '#d376f0',
  Wind: '#5fe8b6',
  Quantum: '#625afa',
  Imaginary: '#f3d86b',
};

// Role icons
const roleIcons: Record<string, string> = {
  'DPS': '⚔',
  'Main DPS': '⚔',
  'Support DPS': '🗡',
  'Amplifier': '✨',
  'Sustain': '💚',
};

// Structure label
const structureLabel = computed(() => {
  const labels: Record<string, { name: string; description: string }> = {
    'hypercarry': { name: 'Hypercarry', description: 'Focus all resources on one DPS' },
    'dual-carry': { name: 'Dual Carry', description: 'Two damage dealers sharing buffs' },
    'triple-carry': { name: 'Triple Carry', description: 'Three damage sources' },
    'super-break': { name: 'Super Break', description: 'Break damage focused' },
    'break-focused': { name: 'Break Focused', description: 'Break damage focused' },
    'dot': { name: 'DoT Stack', description: 'Damage over time stacking' },
    'follow-up': { name: 'Follow-up', description: 'Follow-up attack synergy' },
    'memosprite': { name: 'Memosprite', description: 'Memosprite summon synergy' },
  };
  const defaultLabel = { name: teamStructure.value, description: 'Team composition' };
  return labels[teamStructure.value] || defaultLabel;
});


// Convert to CharacterContribution for TeamSynergies
const synergyContributions = computed<CharacterContribution[]>(() => {
  if (props.generatedTeam?.contributions) {
    return props.generatedTeam.contributions.map(c => ({
      characterId: c.characterId,
      characterName: c.characterName,
      role: c.role || 'Support',
      contribution: c.reason || '',
      reason: c.reason || '',
      rating: c.rating,
    }));
  }
  // For BestTeam, create basic contributions from character data
  return teamCharacters.value.map(c => ({
    characterId: c.id,
    characterName: c.name,
    role: c.roles[0] || 'Support',
    contribution: c.description || '',
    reason: c.description || '',
  }));
});

// Mode ratings with tier gradient mapping
const tierGradients: Record<TierRating, string> = {
  'T-1': 'linear-gradient(135deg, #ff4500 0%, #ff2200 100%)',
  'T-0.5': 'linear-gradient(135deg, #ff7700 0%, #ff5500 100%)',
  'T0': 'linear-gradient(135deg, #ff9500 0%, #ff6b00 100%)',
  'T0.5': 'linear-gradient(135deg, #ffd000 0%, #ffb800 100%)',
  'T1': 'linear-gradient(135deg, #a855f7 0%, #8b5cf6 100%)',
  'T1.5': 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
  'T2': 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
  'T3': 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
  'T4': 'linear-gradient(135deg, #64748b 0%, #475569 100%)',
  'T5': 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
};

const getTierGradient = (tier: TierRating): string => {
  return tierGradients[tier] || tierGradients['T5'];
};

const modeShortLabels: Record<string, string> = {
  moc: 'MoC',
  pf: 'PF',
  as: 'AS',
};
</script>

<template>
  <div class="team-detail">
    <!-- Header Section -->
    <div class="detail-header">
      <!-- Team Info -->
      <div class="header-info">
        <h2 class="team-title">{{ teamName }}</h2>

        <!-- Structure Badge -->
        <div class="structure-info">
          <span class="structure-name">{{ structureLabel.name }}</span>
          <span class="structure-desc">{{ structureLabel.description }}</span>
        </div>
      </div>

      <!-- Mode Ratings -->
      <div v-if="modeRatings.length > 0" class="mode-ratings">
        <div
          v-for="modeRating in modeRatings"
          :key="modeRating.mode"
          class="mode-rating-badge"
          :title="modeRating.label"
        >
          <span class="mode-label">{{ modeShortLabels[modeRating.mode] }}</span>
          <span
            class="mode-tier"
            :style="{ background: getTierGradient(modeRating.tier) }"
          >{{ modeRating.tier }}</span>
        </div>
      </div>
    </div>

    <!-- Team Formation Grid -->
    <div class="formation-section">
      <div class="formation-grid">
        <div
          v-for="(char, index) in teamCharacters"
          :key="char.id"
          class="member-card"
          :class="{ focal: char.id === focalCharacterId }"
          :style="{ '--member-delay': `${index * 0.1}s` }"
        >
          <!-- Focal Indicator -->
          <div v-if="char.id === focalCharacterId" class="focal-indicator">
            <span>★</span>
          </div>

          <!-- Role Label -->
          <div class="member-role">
            <span class="role-icon">{{ roleIcons[teamRoles[index] || 'DPS'] || '✨' }}</span>
            <span class="role-text">{{ teamRoles[index] || 'DPS' }}</span>
          </div>

          <!-- Character Portrait -->
          <div class="member-portrait">
            <CharacterCard
              :character="char"
              :ownership="getOwnership(char.id)"
              size="md"
              :show-tier="true"
              :synergy-rating="getSynergyRating(char.id)"
              :game-mode="gameMode"
              :eidolon="getEidolonLevel(char.id)"
              :signature-superimposition="getSignatureSuperimpositionLevel(char.id)"
              :override-tier="getAdjustedTier(char.id)"
            />

            <!-- Element Glow -->
            <div
              class="element-glow"
              :style="{ background: `radial-gradient(circle, ${elementColors[char.element]}40, transparent 70%)` }"
            ></div>
          </div>

          <!-- Character Info -->
          <div class="member-info">
            <div class="member-name">{{ char.name }}</div>
            <div class="member-element">
              <span
                class="element-badge"
                :style="{
                  backgroundColor: `${elementColors[char.element]}20`,
                  color: elementColors[char.element],
                  borderColor: `${elementColors[char.element]}40`
                }"
              >
                {{ char.element }}
              </span>
              <span class="path-text">{{ char.path }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Team Synergies Section -->
    <div class="synergies-section">
      <TeamSynergies
        :team="teamCharacters"
        :breakdowns="teamBreakdown"
        :roles="teamRoles"
        :contributions="synergyContributions"
        :key-synergies="keySynergies"
      />
    </div>
  </div>
</template>

<style scoped>
.team-detail {
  background: linear-gradient(145deg, rgba(18, 18, 38, 0.7) 0%, rgba(12, 12, 28, 0.85) 100%);
  backdrop-filter: blur(20px);
  border-radius: 1.5rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 1.5rem;
  animation: detail-enter 0.5s ease-out;
}

@keyframes detail-enter {
  from {
    opacity: 0;
    transform: scale(0.98) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* === Header === */
.detail-header {
  display: flex;
  align-items: flex-start;
  gap: 1.25rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.header-info {
  flex: 1;
  min-width: 0;
}

.team-title {
  font-family: var(--font-display, system-ui);
  font-size: 1.25rem;
  font-weight: 700;
  color: white;
  margin: 0 0 0.25rem 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.team-description {
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.5);
  margin: 0 0 0.75rem 0;
}

.structure-info {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  flex-wrap: wrap;
}

.structure-name {
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 0.3125rem 0.625rem;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.7);
}

.structure-desc {
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.4);
}

/* === Mode Ratings === */
.mode-ratings {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin-left: auto;
  padding-left: 1rem;
}

.mode-rating-badge {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.mode-label {
  font-size: 0.625rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  min-width: 2rem;
  text-align: right;
}

.mode-tier {
  font-size: 0.6875rem;
  font-weight: 700;
  color: white;
  padding: 0.1875rem 0.5rem;
  border-radius: 4px;
  min-width: 2.5rem;
  text-align: center;
}

/* === Formation Grid === */
.formation-section {
  /* No extra margin needed */
}

.formation-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
}

.member-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.625rem;
  padding: 1rem 0.5rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 0.875rem;
  animation: member-reveal 0.5s ease-out both;
  animation-delay: var(--member-delay, 0s);
  transition: all 0.3s ease;
}

.member-card:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.1);
  transform: translateY(-4px);
}

.member-card.focal {
  border-color: rgba(249, 147, 7, 0.3);
  background: rgba(249, 147, 7, 0.05);
}

@keyframes member-reveal {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.9);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* Focal Indicator */
.focal-indicator {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #ff9500, #ff6b00);
  border-radius: 50%;
  font-size: 0.625rem;
  color: white;
  box-shadow: 0 0 12px rgba(255, 149, 0, 0.5);
}

/* Role Label */
.member-role {
  display: flex;
  align-items: center;
  gap: 0.3125rem;
  padding: 0.1875rem 0.5rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 5px;
}

.role-icon {
  font-size: 0.75rem;
}

.role-text {
  font-size: 0.625rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Portrait */
.member-portrait {
  position: relative;
}


.element-glow {
  position: absolute;
  inset: -20px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s;
}

.member-card:hover .element-glow {
  opacity: 1;
}

/* Member Info */
.member-info {
  text-align: center;
}

.member-name {
  font-size: 0.8125rem;
  font-weight: 600;
  color: white;
  margin-bottom: 0.25rem;
}

.member-element {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
}

.element-badge {
  font-size: 0.625rem;
  font-weight: 500;
  padding: 0.0625rem 0.375rem;
  border-radius: 4px;
  border: 1px solid;
}

.path-text {
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.4);
}

/* === Synergies Section === */
.synergies-section {
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

/* === Responsive === */
@media (max-width: 640px) {
  .team-detail {
    padding: 1rem;
    border-radius: 1rem;
  }

  .formation-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;
  }

  .detail-header {
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
    padding-bottom: 1rem;
  }

  .team-title {
    font-size: 1.125rem;
  }

  .structure-info {
    justify-content: center;
  }

  .structure-desc {
    display: none;
  }

  .mode-ratings {
    flex-direction: row;
    flex-wrap: wrap;
    margin-left: 0;
    padding-left: 0;
    margin-top: 0;
    justify-content: center;
    gap: 0.5rem;
  }

  .mode-label {
    min-width: auto;
  }

  .member-card {
    padding: 0.75rem 0.375rem;
    gap: 0.5rem;
  }

  .member-name {
    font-size: 0.75rem;
  }

  .member-element {
    flex-direction: column;
    gap: 0.25rem;
  }

  .synergies-section {
    margin-top: 1rem;
    padding-top: 1rem;
  }
}

/* Extra small phones */
@media (max-width: 360px) {
  .team-detail {
    padding: 0.75rem;
  }

  .formation-grid {
    gap: 0.5rem;
  }

  .member-card {
    padding: 0.5rem 0.25rem;
  }

  .member-role {
    padding: 0.125rem 0.375rem;
  }

  .role-text {
    font-size: 0.5625rem;
  }
}
</style>
