<script setup lang="ts">
import { ref, computed } from 'vue';
import CharacterCard from './CharacterCard.vue';
import OwnershipToggle from './OwnershipToggle.vue';
import { characters } from '../data';
import { getTierData } from '../data/tierData';
import { useRouteState } from '../composables/useRouteState';
import type { Character, UserCharacterInvestment, OwnershipStatus, TierRating, Role } from '../types';

const props = defineProps<{
  roster: Map<string, UserCharacterInvestment>;
  gameMode: 'moc' | 'pf' | 'as';
}>();

const emit = defineEmits<{
  'toggle-ownership': [characterId: string, newStatus: OwnershipStatus];
  'select-character': [character: Character];
}>();

const { setViewMode } = useRouteState();

// Internal state
const groupBy = ref<'element' | 'path' | 'rarity' | 'role' | 'ownership'>('element');
const sortBy = ref<'tier' | 'name'>('tier');
const searchQuery = ref('');

// Helper: get ownership status for a character
const getOwnership = (charId: string): OwnershipStatus => {
  const inv = props.roster.get(charId);
  return inv?.ownership ?? 'none';
};

// Cycle ownership on right-click / long-press: none → owned → concept → none
const cycleOwnership = (charId: string) => {
  const current = getOwnership(charId);
  const next: OwnershipStatus =
    current === 'none' ? 'owned' :
    current === 'owned' ? 'concept' : 'none';
  emit('toggle-ownership', charId, next);
};

// Long-press handling for mobile ownership toggle
const longPressTimer = ref<ReturnType<typeof setTimeout> | null>(null);
const longPressCharacterId = ref<string | null>(null);
const longPressTriggered = ref(false);

const handleTouchStart = (characterId: string) => {
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value);
  }
  longPressCharacterId.value = characterId;
  longPressTriggered.value = false;
  longPressTimer.value = setTimeout(() => {
    longPressTriggered.value = true;
    cycleOwnership(characterId);
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
    longPressTimer.value = null;
    longPressCharacterId.value = null;
  }, 300);
};

const handleTouchEnd = () => {
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value);
    longPressTimer.value = null;
  }
  longPressCharacterId.value = null;
};

const handleTouchMove = () => {
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value);
    longPressTimer.value = null;
  }
  longPressCharacterId.value = null;
};

const handleCardClick = (char: Character) => {
  if (longPressTriggered.value) {
    longPressTriggered.value = false;
    return;
  }
  emit('select-character', char);
};

// Element colors
const elementColors: Record<string, string> = {
  Physical: '#c4c4c4',
  Fire: '#f4634e',
  Ice: '#47c7fd',
  Lightning: '#d376f0',
  Wind: '#5fe8b6',
  Quantum: '#625afa',
  Imaginary: '#f3d86b',
};

// Tier ordering for sorting
const tierOrder: TierRating[] = ['T-1', 'T-0.5', 'T0', 'T0.5', 'T1', 'T1.5', 'T2', 'T3', 'T4', 'T5'];

// Get best tier index for a character in current game mode
function getBestTierIndex(char: Character): number {
  const tierData = getTierData(char.id);
  if (!tierData) return tierOrder.length; // no data = end

  const modeData = tierData[props.gameMode];
  if (!modeData) return tierOrder.length;

  // Find the best (lowest index) tier across all roles for this mode
  let bestIndex = tierOrder.length;
  for (const role of Object.keys(modeData) as Role[]) {
    const tier = modeData[role];
    if (tier) {
      const idx = tierOrder.indexOf(tier);
      if (idx !== -1 && idx < bestIndex) {
        bestIndex = idx;
      }
    }
  }
  return bestIndex;
}

// Stats
const stats = computed(() => {
  const total = characters.length;
  let owned = 0;
  let planned = 0;
  for (const char of characters) {
    const o = getOwnership(char.id);
    if (o === 'owned') owned++;
    else if (o === 'concept') planned++;
  }
  return { total, owned, planned, unowned: total - owned - planned };
});

// Sort comparator for characters within a group
function sortCharacters(a: Character, b: Character): number {
  if (sortBy.value === 'tier') {
    const aTier = getBestTierIndex(a);
    const bTier = getBestTierIndex(b);
    if (aTier !== bTier) return aTier - bTier;
    return a.name.localeCompare(b.name);
  }
  return a.name.localeCompare(b.name);
}

// Ownership label helper
function getOwnershipLabel(status: OwnershipStatus): string {
  if (status === 'owned') return 'Owned';
  if (status === 'concept') return 'Planned';
  return 'Not Owned';
}

// Group ordering definitions
const elementOrder = ['Fire', 'Ice', 'Imaginary', 'Lightning', 'Physical', 'Quantum', 'Wind'];
const pathOrder = ['Abundance', 'Destruction', 'Erudition', 'Harmony', 'Hunt', 'Nihility', 'Preservation', 'Remembrance'];
const rarityOrder = ['5-Star', '4-Star'];
const roleOrder: string[] = ['DPS', 'Support DPS', 'Amplifier', 'Sustain'];
const ownershipOrder = ['Owned', 'Planned', 'Not Owned'];

// Grouped and sorted characters
const groupedCharacters = computed(() => {
  // Step 1: Filter by search
  const query = searchQuery.value.toLowerCase().trim();
  const filtered = query
    ? characters.filter(c => c.name.toLowerCase().includes(query))
    : [...characters];

  // Step 2: Group
  const groups = new Map<string, Character[]>();

  for (const char of filtered) {
    let groupName: string;
    switch (groupBy.value) {
      case 'element':
        groupName = char.element;
        break;
      case 'path':
        groupName = char.path;
        break;
      case 'rarity':
        groupName = char.rarity === 5 ? '5-Star' : '4-Star';
        break;
      case 'role':
        groupName = char.roles[0] ?? 'Other';
        break;
      case 'ownership':
        groupName = getOwnershipLabel(getOwnership(char.id));
        break;
      default:
        groupName = 'Other';
    }

    if (!groups.has(groupName)) {
      groups.set(groupName, []);
    }
    groups.get(groupName)!.push(char);
  }

  // Step 3: Sort within each group
  for (const chars of groups.values()) {
    chars.sort(sortCharacters);
  }

  // Step 4: Determine group order
  let orderedKeys: string[];
  switch (groupBy.value) {
    case 'element':
      orderedKeys = elementOrder.filter(k => groups.has(k));
      break;
    case 'path':
      orderedKeys = pathOrder.filter(k => groups.has(k));
      break;
    case 'rarity':
      orderedKeys = rarityOrder.filter(k => groups.has(k));
      break;
    case 'role':
      orderedKeys = roleOrder.filter(k => groups.has(k));
      break;
    case 'ownership':
      orderedKeys = ownershipOrder.filter(k => groups.has(k));
      break;
    default:
      orderedKeys = [...groups.keys()].sort();
  }

  // Step 5: Build result
  return orderedKeys.map(name => ({
    name,
    color: groupBy.value === 'element' ? (elementColors[name] ?? '#f99307') : '#f99307',
    characters: groups.get(name)!,
  }));
});
</script>

<template>
  <div class="animate-fade-in">
    <!-- Sticky header -->
    <div class="bg-void-950/95 backdrop-blur-xl border-b border-white/5 sticky top-0 z-40 px-4 md:px-6 lg:px-8 py-4 space-y-3">
      <!-- Row 1: Back + Title + Dropdowns -->
      <div class="flex flex-wrap items-center justify-between gap-2 sm:gap-4">
        <div class="flex items-center gap-3">
          <button
            @click="setViewMode('characters')"
            class="text-white/40 hover:text-white/70 transition-colors text-sm"
          >
            &larr; Back
          </button>
          <h1 class="font-display text-lg font-bold text-white">Roster Management</h1>
        </div>
        <div class="flex items-center gap-2">
          <select
            v-model="groupBy"
            class="bg-void-800/50 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-body text-white/80 focus:outline-none focus:border-stellar-500/50"
          >
            <option value="element">Group by Element</option>
            <option value="path">Group by Path</option>
            <option value="rarity">Group by Rarity</option>
            <option value="role">Group by Role</option>
            <option value="ownership">Group by Ownership</option>
          </select>
          <select
            v-model="sortBy"
            class="bg-void-800/50 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-body text-white/80 focus:outline-none focus:border-stellar-500/50"
          >
            <option value="tier">Sort by Tier</option>
            <option value="name">Sort by Name</option>
          </select>
        </div>
      </div>

      <!-- Row 2: Stats -->
      <div class="flex items-center gap-4 text-xs font-mono">
        <span class="text-white/50">{{ stats.total }} total</span>
        <span class="flex items-center gap-1">
          <span class="w-1.5 h-1.5 rounded-full bg-stellar-400"></span>
          <span class="text-stellar-400">{{ stats.owned }} owned</span>
        </span>
        <span class="flex items-center gap-1">
          <span class="w-1.5 h-1.5 rounded-full bg-nebula-400"></span>
          <span class="text-nebula-400">{{ stats.planned }} planned</span>
        </span>
        <span class="flex items-center gap-1">
          <span class="w-1.5 h-1.5 rounded-full bg-white/30"></span>
          <span class="text-white/40">{{ stats.unowned }} unowned</span>
        </span>
      </div>

      <!-- Hint -->
      <p class="text-[11px] text-white/30 font-body">Right-click or long-press to quickly cycle ownership</p>

      <!-- Row 3: Search -->
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search characters..."
        class="w-full bg-void-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm font-body text-white/90 placeholder-white/30 focus:outline-none focus:border-stellar-500/50 transition-colors"
      />
    </div>

    <!-- Content area -->
    <div class="px-4 md:px-6 lg:px-8 py-6 pb-20 md:pb-8 space-y-8">
      <!-- Groups -->
      <section v-for="group in groupedCharacters" :key="group.name">
        <!-- Group header -->
        <div class="flex items-center gap-2 mb-3">
          <div class="w-2 h-2 rounded-full" :style="{ background: group.color }"></div>
          <h2 class="font-display text-sm font-bold text-white/90 uppercase tracking-wide">{{ group.name }}</h2>
          <span class="text-xs font-mono text-white/40">({{ group.characters.length }})</span>
          <div class="flex-1 h-px bg-white/5"></div>
        </div>

        <!-- Character grid -->
        <div class="grid gap-x-4 gap-y-5" style="grid-template-columns: repeat(auto-fill, minmax(92px, 1fr))">
          <div
            v-for="char in group.characters"
            :key="char.id"
            class="flex flex-col items-center gap-1.5"
            @contextmenu.prevent="cycleOwnership(char.id)"
            @touchstart.passive="handleTouchStart(char.id)"
            @touchend="handleTouchEnd"
            @touchmove.passive="handleTouchMove"
            @touchcancel="handleTouchEnd"
          >
            <CharacterCard
              :character="char"
              :ownership="getOwnership(char.id)"
              size="md"
              :class="{ 'scale-95 opacity-70': longPressCharacterId === char.id }"
              @click="handleCardClick(char)"
            />
            <p class="text-xs font-body text-white/80 text-center truncate w-full max-w-[88px]">{{ char.name }}</p>
            <OwnershipToggle
              :status="getOwnership(char.id)"
              :character-name="char.name"
              @update:status="(s: OwnershipStatus) => emit('toggle-ownership', char.id, s)"
            />
          </div>
        </div>
      </section>

      <!-- Empty state -->
      <div v-if="groupedCharacters.length === 0" class="text-center py-16">
        <p class="text-white/40 text-sm font-body">No characters found matching "{{ searchQuery }}"</p>
      </div>
    </div>
  </div>
</template>
