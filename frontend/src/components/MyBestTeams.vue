<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import type { Character, TierRating } from '../types';
import { TIER_SCORES } from '../types';
import CharacterCard from './CharacterCard.vue';
import TeamSynergies from './TeamSynergies.vue';
import { generateTeams, getTeamRankingScore, getBestTierForMode, getMaxTeamsForTier, getCanonicalPrimaryDPS, isDualCarryTeam, type GeneratedTeam, type GameMode } from '../utils/teamGenerator';
import { getTierData } from '../data/tierData';

// ==================
// PROPS
// ==================

interface Props {
  characters: Character[];
  ownedCharacters: Character[];
  getOwnership: (id: string) => 'owned' | 'concept' | 'none';
  gameMode: 'moc' | 'pf' | 'as';
}

const props = defineProps<Props>();


// ==================
// STATE
// ==================

const selectedTeamIndex = ref(0);
const teamDetailRef = ref<HTMLElement | null>(null);

// Handle team selection with scroll
const handleTeamSelect = (index: number) => {
  selectedTeamIndex.value = index;
  nextTick(() => {
    if (teamDetailRef.value) {
      teamDetailRef.value.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
};

// ==================
// COMPUTED
// ==================

// Calculate tier for a character
const getCharacterTier = (characterId: string): TierRating => {
  const tierData = getTierData(characterId);
  if (!tierData) return 'T2';

  const modeData = tierData[props.gameMode];
  if (!modeData) return 'T2';

  const tiers = Object.values(modeData) as TierRating[];
  if (tiers.length === 0) return 'T2';

  const tierOrder: TierRating[] = ['T-1', 'T-0.5', 'T0', 'T0.5', 'T1', 'T1.5', 'T2', 'T3', 'T4', 'T5'];
  return tiers.reduce((best, current) =>
    tierOrder.indexOf(current) < tierOrder.indexOf(best) ? current : best
  );
};

// Calculate team tier
const calculateTeamTier = (team: GeneratedTeam): TierRating => {
  const scores = team.characters.map(c => TIER_SCORES[getCharacterTier(c.id)]);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

  if (avg >= 110) return 'T-1';
  if (avg >= 103) return 'T-0.5';
  if (avg >= 95) return 'T0';
  if (avg >= 85) return 'T0.5';
  if (avg >= 75) return 'T1';
  if (avg >= 65) return 'T1.5';
  if (avg >= 55) return 'T2';
  if (avg >= 45) return 'T3';
  if (avg >= 35) return 'T4';
  return 'T5';
};

// Auto-generated best teams from owned roster
const bestTeamsFromRoster = computed((): GeneratedTeam[] => {
  if (props.ownedCharacters.length < 4) return [];

  // Find the best DPS/Support DPS characters to build teams around
  const damageCharacters = props.ownedCharacters.filter(c =>
    c.roles.includes('DPS') || c.roles.includes('Support DPS')
  );

  if (damageCharacters.length === 0) return [];

  const mode = props.gameMode as GameMode;

  // Sort DPS by tier (best first) for consistent processing
  const sortedDPS = [...damageCharacters].sort((a, b) => {
    const aTier = getBestTierForMode(a.id, mode);
    const bTier = getBestTierForMode(b.id, mode);
    const tierOrder: TierRating[] = ['T-1', 'T-0.5', 'T0', 'T0.5', 'T1', 'T1.5', 'T2', 'T3', 'T4', 'T5'];
    return tierOrder.indexOf(aTier) - tierOrder.indexOf(bTier);
  });

  // Generate teams for each damage dealer with tier-appropriate limits
  const allTeams: GeneratedTeam[] = [];

  for (const mainChar of sortedDPS.slice(0, 10)) {
    const tier = getBestTierForMode(mainChar.id, mode);
    const maxForThisDPS = getMaxTeamsForTier(tier) + 2; // Generate extra for filtering
    const teams = generateTeams(mainChar, props.ownedCharacters, { maxTeams: maxForThisDPS, gameMode: mode });
    allTeams.push(...teams);
  }

  // Sort by ranking score
  allTeams.sort((a, b) => getTeamRankingScore(b, mode) - getTeamRankingScore(a, mode));

  // Deduplicate using canonical primary DPS with tier-weighted limits
  const seen = new Set<string>();
  const dpsStats = new Map<string, {
    count: number;
    maxAllowed: number;
    hasHypercarry: boolean;
    hasDualcarry: boolean;
  }>();

  const uniqueTeams = allTeams.filter(team => {
    // Check for duplicate team composition
    const key = team.characters.map(c => c.id).sort().join(',');
    if (seen.has(key)) return false;

    // Determine canonical primary DPS for this team
    const canonicalPrimary = getCanonicalPrimaryDPS(team.characters, mode);
    if (!canonicalPrimary) return false;

    const primaryId = canonicalPrimary.id;
    const primaryTier = getBestTierForMode(primaryId, mode);

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

  // Return top 12 teams (increased from 10 for more variety)
  return uniqueTeams.slice(0, 12);
});

const selectedTeam = computed(() => {
  return bestTeamsFromRoster.value[selectedTeamIndex.value] || null;
});

// ==================
// UI HELPERS
// ==================

const getTierGradient = (tier: string) => {
  const gradients: Record<string, string> = {
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
  return gradients[tier] || gradients['T5'];
};

const elementColors: Record<string, string> = {
  Physical: '#c4c4c4',
  Fire: '#f4634e',
  Ice: '#47c7fd',
  Lightning: '#d376f0',
  Wind: '#5fe8b6',
  Quantum: '#625afa',
  Imaginary: '#f3d86b',
};

const roleIcons: Record<string, string> = {
  'DPS': '⚔️',
  'Support DPS': '🗡️',
  'Amplifier': '✨',
  'Sustain': '💚',
};
</script>

<template>
  <div class="my-best-teams-container">
    <!-- Header -->
    <div class="header-section mb-8">
      <div class="flex items-center gap-4">
        <div class="header-icon w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/30 to-cyan-500/20 flex items-center justify-center border border-emerald-500/30">
          <span class="text-3xl">🏆</span>
        </div>
        <div>
          <h1 class="text-2xl font-display font-bold text-white">My Best Teams</h1>
          <p class="text-sm text-white/50">Optimal teams auto-generated from your {{ ownedCharacters.length }} owned characters</p>
        </div>
      </div>
    </div>

    <!-- No Owned Characters State -->
    <div v-if="ownedCharacters.length < 4" class="empty-roster text-center py-20 rounded-2xl bg-void-800/40 border border-white/5">
      <div class="text-6xl mb-6 opacity-30">👤</div>
      <h2 class="text-xl font-display text-white/60 mb-2">Not Enough Characters</h2>
      <p class="text-sm text-white/40 max-w-md mx-auto mb-6">
        You need at least 4 owned characters to generate teams. Right-click characters in the sidebar to mark them as owned.
      </p>
      <div class="flex items-center justify-center gap-4 text-xs text-white/30">
        <div class="flex items-center gap-2">
          <div class="w-4 h-4 rounded-full bg-stellar-500"></div>
          <span>Owned</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-4 h-4 rounded-full bg-nebula-500"></div>
          <span>Planning to Pull</span>
        </div>
      </div>
    </div>

    <!-- Best Teams Grid -->
    <div v-else class="teams-grid grid grid-cols-12 gap-6">
      <!-- Team Cards List -->
      <div class="col-span-4 space-y-3">
        <div class="text-xs text-white/40 uppercase tracking-wider mb-4 font-mono">
          {{ bestTeamsFromRoster.length }} Teams Generated
        </div>

        <div
          v-for="(team, index) in bestTeamsFromRoster"
          :key="index"
          @click="handleTeamSelect(index)"
          class="team-card group relative rounded-xl cursor-pointer transition-all duration-300"
          :class="selectedTeamIndex === index
            ? 'ring-2 ring-emerald-500/60 shadow-lg shadow-emerald-500/10'
            : 'hover:bg-white/5'"
          :style="{ '--item-delay': `${index * 0.05}s` }"
        >
          <div class="p-4 bg-void-800/60 rounded-xl border border-white/5">
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-3">
                <!-- Rank Badge -->
                <div
                  class="rank-badge w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
                  :class="index === 0
                    ? 'bg-gradient-to-br from-yellow-400 to-amber-500 text-void-900'
                    : index === 1
                      ? 'bg-gradient-to-br from-gray-300 to-gray-400 text-void-900'
                      : index === 2
                        ? 'bg-gradient-to-br from-amber-600 to-amber-700 text-white'
                        : 'bg-white/10 text-white/50'"
                >
                  {{ index + 1 }}
                </div>

                <!-- Tier Badge -->
                <div
                  class="px-2.5 py-1 rounded-lg text-xs font-bold shadow-md"
                  :style="{ background: getTierGradient(calculateTeamTier(team)) }"
                >
                  {{ calculateTeamTier(team) }}
                </div>
              </div>

              <!-- Score -->
              <div class="text-right">
                <div class="text-lg font-bold text-emerald-400 font-mono">{{ team.score }}</div>
                <div class="text-[10px] text-white/30 uppercase">points</div>
              </div>
            </div>

            <!-- Character Portraits -->
            <div class="flex items-center gap-2">
              <CharacterCard
                v-for="char in team.characters"
                :key="char.id"
                :character="char"
                size="sm"
              />

              <!-- Arrow indicator -->
              <div
                class="ml-auto flex items-center transition-all duration-300"
                :class="selectedTeamIndex === index ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2'"
              >
                <span class="text-emerald-400 text-lg">→</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Selected Team Detail -->
      <div class="col-span-8">
        <div v-if="selectedTeam" ref="teamDetailRef" class="team-detail rounded-2xl bg-void-800/60 border border-white/10 p-6 backdrop-blur-sm">
          <!-- Header -->
          <div class="flex items-center gap-4 mb-6 pb-4 border-b border-white/10">
            <div
              class="tier-badge px-3 py-1.5 rounded-lg font-bold text-sm shadow-lg"
              :style="{ background: getTierGradient(calculateTeamTier(selectedTeam)) }"
            >
              {{ calculateTeamTier(selectedTeam) }}
            </div>
            <div>
              <div class="text-lg font-display font-bold text-white">Team #{{ selectedTeamIndex + 1 }}</div>
              <div class="text-2xl font-mono font-bold text-emerald-400">{{ selectedTeam.score }} <span class="text-sm text-white/40 font-normal">points</span></div>
            </div>
          </div>

          <!-- Team Composition Grid -->
          <div class="grid grid-cols-4 gap-6 mb-8">
            <div
              v-for="(char, idx) in selectedTeam.characters"
              :key="char.id"
              class="team-slot text-center"
              :style="{ '--slot-delay': `${idx * 0.1}s` }"
            >
              <!-- Role Label -->
              <div class="role-label flex items-center justify-center gap-1.5 mb-3">
                <span class="text-lg">{{ roleIcons[selectedTeam.roles[idx] ?? ''] || '✨' }}</span>
                <span class="text-xs font-medium text-white/50 uppercase tracking-wider">
                  {{ selectedTeam.roles[idx] ?? 'DPS' }}
                </span>
              </div>

              <!-- Character Card -->
              <div class="relative mx-auto w-fit">
                <CharacterCard
                  :character="char"
                  :ownership="getOwnership(char.id)"
                  size="md"
                  :show-tier="true"
                />
                <!-- Glow effect for main DPS -->
                <div
                  v-if="idx === 0"
                  class="absolute -inset-2 rounded-xl opacity-30 blur-xl -z-10"
                  :style="{ background: elementColors[char.element] }"
                ></div>
              </div>

              <!-- Character Info -->
              <div class="mt-3">
                <div class="text-sm font-medium text-white">{{ char.name }}</div>
                <div class="flex items-center justify-center gap-1.5 mt-1">
                  <span
                    class="text-xs font-medium px-1.5 py-0.5 rounded"
                    :style="{
                      backgroundColor: `${elementColors[char.element]}20`,
                      color: elementColors[char.element]
                    }"
                  >
                    {{ char.element }}
                  </span>
                  <span class="text-white/30">·</span>
                  <span class="text-xs text-white/50">{{ char.path }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Team Synergies -->
          <div class="synergies-section pt-6 border-t border-white/10">
            <TeamSynergies
              :team="selectedTeam.characters"
              :breakdowns="selectedTeam.breakdown"
              :roles="selectedTeam.roles"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.my-best-teams-container {
  animation: fade-in 0.5s ease-out;
}

@keyframes fade-in {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.header-icon {
  box-shadow: 0 0 30px rgba(16, 185, 129, 0.2);
}

.team-card {
  animation: slide-in 0.4s ease-out both;
  animation-delay: var(--item-delay, 0s);
}

@keyframes slide-in {
  from {
    opacity: 0;
    transform: translateX(-15px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.team-detail {
  animation: detail-reveal 0.4s ease-out;
}

@keyframes detail-reveal {
  from {
    opacity: 0;
    transform: scale(0.98);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.team-slot {
  animation: slot-reveal 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  animation-delay: var(--slot-delay, 0s);
}

@keyframes slot-reveal {
  from {
    opacity: 0;
    transform: translateY(15px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
</style>
