<script setup lang="ts">
import { computed } from 'vue';
import type { Character, OwnershipStatus, FilterState, TierRating } from '../types';
import CharacterCard from './CharacterCard.vue';
import { getTierData } from '../data/tierData';

const props = defineProps<{
  characters: Character[];
  selectedCharacter?: Character | null;
  roster?: Map<string, OwnershipStatus>;
  filters?: FilterState;
  gameMode?: 'moc' | 'pf' | 'as';
}>();

const emit = defineEmits<{
  select: [character: Character];
}>();

// Tier helpers
const tierOrder: TierRating[] = ['T-1', 'T-0.5', 'T0', 'T0.5', 'T1', 'T1.5', 'T2', 'T3', 'T4', 'T5'];

const tierToNumber = (tier: TierRating): number => {
  const values: Record<TierRating, number> = {
    'T-1': -1, 'T-0.5': -0.5, 'T0': 0, 'T0.5': 0.5, 'T1': 1, 'T1.5': 1.5, 'T2': 2, 'T3': 3, 'T4': 4, 'T5': 5
  };
  return values[tier];
};

const numberToTier = (num: number): TierRating => {
  if (num <= -0.75) return 'T-1';
  if (num <= -0.25) return 'T-0.5';
  if (num <= 0.25) return 'T0';
  if (num <= 0.75) return 'T0.5';
  if (num <= 1.25) return 'T1';
  if (num <= 1.75) return 'T1.5';
  if (num <= 2.5) return 'T2';
  if (num <= 3.5) return 'T3';
  if (num <= 4.5) return 'T4';
  return 'T5';
};

// Get the best tier for a character for a specific mode
function getBestTierForMode(characterId: string, mode: 'moc' | 'pf' | 'as'): TierRating {
  const tierData = getTierData(characterId);
  if (!tierData) return 'T2';

  const modeData = tierData[mode];
  if (!modeData) return 'T2';

  const tiers = Object.values(modeData) as TierRating[];
  if (tiers.length === 0) return 'T2';

  return tiers.reduce((best, current) =>
    tierOrder.indexOf(current) < tierOrder.indexOf(best) ? current : best
  );
}

// Get the best tier for a character (uses mode-specific if provided, otherwise averages)
function getCharacterBestTier(character: Character): TierRating {
  // If gameMode provided, use mode-specific tier
  if (props.gameMode) {
    return getBestTierForMode(character.id, props.gameMode);
  }

  // Otherwise, calculate average across all modes
  const mocTier = getBestTierForMode(character.id, 'moc');
  const pfTier = getBestTierForMode(character.id, 'pf');
  const asTier = getBestTierForMode(character.id, 'as');

  const avg = (tierToNumber(mocTier) + tierToNumber(pfTier) + tierToNumber(asTier)) / 3;
  return numberToTier(avg);
}

// Group characters by tier
const groupedCharacters = computed(() => {
  const tiers: TierRating[] = ['T-1', 'T-0.5', 'T0', 'T0.5', 'T1', 'T1.5', 'T2', 'T3', 'T4', 'T5'];
  const groups: Record<TierRating, Character[]> = {} as Record<TierRating, Character[]>;

  tiers.forEach(tier => {
    groups[tier] = props.characters.filter(c => getCharacterBestTier(c) === tier);
  });

  return groups;
});

const getOwnership = (characterId: string): OwnershipStatus => {
  return props.roster?.get(characterId) || 'none';
};

const tierLabels: Record<string, string> = {
  'T-1': 'T-1',
  'T-0.5': 'T-0.5',
  'T0': 'T0',
  'T0.5': 'T0.5',
  'T1': 'T1',
  'T1.5': 'T1.5',
  'T2': 'T2',
  'T3': 'T3',
  'T4': 'T4',
  'T5': 'T5',
};

const tierColors: Record<string, string> = {
  'T-1': 'text-red-500',
  'T-0.5': 'text-orange-600',
  'T0': 'text-orange-500',
  'T0.5': 'text-yellow-500',
  'T1': 'text-purple-500',
  'T1.5': 'text-pink-500',
  'T2': 'text-blue-500',
  'T3': 'text-green-500',
  'T4': 'text-slate-500',
  'T5': 'text-gray-500',
};
</script>

<template>
  <div class="space-y-8">
    <template v-for="(chars, tier) in groupedCharacters" :key="tier">
      <div v-if="chars.length > 0" class="animate-fade-in">
        <!-- Tier Header -->
        <div class="flex items-center gap-3 mb-4">
          <h3
            class="font-display text-lg font-bold"
            :class="tierColors[tier]"
          >
            {{ tierLabels[tier] }}
          </h3>
          <div class="flex-1 h-px bg-gradient-to-r from-white/20 to-transparent"></div>
          <span class="text-sm text-white/40 font-mono">{{ chars.length }}</span>
        </div>

        <!-- Character Grid -->
        <div class="flex flex-wrap gap-2 sm:gap-3">
          <CharacterCard
            v-for="(character, index) in chars"
            :key="character.id"
            :character="character"
            :ownership="getOwnership(character.id)"
            :selected="selectedCharacter?.id === character.id"
            :show-tier="false"
            :show-name="true"
            :game-mode="gameMode"
            size="md"
            class="animate-scale-in"
            :style="{ animationDelay: `${index * 0.03}s` }"
            @click="emit('select', character)"
          />
        </div>
      </div>
    </template>
  </div>
</template>
