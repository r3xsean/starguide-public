<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Character, UserCharacterInvestment } from '../types';
import TeamCard from './TeamCard.vue';
import CharacterFilterSelect from './CharacterFilterSelect.vue';
import { generateTeams, generateTeamsForSupport, calculateAllModeRatings, calculateTeamSynergy, calculateBidirectionalScore, scoreToRating, getTeamRankingScore, getBestTierForMode, getMaxTeamsForTier, getCanonicalPrimaryDPS, isDualCarryTeam, orderTeamByRole, type GeneratedTeam, type GameMode } from '../utils/teamGenerator';
import { hasCompositions } from '../utils/characterUtils';

// ==================
// PROPS
// ==================

interface Props {
  characters: Character[];
  ownedCharacters: Character[];
  getOwnership: (id: string) => 'owned' | 'concept' | 'none';
  getInvestment: (id: string) => UserCharacterInvestment | undefined;
  gameMode: 'moc' | 'pf' | 'as';
  lockedTeams: string[][];
  favoritedTeams: string[][];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:lockedTeams': [teams: string[][]];
  'update:favoritedTeams': [teams: string[][]];
}>();

// Get all character IDs that are locked (used in any locked team)
const lockedCharacterIds = computed(() => {
  const ids = new Set<string>();
  for (const team of props.lockedTeams) {
    for (const id of team) {
      ids.add(id);
    }
  }
  return ids;
});

// Check if a team is locked
const isTeamLocked = (team: GeneratedTeam): boolean => {
  const teamKey = [...team.characters.map(c => c.id)].sort().join(',');
  return props.lockedTeams.some(locked => [...locked].sort().join(',') === teamKey);
};

// Toggle lock for a team
const toggleTeamLock = (team: GeneratedTeam) => {
  const teamIds = team.characters.map(c => c.id);
  const teamKey = [...teamIds].sort().join(',');

  const existingIndex = props.lockedTeams.findIndex(
    locked => [...locked].sort().join(',') === teamKey
  );

  if (existingIndex >= 0) {
    // Unlock: remove from locked teams
    const newLocked = [...props.lockedTeams];
    newLocked.splice(existingIndex, 1);
    emit('update:lockedTeams', newLocked);
  } else {
    // Lock: add to locked teams (preserve original order)
    emit('update:lockedTeams', [...props.lockedTeams, teamIds]);
  }
};

// Clear all locked teams
const clearLockedTeams = () => {
  emit('update:lockedTeams', []);
};

// Check if a team is favorited
const isTeamFavorited = (team: GeneratedTeam): boolean => {
  const teamKey = [...team.characters.map(c => c.id)].sort().join(',');
  return props.favoritedTeams.some(fav => [...fav].sort().join(',') === teamKey);
};

// Toggle favorite for a team
const toggleTeamFavorite = (team: GeneratedTeam) => {
  const teamIds = team.characters.map(c => c.id);
  const teamKey = [...teamIds].sort().join(',');

  const existingIndex = props.favoritedTeams.findIndex(
    fav => [...fav].sort().join(',') === teamKey
  );

  if (existingIndex >= 0) {
    // Unfavorite: remove from favorited teams
    const newFavorited = [...props.favoritedTeams];
    newFavorited.splice(existingIndex, 1);
    emit('update:favoritedTeams', newFavorited);
  } else {
    // Favorite: add to favorited teams
    emit('update:favoritedTeams', [...props.favoritedTeams, teamIds]);
  }
};

// ==================
// STATE
// ==================

// Display mode includes 'avg' for averaged tier display
type DisplayMode = GameMode | 'avg';

const selectedMode = ref<DisplayMode>('moc'); // Default to MoC
const selectedCharacterIds = ref<Set<string>>(new Set());

// Effective game mode for team generation/sorting (uses parent prop when 'avg' is selected)
const effectiveGameMode = computed((): GameMode => {
  return selectedMode.value === 'avg' ? props.gameMode : selectedMode.value;
});

const selectedCharacters = computed(() => {
  return Array.from(selectedCharacterIds.value)
    .map(id => props.characters.find(c => c.id === id))
    .filter((c): c is Character => c !== undefined);
});

// Mode labels for UI
const modeLabels: Record<DisplayMode, string> = {
  avg: 'AVG',
  moc: 'MoC',
  pf: 'PF',
  as: 'AS',
};

const modeFullLabels: Record<DisplayMode, string> = {
  avg: 'Average (all modes)',
  moc: 'Memory of Chaos',
  pf: 'Pure Fiction',
  as: 'Apocalyptic Shadow',
};

// ==================
// HELPER FUNCTIONS
// ==================

// Tier order for sorting (lower index = better)
const TIER_ORDER = ['T0', 'T0.5', 'T1', 'T1.5', 'T2', 'T3', 'T4', 'T5'];

// getBestTierForMode is imported from teamGenerator

// ==================
// COMPUTED - BEST TEAMS
// ==================

// Available characters (excluding those in locked teams)
const availableCharacters = computed(() => {
  return props.ownedCharacters.filter(c => !lockedCharacterIds.value.has(c.id));
});

const bestTeamsFromRoster = computed((): GeneratedTeam[] => {
  // Use available characters (excludes locked ones)
  if (availableCharacters.value.length < 4) return [];

  // Get all DPS/Support DPS characters from available pool
  const damageCharacters = availableCharacters.value.filter(c =>
    c.roles.includes('DPS') || c.roles.includes('Support DPS')
  );

  if (damageCharacters.length === 0) return [];

  // Sort DPS by their tier in the selected mode (best first)
  const sortedDPS = [...damageCharacters].sort((a, b) => {
    const aTier = getBestTierForMode(a.id, effectiveGameMode.value);
    const bTier = getBestTierForMode(b.id, effectiveGameMode.value);
    return TIER_ORDER.indexOf(aTier) - TIER_ORDER.indexOf(bTier);
  });

  // Generate teams for all DPS using available characters only
  const allTeams: GeneratedTeam[] = [];

  for (const mainChar of sortedDPS) {
    // Generate more teams per DPS to allow tier-weighted allocation to have enough options
    const tier = getBestTierForMode(mainChar.id, effectiveGameMode.value);
    const maxForThisDPS = getMaxTeamsForTier(tier) + 2; // Generate extra for filtering

    // For v1.5 characters with compositions, iterate through each composition
    if (hasCompositions(mainChar) && mainChar.compositions) {
      for (const composition of mainChar.compositions) {
        const teams = generateTeams(mainChar, availableCharacters.value, {
          maxTeams: Math.ceil(maxForThisDPS / mainChar.compositions.length) + 1,
          gameMode: effectiveGameMode.value,
          compositionId: composition.id
        });
        allTeams.push(...teams);
      }
    } else {
      // Legacy character: no compositionId needed
      const teams = generateTeams(mainChar, availableCharacters.value, {
        maxTeams: maxForThisDPS,
        gameMode: effectiveGameMode.value
      });
      allTeams.push(...teams);
    }
  }

  // Sort all teams by ranking score (pre-built bonus + rating + tiers, best first)
  allTeams.sort((a, b) => getTeamRankingScore(b, effectiveGameMode.value) - getTeamRankingScore(a, effectiveGameMode.value));

  // Deduplicate teams using canonical primary DPS with tier-weighted limits
  const seen = new Set<string>();
  const dpsStats = new Map<string, {
    count: number;
    maxAllowed: number;
    hasHypercarry: boolean;
    hasDualcarry: boolean;
  }>();

  const uniqueTeams = allTeams.filter(team => {
    // Check for duplicate team composition (same 4 characters = same team)
    const key = [...team.characters.map(c => c.id)].sort().join(',');
    if (seen.has(key)) return false;

    // Determine canonical primary DPS for this team
    const canonicalPrimary = getCanonicalPrimaryDPS(team.characters, effectiveGameMode.value);
    if (!canonicalPrimary) return false;

    const primaryId = canonicalPrimary.id;
    const primaryTier = getBestTierForMode(primaryId, effectiveGameMode.value);

    // Initialize stats for this DPS if needed
    if (!dpsStats.has(primaryId)) {
      dpsStats.set(primaryId, {
        count: 0,
        maxAllowed: getMaxTeamsForTier(primaryTier),
        hasHypercarry: false,
        hasDualcarry: false,
      });
    }

    const stats = dpsStats.get(primaryId)!;

    // Check if canonical primary DPS has room
    if (stats.count >= stats.maxAllowed) return false;

    // Accept the team
    seen.add(key);
    stats.count++;

    // Track structure diversity
    if (isDualCarryTeam(team.characters)) {
      stats.hasDualcarry = true;
    } else {
      stats.hasHypercarry = true;
    }

    return true;
  });

  // Return top 18 teams (increased from 15 for more variety)
  return uniqueTeams.slice(0, 18);
});

// Generate teams WITH selected characters (instead of just filtering)
const filteredTeams = computed((): GeneratedTeam[] => {
  if (selectedCharacterIds.value.size === 0) return bestTeamsFromRoster.value;

  const selected = selectedCharacters.value;
  const selectedCount = selected.length;

  // If 4 characters selected, validate and show that exact team
  if (selectedCount === 4) {
    const teamChars = orderTeamByRole(selected);

    // Validate composition
    if (!isValidTeamComposition(teamChars)) {
      // Invalid composition - return empty with no results
      return [];
    }

    // Generate proper team with scoring
    const team = generateTeamFromChars(teamChars);
    team.name = 'Selected Team';
    return [team];
  }

  // For 1-3 selected characters, generate teams that include them
  // Analyze selected characters to determine what roles we still need
  const selectedRoles = {
    dps: selected.filter(c => c.roles.includes('DPS') || c.roles.includes('Support DPS')).length,
    amplifier: selected.filter(c => c.roles.includes('Amplifier')).length,
    sustain: selected.filter(c => c.roles.includes('Sustain')).length,
  };

  const teams: GeneratedTeam[] = [];

  // Early validation: Check if selected characters can form a valid team
  if (selectedRoles.dps > 2) {
    // Too many DPS selected - impossible to form valid team
    return [];
  }
  if (selectedRoles.sustain > 1) {
    // Too many Sustains selected - impossible to form valid team
    return [];
  }

  // Find DPS among selected characters
  const selectedDPS = selected.find(c => c.roles.includes('DPS') || c.roles.includes('Support DPS'));

  // Special case: No DPS selected (only supports)
  // Use generateTeamsForSupport like My Teams does
  if (!selectedDPS) {
    // Use the first selected support to generate teams
    const primarySupport = selected[0];
    if (!primarySupport) return [];

    const result = generateTeamsForSupport(
      primarySupport,
      availableCharacters.value,
      props.characters,
      { maxTeams: 50, gameMode: effectiveGameMode.value, getInvestment: props.getInvestment }
    );

    // Combine focal and supporting teams
    const allTeams = [...result.focalTeams, ...result.supportingTeams];

    // Filter to only teams that contain ALL selected supports
    const filteredBySelected = allTeams.filter(team => {
      const teamCharIds = new Set(team.characters.map(c => c.id));
      return selected.every(s => teamCharIds.has(s.id));
    });

    // Deduplicate by team key
    const seenKeys = new Set<string>();
    const uniqueTeams: GeneratedTeam[] = [];
    for (const team of filteredBySelected) {
      const key = [...team.characters.map(c => c.id)].sort().join(',');
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        uniqueTeams.push(team);
      }
    }

    // Sort and return top teams
    uniqueTeams.sort((a, b) => getTeamRankingScore(b, effectiveGameMode.value) - getTeamRankingScore(a, effectiveGameMode.value));
    return uniqueTeams.slice(0, 15);
  }

  // Generate all possible teams by filling remaining slots with proper composition
  const slotsToFill = 4 - selectedCount;

  // Determine what roles we need to fill
  // Ideal team: 1-2 DPS, exactly 1 Sustain, rest Amplifiers
  const needSustain = selectedRoles.sustain === 0;
  const canAddDPS = selectedRoles.dps < 2;

  // Filter unselected characters by what we can add
  const unselectedByRole = {
    dps: availableCharacters.value.filter(c =>
      !selectedCharacterIds.value.has(c.id) &&
      (c.roles.includes('DPS') || c.roles.includes('Support DPS'))
    ),
    amplifier: availableCharacters.value.filter(c =>
      !selectedCharacterIds.value.has(c.id) &&
      c.roles.includes('Amplifier')
    ),
    sustain: availableCharacters.value.filter(c =>
      !selectedCharacterIds.value.has(c.id) &&
      c.roles.includes('Sustain')
    ),
  };

  // Generate valid team compositions
  if (slotsToFill === 1) {
    // Need 1 more character
    if (needSustain) {
      // MUST be a Sustain
      for (const sustain of unselectedByRole.sustain) {
        const teamCharsUnordered = [...selected, sustain];
        const teamChars = orderTeamByRole(teamCharsUnordered);
        if (!isValidTeamComposition(teamChars)) continue;
        teams.push(generateTeamFromChars(teamChars));
      }
    } else {
      // Can be DPS or Amplifier
      const candidates = [
        ...(canAddDPS ? unselectedByRole.dps : []),
        ...unselectedByRole.amplifier,
      ];
      for (const char of candidates) {
        const teamCharsUnordered = [...selected, char];
        const teamChars = orderTeamByRole(teamCharsUnordered);
        if (!isValidTeamComposition(teamChars)) continue;
        teams.push(generateTeamFromChars(teamChars));
      }
    }
  } else if (slotsToFill === 2) {
    // Need 2 more characters
    if (needSustain) {
      // One MUST be Sustain, other can be DPS or Amplifier
      for (const sustain of unselectedByRole.sustain) {
        const otherCandidates = [
          ...(canAddDPS ? unselectedByRole.dps : []),
          ...unselectedByRole.amplifier,
        ].filter(c => c.id !== sustain.id);

        for (const other of otherCandidates) {
          const teamCharsUnordered = [...selected, sustain, other];
          const teamChars = orderTeamByRole(teamCharsUnordered);
          if (!isValidTeamComposition(teamChars)) continue;
          teams.push(generateTeamFromChars(teamChars));
        }
      }
    } else {
      // Already have Sustain, need 2 from DPS/Amplifier
      const candidates = [
        ...(canAddDPS ? unselectedByRole.dps : []),
        ...unselectedByRole.amplifier,
      ];
      const combinations = getCombinations(candidates, 2);
      for (const combo of combinations) {
        const teamCharsUnordered = [...selected, ...combo];
        const teamChars = orderTeamByRole(teamCharsUnordered);
        if (!isValidTeamComposition(teamChars)) continue;
        teams.push(generateTeamFromChars(teamChars));
      }
    }
  } else if (slotsToFill === 3) {
    // Need 3 more characters
    // Must include at least 1 Sustain
    for (const sustain of unselectedByRole.sustain) {
      // Remaining 2 slots from DPS/Amplifier
      const otherCandidates = [
        ...(canAddDPS ? unselectedByRole.dps : []),
        ...unselectedByRole.amplifier,
      ].filter(c => c.id !== sustain.id);

      const combinations = getCombinations(otherCandidates, 2);
      for (const combo of combinations) {
        const teamCharsUnordered = [...selected, sustain, ...combo];
        const teamChars = orderTeamByRole(teamCharsUnordered);
        if (!isValidTeamComposition(teamChars)) continue;
        teams.push(generateTeamFromChars(teamChars));
      }
    }
  }

  // Sort teams by score
  teams.sort((a, b) => getTeamRankingScore(b, effectiveGameMode.value) - getTeamRankingScore(a, effectiveGameMode.value));

  // Return top 15 teams
  return teams.slice(0, 15);
});

// Sort teams with favorited teams first, maintaining original order within groups
const sortedTeams = computed((): GeneratedTeam[] => {
  const teams = filteredTeams.value;

  // Create a helper to get team key for favorite lookup
  const getTeamKey = (team: GeneratedTeam) =>
    [...team.characters.map(c => c.id)].sort().join(',');

  // Create a Set of favorited team keys for fast lookup
  const favoritedKeys = new Set(
    props.favoritedTeams.map(teamIds => [...teamIds].sort().join(','))
  );

  // Separate into favorited and non-favorited, preserving original order within each group
  const favorited: GeneratedTeam[] = [];
  const notFavorited: GeneratedTeam[] = [];

  for (const team of teams) {
    if (favoritedKeys.has(getTeamKey(team))) {
      favorited.push(team);
    } else {
      notFavorited.push(team);
    }
  }

  // Favorited teams first, then the rest (both maintain their ranking-based order)
  return [...favorited, ...notFavorited];
});

// Validate team composition
function isValidTeamComposition(chars: Character[]): boolean {
  if (chars.length !== 4) return false;

  // Count roles
  const dpsCount = chars.filter(c => c.roles.includes('DPS') || c.roles.includes('Support DPS')).length;
  const sustainCount = chars.filter(c => c.roles.includes('Sustain')).length;

  // Validate:
  // - Max 2 DPS
  // - Exactly 1 Sustain
  // - No duplicate base characters
  if (dpsCount > 2) return false;
  if (sustainCount !== 1) return false;

  // Check for duplicate base characters (e.g., two Trailblazer variants)
  const baseIds = chars.map(c => c.id.startsWith('trailblazer-') ? 'trailblazer' : c.id);
  if (new Set(baseIds).size !== chars.length) return false;

  return true;
}

// Helper: Get all combinations of size k from array
function getCombinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (k > arr.length) return [];
  if (k === arr.length) return [arr];

  const result: T[][] = [];

  function backtrack(start: number, current: T[]) {
    if (current.length === k) {
      result.push([...current]);
      return;
    }

    for (let i = start; i < arr.length; i++) {
      const item = arr[i];
      if (item !== undefined) {
        current.push(item);
        backtrack(i + 1, current);
        current.pop();
      }
    }
  }

  backtrack(0, []);
  return result;
}

// Helper: Generate team object from character array
// Uses the proper bidirectional scoring from calculateTeamSynergy (includes dual-focal for dual-carry)
function generateTeamFromChars(chars: Character[]): GeneratedTeam {
  // Use the real team synergy calculator which handles bidirectional scoring AND dual-focal averaging
  const synergy = calculateTeamSynergy(chars, effectiveGameMode.value);

  // Find the main DPS for naming
  const mainDPS = chars.find(c => c.roles.includes('DPS') || c.roles.includes('Support DPS')) || chars[0];

  // Calculate normalized synergy quality using dual-focal averaging for dual-carry teams
  const dpsCharacters = chars.filter(c => c.roles.includes('DPS') || c.roles.includes('Support DPS'));
  const isDualCarry = dpsCharacters.length === 2;
  const supportCharacters = chars.filter(c => !dpsCharacters.includes(c));

  let avgSynergy = 0;

  if (isDualCarry && dpsCharacters[0] && dpsCharacters[1]) {
    // Dual-carry: Average synergy from both DPS perspectives
    const dps1 = dpsCharacters[0];
    const dps2 = dpsCharacters[1];
    let totalScore = 0;
    let scoreCount = 0;

    // DPS1 <-> DPS2 synergy
    const dps1ToDps2 = calculateBidirectionalScore(dps1, dps2);
    totalScore += dps1ToDps2.score;
    scoreCount++;

    // Average support synergies from both DPS perspectives
    for (const support of supportCharacters) {
      const score1 = calculateBidirectionalScore(dps1, support);
      const score2 = calculateBidirectionalScore(dps2, support);
      const avgScore = (score1.score + score2.score) / 2;
      totalScore += avgScore;
      scoreCount++;
    }

    avgSynergy = scoreCount > 0 ? totalScore / scoreCount : 0;
  } else {
    // Single-carry: Original logic
    const dps = mainDPS || chars[0];
    let synergyQuality = 0;
    let teammateCount = 0;

    if (dps) {
      for (const c of chars) {
        if (c.id !== dps.id) {
          // Get bidirectional score for this teammate
          const biScore = calculateBidirectionalScore(dps, c);
          synergyQuality += biScore.score;
          teammateCount++;
        }
      }
    }

    avgSynergy = teammateCount > 0 ? synergyQuality / teammateCount : 0;
  }

  // Use the same rating function as normal team generation for consistency
  const rating = scoreToRating(avgSynergy);

  const orderedChars = orderTeamByRole(chars);
  return {
    characters: orderedChars,
    name: mainDPS ? `${mainDPS.name} Team` : 'Custom Team',
    structure: 'custom',
    score: synergy.score,
    rating: rating as any,
    reasoning: synergy.reasoning,
    contributions: synergy.contributions,
    roles: orderedChars.map(c => c.roles[0] || 'DPS'),
    breakdown: synergy.breakdown,
    insights: synergy.insights,
    modeRatings: synergy.modeRatings || calculateAllModeRatings(orderedChars, (id) => props.getInvestment(id) ?? undefined),
  };
}

// Get locked teams as GeneratedTeam objects for display
const lockedTeamObjects = computed((): GeneratedTeam[] => {
  return props.lockedTeams.map((teamIds, index) => {
    const chars = teamIds.map(id => props.characters.find(c => c.id === id)).filter((c): c is Character => c !== undefined);
    const orderedChars = orderTeamByRole(chars);
    // Create a minimal GeneratedTeam object for display
    return {
      characters: orderedChars,
      name: `Locked Team ${index + 1}`,
      structure: 'hypercarry',
      score: 0,
      rating: 'B' as const,
      reasoning: [],
      contributions: [],
      roles: orderedChars.map(c => c.roles[0] || 'DPS'),
      breakdown: [],
      insights: [],
      modeRatings: calculateAllModeRatings(orderedChars, (id) => props.getInvestment(id) ?? undefined),
    };
  });
});

</script>

<template>
  <div class="best-teams-view">
    <!-- Header -->
    <header class="view-header" data-onboarding="best-teams-header">
      <div class="header-content">
        <div class="header-icon">
          <div class="icon-ring"></div>
          <span class="icon-glyph">◇</span>
        </div>
        <div class="header-text">
          <h1 class="header-title">Best Teams</h1>
          <p class="header-subtitle">Optimal formations from your {{ ownedCharacters.length }} characters</p>
        </div>
      </div>
    </header>

    <!-- Not Enough Characters State -->
    <div v-if="ownedCharacters.length < 4" class="empty-state">
      <div class="empty-orb">
        <div class="orb-ring orb-ring-1"></div>
        <div class="orb-ring orb-ring-2"></div>
        <div class="orb-ring orb-ring-3"></div>
        <span class="orb-icon">✦</span>
      </div>
      <h2 class="empty-title">Insufficient Data</h2>
      <p class="empty-desc">
        You need at least 4 owned characters to generate team recommendations.<br />
        Right-click characters in the sidebar to mark them as owned.
      </p>
      <div class="ownership-legend">
        <div class="legend-item">
          <div class="legend-dot owned"></div>
          <span>Owned</span>
        </div>
        <div class="legend-item">
          <div class="legend-dot concept"></div>
          <span>Planning to Pull</span>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <div v-else class="teams-content">
      <!-- Locked Teams Section (shows when teams are locked) -->
      <div v-if="lockedTeams.length > 0" class="locked-teams-section">
        <div class="locked-header">
          <div class="locked-header-left">
            <span class="locked-icon">🔒</span>
            <span class="locked-title">Locked Teams ({{ lockedTeams.length }})</span>
          </div>
          <button class="clear-locked-btn" @click="clearLockedTeams">
            Clear All
          </button>
        </div>
        <div class="locked-teams-grid">
          <div
            v-for="(team, index) in lockedTeamObjects"
            :key="`locked-${index}`"
            class="locked-team-card"
          >
            <TeamCard
              :generated-team="team"
              :get-ownership="getOwnership"
              :get-investment="getInvestment"
              :focal-character-id="team.characters[0]?.id"
              :compact="true"
              :locked="true"
              :show-lock-button="true"
              :game-mode="effectiveGameMode"
              @lock-toggle="toggleTeamLock(team)"
            />
          </div>
        </div>
      </div>

      <!-- Header with Mode Selector -->
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-4">
          <h3 class="text-sm font-semibold text-white/60 uppercase tracking-wider">
            {{ lockedTeams.length > 0 ? 'Available Teams' : 'Optimal Formations' }}
          </h3>
          <!-- Game Mode Selector -->
          <div class="mode-selector">
            <button
              v-for="mode in (['avg', 'moc', 'pf', 'as'] as DisplayMode[])"
              :key="mode"
              class="mode-btn"
              :class="{ active: selectedMode === mode }"
              :title="modeFullLabels[mode]"
              @click="selectedMode = mode"
            >
              {{ modeLabels[mode] }}
            </button>
          </div>
        </div>
        <span class="text-xs text-white/30">{{ sortedTeams.length }} teams</span>
      </div>

      <!-- Character Filter -->
      <CharacterFilterSelect
        :characters="ownedCharacters"
        :selected-ids="selectedCharacterIds"
        :get-ownership="getOwnership"
        :game-mode="effectiveGameMode"
        button-label="Filter by Character"
        modal-title="Select Characters"
        @update:selected-ids="selectedCharacterIds = $event"
      />

      <!-- Tips for team features -->
      <div v-if="lockedTeams.length === 0 && favoritedTeams.length === 0" class="feature-tips" data-onboarding="best-teams-lock-tip">
        <span class="tip-icon">💡</span>
        <span class="tip-text">
          <strong>♡</strong> Favorite teams to keep them at the top of your list.
          <strong>🔓</strong> Lock teams to reserve characters when planning multiple MoC teams.
        </span>
      </div>

      <!-- No available teams message -->
      <div v-if="bestTeamsFromRoster.length === 0 && lockedTeams.length > 0" class="no-teams-message">
        <span class="no-teams-icon">✦</span>
        <p class="no-teams-text">Not enough available characters for another team.</p>
        <p class="no-teams-hint">Unlock a team to see more options.</p>
      </div>

      <!-- No filtered teams message -->
      <div v-else-if="sortedTeams.length === 0 && selectedCharacterIds.size > 0" class="no-teams-message">
        <span class="no-teams-icon">✦</span>
        <p class="no-teams-text">No teams found with the selected characters.</p>
        <p class="no-teams-hint">Try selecting fewer characters or different combinations.</p>
      </div>

      <!-- Teams Grid -->
      <div v-else class="teams-grid">
        <TeamCard
          v-for="(team, index) in sortedTeams"
          :key="index"
          :generated-team="team"
          :get-ownership="getOwnership"
          :get-investment="getInvestment"
          :focal-character-id="team.characters[0]?.id"
          :locked="isTeamLocked(team)"
          :show-lock-button="true"
          :favorited="isTeamFavorited(team)"
          :show-favorite-button="true"
          :game-mode="effectiveGameMode"
          @lock-toggle="toggleTeamLock(team)"
          @favorite-toggle="toggleTeamFavorite(team)"
          :style="{ '--item-delay': `${index * 0.05}s` }"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Header */
.view-header {
  margin-bottom: 2rem;
}

.header-content {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}

.header-icon {
  position: relative;
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-ring {
  position: absolute;
  inset: 0;
  border: 2px solid rgba(99, 102, 241, 0.4);
  border-radius: 16px;
  animation: icon-pulse 3s ease-in-out infinite;
}

@keyframes icon-pulse {
  0%, 100% { transform: scale(1); opacity: 0.4; }
  50% { transform: scale(1.1); opacity: 0.2; }
}

.icon-glyph {
  font-size: 1.75rem;
  color: rgba(99, 102, 241, 0.9);
  text-shadow: 0 0 20px rgba(99, 102, 241, 0.5);
}

.header-title {
  font-family: var(--font-display, 'Inter');
  font-size: 1.75rem;
  font-weight: 700;
  color: white;
  letter-spacing: -0.02em;
}

.header-subtitle {
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 0.25rem;
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 5rem 2rem;
  text-align: center;
}

.empty-orb {
  position: relative;
  width: 120px;
  height: 120px;
  margin-bottom: 2rem;
}

.orb-ring {
  position: absolute;
  inset: 0;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 50%;
}

.orb-ring-1 { animation: orb-rotate 8s linear infinite; }
.orb-ring-2 { inset: 10px; animation: orb-rotate 12s linear infinite reverse; }
.orb-ring-3 { inset: 20px; animation: orb-rotate 6s linear infinite; }

@keyframes orb-rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.orb-icon {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.5rem;
  color: rgba(255, 255, 255, 0.2);
}

.empty-title {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 0.75rem;
}

.empty-desc {
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.4);
  line-height: 1.6;
  max-width: 400px;
}

.ownership-legend {
  display: flex;
  gap: 1.5rem;
  margin-top: 2rem;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
}

.legend-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.legend-dot.owned {
  background: rgb(249, 147, 7);
  box-shadow: 0 0 10px rgba(249, 147, 7, 0.4);
}

.legend-dot.concept {
  background: rgb(168, 85, 247);
  box-shadow: 0 0 10px rgba(168, 85, 247, 0.4);
}

/* Mode Selector */
.mode-selector {
  display: flex;
  gap: 2px;
  background: rgba(255, 255, 255, 0.05);
  padding: 2px;
  border-radius: 8px;
}

.mode-btn {
  padding: 4px 12px;
  font-family: var(--font-display);
  font-size: 0.6875rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.4);
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.mode-btn:hover {
  color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.05);
}

.mode-btn.active {
  color: white;
  background: rgba(99, 102, 241, 0.5);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
}

/* Teams Content */
.teams-content {
  animation: section-enter 0.5s ease-out;
}

@keyframes section-enter {
  from { opacity: 0; transform: translateY(15px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Teams Grid */
.teams-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.75rem;
  padding: 0.5rem;
}

@media (min-width: 480px) {
  .teams-grid {
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1rem;
  }
}

@media (min-width: 768px) {
  .teams-grid {
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  }
}

/* Locked Teams Section */
.locked-teams-section {
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: linear-gradient(135deg, rgba(249, 147, 7, 0.08) 0%, rgba(249, 147, 7, 0.02) 100%);
  border: 1px solid rgba(249, 147, 7, 0.2);
  border-radius: 1rem;
}

.locked-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.locked-header-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.locked-icon {
  font-size: 0.875rem;
}

.locked-title {
  font-family: var(--font-display);
  font-size: 0.875rem;
  font-weight: 600;
  color: rgba(249, 147, 7, 0.9);
}

.clear-locked-btn {
  padding: 0.25rem 0.75rem;
  font-size: 0.6875rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.clear-locked-btn:hover {
  color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
}

.locked-teams-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.locked-team-card {
  position: relative;
}

/* No Teams Message */
.no-teams-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 2rem;
  text-align: center;
  background: linear-gradient(135deg, rgba(18, 18, 38, 0.5) 0%, rgba(12, 12, 28, 0.7) 100%);
  border-radius: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.no-teams-icon {
  font-size: 2.5rem;
  color: rgba(255, 255, 255, 0.15);
  margin-bottom: 1rem;
}

.no-teams-text {
  font-size: 0.9375rem;
  color: rgba(255, 255, 255, 0.6);
  margin: 0 0 0.5rem 0;
}

.no-teams-hint {
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.4);
  margin: 0;
}

/* Feature Tips */
.feature-tips {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  background: rgba(99, 102, 241, 0.08);
  border: 1px solid rgba(99, 102, 241, 0.15);
  border-radius: 0.5rem;
  margin-bottom: 1rem;
}

.tip-icon {
  font-size: 0.875rem;
  flex-shrink: 0;
}

.tip-text {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
  line-height: 1.4;
}

@media (max-width: 640px) {
  .feature-tips {
    flex-direction: column;
    text-align: center;
    gap: 0.25rem;
  }
}
</style>
