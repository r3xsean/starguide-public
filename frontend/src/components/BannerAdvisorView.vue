<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Character, TeammateRating, BannerRating, TierRating, UserCharacterInvestment } from '../types';
import CharacterCard from './CharacterCard.vue';
import { getActiveBanners, getBannerStatus, formatBannerDateRange } from '../data/bannerData';
import { getTierData } from '../data/tierData';
import { getTeammatesForComposition } from '../utils/characterUtils';

// ==================
// PROPS
// ==================

interface Props {
  characters: Character[];
  ownedCharacters: Character[];
  getOwnership: (id: string) => 'owned' | 'concept' | 'none';
  getInvestment: (id: string) => UserCharacterInvestment | undefined;
  gameMode: 'moc' | 'pf' | 'as';
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'select-character': [characterId: string];
}>();

// ==================
// STATE
// ==================

const selectedBannerId = ref<string | null>(null);

// ==================
// TYPES
// ==================

interface GroupedBannerAnalysis {
  characterId: string;
  character: Character | null;
  isNew: boolean;
  owned: boolean;
  rating: BannerRating;
  score: number;
  wantedBy: { name: string; rating: TeammateRating; tier: TierRating; asSubDPS?: boolean }[];
  reasoning: string[];
  roleCategory: 'dps' | 'support';  // Which category this character belongs to
}

// ==================
// HELPERS
// ==================

// Get best tier for a character
function getBestTier(characterId: string, gameMode: 'moc' | 'pf' | 'as'): TierRating {
  const tierData = getTierData(characterId);
  if (!tierData) return 'T2';
  const modeData = tierData[gameMode];
  if (!modeData) return 'T2';
  const tiers = Object.values(modeData).filter(Boolean) as TierRating[];
  if (tiers.length === 0) return 'T2';
  const tierOrder: TierRating[] = ['T-1', 'T-0.5', 'T0', 'T0.5', 'T1', 'T1.5', 'T2', 'T3', 'T4', 'T5'];
  return tiers.reduce((best, current) =>
    tierOrder.indexOf(current) < tierOrder.indexOf(best) ? current : best
  );
}

// Determine if a character is DPS or Support
function isDPSCharacter(char: Character): boolean {
  return char.roles.includes('DPS') || char.roles.includes('Support DPS');
}

// Calculate most significant eidolon requirement from investment modifiers
function getEidolonRequirement(theirInvestmentModifiers?: { level: 1 | 2 | 3 | 4 | 5 | 6; modifier: number; reason?: string }[]): number | undefined {
  if (!theirInvestmentModifiers || theirInvestmentModifiers.length === 0) return undefined;

  const mostSignificant = theirInvestmentModifiers
    .filter(mod => mod.modifier !== 0)
    .sort((a, b) => Math.abs(b.modifier) - Math.abs(a.modifier))[0];

  return mostSignificant?.level;
}

// Tier weights
const TIER_WEIGHTS: Record<TierRating, number> = {
  'T-1': 3.5, 'T-0.5': 3.25, 'T0': 3.0, 'T0.5': 2.5, 'T1': 2.0, 'T1.5': 1.5,
  'T2': 1.2, 'T3': 0.9, 'T4': 0.6, 'T5': 0.3,
};

// Synergy rating weights
const SYNERGY_WEIGHTS: Record<TeammateRating, number> = { 'S+': 3.5, S: 3.0, A: 2.0, B: 1.2, C: 0.6, D: 0.2 };

// Calculate rating with eidolon multipliers
function calculatePullRating(
  wantedBy: { name: string; rating: TeammateRating; tier: TierRating; eidolonRequirement?: number; currentEidolon?: number }[]
): { rating: BannerRating; score: number } {
  if (wantedBy.length === 0) return { rating: 'D', score: 0 };

  let weightedSum = 0;
  for (const w of wantedBy) {
    const tierWeight = TIER_WEIGHTS[w.tier] || 1.0;
    const synergyWeight = SYNERGY_WEIGHTS[w.rating] || 1.0;

    // Calculate eidolon multiplier based on pulls needed
    // Unowned (currentEidolon = 0): base character + all eidolons = (1 + eidolonRequirement)
    // Owned: only remaining eidolons = (eidolonRequirement - currentEidolon)
    // Example: Need E6 but have E2 → 6 - 2 = 4 pulls needed (E3,E4,E5,E6)
    let eidolonMultiplier = 1;
    if (w.eidolonRequirement) {
      const currentEidolon = w.currentEidolon ?? 0;
      if (currentEidolon === 0) {
        // Unowned: base character + all eidolons to requirement
        eidolonMultiplier = 1 + w.eidolonRequirement;
      } else {
        // Owned: only the remaining eidolons
        eidolonMultiplier = w.eidolonRequirement - currentEidolon;
      }
    }

    weightedSum += tierWeight * synergyWeight * eidolonMultiplier;
  }

  const ratingOrder: TeammateRating[] = ['S+', 'S', 'A', 'B', 'C', 'D'];
  const bestRating = wantedBy.reduce((best, w) => {
    return ratingOrder.indexOf(w.rating) < ratingOrder.indexOf(best) ? w.rating : best;
  }, 'D' as TeammateRating);

  const qualityMultipliers: Record<TeammateRating, number> = { 'S+': 1.1, S: 1.0, A: 0.85, B: 0.65, C: 0.4, D: 0.2 };
  const finalScore = weightedSum * qualityMultipliers[bestRating];

  let rating: BannerRating;
  if (finalScore >= 16) rating = 'S';
  else if (finalScore >= 12) rating = 'S-';
  else if (finalScore >= 9) rating = 'A+';
  else if (finalScore >= 7) rating = 'A';
  else if (finalScore >= 5) rating = 'A-';
  else if (finalScore >= 3.5) rating = 'B+';
  else if (finalScore >= 2.5) rating = 'B';
  else if (finalScore >= 1.5) rating = 'B-';
  else if (finalScore >= 1.0) rating = 'C+';
  else if (finalScore >= 0.5) rating = 'C';
  else if (finalScore >= 0.25) rating = 'C-';
  else rating = 'D';

  return { rating, score: finalScore };
}

// Get base rating letter for CSS class
const getBaseRating = (rating: string): string => {
  return rating.charAt(0).toLowerCase();
};

// ==================
// COMPUTED
// ==================

const activeBanners = computed(() => getActiveBanners());

const selectedBanner = computed(() => {
  if (selectedBannerId.value) {
    return activeBanners.value.find(b => b.id === selectedBannerId.value);
  }
  return activeBanners.value[0];
});

// Get owned DPS characters
const ownedDPS = computed(() =>
  props.ownedCharacters.filter(c => isDPSCharacter(c))
);

// Get owned support characters
const ownedSupports = computed(() =>
  props.ownedCharacters.filter(c => !isDPSCharacter(c))
);

// Calculate rating for a SUPPORT banner character (rated by owned DPS wanting them)
function calculateSupportAnalysis(bannerChar: Character): {
  rating: BannerRating;
  score: number;
  wantedBy: { name: string; rating: TeammateRating; tier: TierRating; eidolonRequirement?: number; currentEidolon?: number }[];
  reasoning: string[];
} {
  const wantedBy: { name: string; rating: TeammateRating; tier: TierRating; eidolonRequirement?: number; currentEidolon?: number }[] = [];
  const reasoning: string[] = [];

  // Check if banner character is owned
  const isOwned = props.getOwnership(bannerChar.id) !== 'none';
  const currentEidolon = isOwned ? (props.getInvestment(bannerChar.id)?.eidolonLevel ?? 0) : 0;

  // Check which owned DPS want this support
  for (const dps of ownedDPS.value) {
    const dpsTier = getBestTier(dps.id, props.gameMode);

    // Use composition-aware teammate lookup
    const dpsTeammates = getTeammatesForComposition(dps);
    const supportRecs = [
      ...(dpsTeammates.amplifiers || []),
      ...(dpsTeammates.sustains || []),
      ...(dpsTeammates.subDPS || []),
    ];
    const rec = supportRecs.find(r => r.id === bannerChar.id);
    if (rec && ['S', 'A', 'B', 'C', 'D'].includes(rec.rating)) {
      const eidolonRequirement = getEidolonRequirement(rec.theirInvestmentModifiers);

      // Filter logic: if owned, only include if needs higher eidolon
      if (isOwned) {
        if (!eidolonRequirement || currentEidolon >= eidolonRequirement) {
          continue; // Already have required eidolon
        }
      }

      wantedBy.push({
        name: dps.name,
        rating: rec.rating,
        tier: dpsTier,
        eidolonRequirement,
        currentEidolon
      });
    }
  }

  const ratingOrder: TeammateRating[] = ['S', 'A', 'B', 'C', 'D'];
  wantedBy.sort((a, b) => ratingOrder.indexOf(a.rating) - ratingOrder.indexOf(b.rating));

  const { rating, score } = calculatePullRating(wantedBy);

  const sCount = wantedBy.filter(w => w.rating === 'S').length;
  const aCount = wantedBy.filter(w => w.rating === 'A').length;

  if (sCount > 0) {
    reasoning.push(`S-tier pick for ${sCount} DPS`);
  }
  if (aCount > 0) {
    reasoning.push(`A-tier pick for ${aCount} DPS`);
  }
  if (wantedBy.length === 0) {
    reasoning.push('None of your DPS want this character');
  }

  return { rating, score, wantedBy, reasoning };
}

// Calculate rating for a DPS banner character (rated by owned supports AND owned DPS wanting them as sub-DPS)
function calculateDPSAnalysis(bannerChar: Character): {
  rating: BannerRating;
  score: number;
  wantedBy: { name: string; rating: TeammateRating; tier: TierRating; asSubDPS?: boolean; eidolonRequirement?: number; currentEidolon?: number }[];
  reasoning: string[];
} {
  const wantedBy: { name: string; rating: TeammateRating; tier: TierRating; asSubDPS?: boolean; eidolonRequirement?: number; currentEidolon?: number }[] = [];
  const reasoning: string[] = [];

  // Check if banner character is owned
  const isOwned = props.getOwnership(bannerChar.id) !== 'none';
  const currentEidolon = isOwned ? (props.getInvestment(bannerChar.id)?.eidolonLevel ?? 0) : 0;

  // Check which owned supports want this DPS
  for (const support of ownedSupports.value) {
    const supportTier = getBestTier(support.id, props.gameMode);

    // Use composition-aware teammate lookup
    const supportTeammates = getTeammatesForComposition(support);
    const dpsRecs = supportTeammates.dps || [];
    const rec = dpsRecs.find(r => r.id === bannerChar.id);
    if (rec && ['S', 'A', 'B', 'C', 'D'].includes(rec.rating)) {
      const eidolonRequirement = getEidolonRequirement(rec.theirInvestmentModifiers);

      // Filter logic: if owned, only include if needs higher eidolon
      if (isOwned) {
        if (!eidolonRequirement || currentEidolon >= eidolonRequirement) {
          continue; // Already have required eidolon
        }
      }

      wantedBy.push({
        name: support.name,
        rating: rec.rating,
        tier: supportTier,
        eidolonRequirement,
        currentEidolon
      });
    }
  }

  // Also check which owned DPS want this character as a sub-DPS
  for (const dps of ownedDPS.value) {
    const dpsTier = getBestTier(dps.id, props.gameMode);

    // Use composition-aware teammate lookup
    const dpsTeammates = getTeammatesForComposition(dps);
    const subDPSRecs = dpsTeammates.subDPS || [];
    const rec = subDPSRecs.find(r => r.id === bannerChar.id);
    if (rec && ['S', 'A', 'B', 'C', 'D'].includes(rec.rating)) {
      const eidolonRequirement = getEidolonRequirement(rec.theirInvestmentModifiers);

      // Filter logic: if owned, only include if needs higher eidolon
      if (isOwned) {
        if (!eidolonRequirement || currentEidolon >= eidolonRequirement) {
          continue; // Already have required eidolon
        }
      }

      wantedBy.push({
        name: dps.name,
        rating: rec.rating,
        tier: dpsTier,
        asSubDPS: true,
        eidolonRequirement,
        currentEidolon
      });
    }
  }

  const ratingOrder: TeammateRating[] = ['S', 'A', 'B', 'C', 'D'];
  wantedBy.sort((a, b) => ratingOrder.indexOf(a.rating) - ratingOrder.indexOf(b.rating));

  const { rating, score } = calculatePullRating(wantedBy);

  const supportWants = wantedBy.filter(w => !w.asSubDPS);
  const dpsWants = wantedBy.filter(w => w.asSubDPS);

  const sCountSupport = supportWants.filter(w => w.rating === 'S').length;
  const aCountSupport = supportWants.filter(w => w.rating === 'A').length;
  const sCountDPS = dpsWants.filter(w => w.rating === 'S').length;
  const aCountDPS = dpsWants.filter(w => w.rating === 'A').length;

  if (sCountSupport > 0) {
    reasoning.push(`S-tier DPS for ${sCountSupport} support${sCountSupport > 1 ? 's' : ''}`);
  }
  if (aCountSupport > 0) {
    reasoning.push(`A-tier DPS for ${aCountSupport} support${aCountSupport > 1 ? 's' : ''}`);
  }
  if (sCountDPS > 0) {
    reasoning.push(`S-tier sub-DPS for ${sCountDPS} DPS`);
  }
  if (aCountDPS > 0) {
    reasoning.push(`A-tier sub-DPS for ${aCountDPS} DPS`);
  }
  if (wantedBy.length === 0) {
    reasoning.push('None of your characters specifically want this DPS');
  }

  return { rating, score, wantedBy, reasoning };
}

// Process all banner characters and group by role
const bannerAnalysis = computed(() => {
  if (!selectedBanner.value) return { supports: [], dps: [] };

  const supports: GroupedBannerAnalysis[] = [];
  const dps: GroupedBannerAnalysis[] = [];

  for (const featured of selectedBanner.value.featured5Star) {
    const char = props.characters.find(c => c.id === featured.id);
    const owned = char ? props.getOwnership(char.id) !== 'none' : false;

    // Handle already owned
    if (owned) {
      const analysis: GroupedBannerAnalysis = {
        characterId: featured.id,
        character: char || null,
        isNew: featured.isNew,
        owned: true,
        rating: 'D' as BannerRating,
        score: 0,
        wantedBy: [],
        reasoning: ['You already own this character'],
        roleCategory: char && isDPSCharacter(char) ? 'dps' : 'support',
      };
      if (char && isDPSCharacter(char)) {
        dps.push(analysis);
      } else {
        supports.push(analysis);
      }
      continue;
    }

    // Handle missing character data
    if (!char) {
      const analysis: GroupedBannerAnalysis = {
        characterId: featured.id,
        character: null,
        isNew: featured.isNew,
        owned: false,
        rating: 'C' as BannerRating,
        score: 0,
        wantedBy: [],
        reasoning: ['Character data not yet available'],
        roleCategory: 'support', // Default to support if unknown
      };
      supports.push(analysis);
      continue;
    }

    // Categorize and calculate appropriate rating
    if (isDPSCharacter(char)) {
      const { rating, score, wantedBy, reasoning } = calculateDPSAnalysis(char);
      dps.push({
        characterId: char.id,
        character: char,
        isNew: featured.isNew,
        owned: false,
        rating,
        score,
        wantedBy,
        reasoning,
        roleCategory: 'dps',
      });
    } else {
      const { rating, score, wantedBy, reasoning } = calculateSupportAnalysis(char);
      supports.push({
        characterId: char.id,
        character: char,
        isNew: featured.isNew,
        owned: false,
        rating,
        score,
        wantedBy,
        reasoning,
        roleCategory: 'support',
      });
    }
  }

  // Sort each group by score descending
  supports.sort((a, b) => b.score - a.score);
  dps.sort((a, b) => b.score - a.score);

  return { supports, dps };
});
</script>

<template>
  <div class="banner-advisor-view">
    <!-- Header -->
    <header class="view-header" data-onboarding="banner-advisor-header">
      <div class="header-content">
        <div class="celestial-icon">
          <div class="celestial-ring celestial-ring-1"></div>
          <div class="celestial-ring celestial-ring-2"></div>
          <span class="celestial-star">✦</span>
        </div>
        <div class="header-text">
          <h1 class="header-title">Banner Advisor</h1>
          <p class="header-subtitle">Ratings based on synergy with your {{ ownedCharacters.length }} characters</p>
        </div>
      </div>
      <p class="banner-disclaimer">
        Note: This only considers how well banner characters synergize with your existing roster.
        It doesn't account for building entirely new team archetypes.
      </p>
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
        You need at least 4 owned characters to generate banner recommendations.<br />
        Right-click characters in the sidebar to mark them as owned.
      </p>
    </div>

    <!-- Main Content -->
    <div v-else class="banner-content">
      <!-- Banner Timeline Selector -->
      <div class="banner-timeline">
        <button
          v-for="banner in activeBanners"
          :key="banner.id"
          @click="selectedBannerId = banner.id"
          class="timeline-node"
          :class="{
            current: getBannerStatus(banner) === 'current',
            selected: selectedBanner?.id === banner.id
          }"
        >
          <span class="node-status" v-if="getBannerStatus(banner) === 'current'">LIVE</span>
          <span class="node-date">{{ formatBannerDateRange(banner) }}</span>
          <span class="node-name">{{ banner.name }}</span>
          <div class="node-characters">
            <span v-for="char in banner.featured5Star.slice(0, 3)" :key="char.id" class="node-char-dot"></span>
            <span v-if="banner.featured5Star.length > 3" class="node-char-more">+{{ banner.featured5Star.length - 3 }}</span>
          </div>
        </button>
      </div>

      <!-- Grouped Character Analysis -->
      <div v-if="selectedBanner" class="banner-groups">
        <!-- Supports Section -->
        <div v-if="bannerAnalysis.supports.length > 0" class="banner-group">
          <div class="group-header support-header">
            <div class="group-icon">✨</div>
            <div class="group-title-area">
              <h3 class="group-title">Supports on This Banner</h3>
              <p class="group-subtitle">Rated by how much your {{ ownedDPS.length }} owned DPS want them</p>
            </div>
            <span class="group-count">{{ bannerAnalysis.supports.length }}</span>
          </div>

          <div class="banner-grid">
            <div
              v-for="(rec, index) in bannerAnalysis.supports"
              :key="rec.characterId"
              class="banner-card"
              :class="[`rating-${getBaseRating(rec.rating)}`, { owned: rec.owned, clickable: rec.character }]"
              :style="{ '--index': index }"
              @click="rec.character && emit('select-character', rec.character.id)"
            >
              <!-- NEW Badge -->
              <span v-if="rec.isNew && !rec.owned" class="new-badge">NEW</span>

              <!-- Rating Badge -->
              <div class="rating-badge" :class="`rating-${getBaseRating(rec.rating)}`">
                {{ rec.rating }}
              </div>

              <!-- Character Portrait -->
              <div class="banner-card-portrait">
                <CharacterCard
                  v-if="rec.character"
                  :character="rec.character"
                  :ownership="rec.owned ? 'owned' : 'none'"
                  :show-tier="true"
                  size="lg"
                />
                <div v-else class="placeholder-portrait">
                  <span class="placeholder-icon">?</span>
                  <span class="placeholder-id">{{ rec.characterId }}</span>
                </div>
              </div>

              <!-- Character Name -->
              <div class="banner-card-name">
                {{ rec.character?.name || rec.characterId }}
              </div>

              <!-- Detailed Breakdown -->
              <div class="banner-card-details">
                <!-- Wanted By -->
                <div v-if="rec.wantedBy.length > 0" class="detail-section">
                  <span class="detail-label">Wanted by your DPS:</span>
                  <div class="wanted-chips">
                    <span
                      v-for="w in rec.wantedBy"
                      :key="w.name"
                      class="chip"
                      :class="w.rating"
                    >
                      {{ w.name }} <span class="chip-rating">{{ w.rating }}</span>
                    </span>
                  </div>
                </div>

                <!-- Reasoning -->
                <ul class="reasoning-list">
                  <li v-for="(reason, i) in rec.reasoning.slice(0, 3)" :key="i">{{ reason }}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <!-- DPS Section -->
        <div v-if="bannerAnalysis.dps.length > 0" class="banner-group">
          <div class="group-header dps-header">
            <div class="group-icon">⚔️</div>
            <div class="group-title-area">
              <h3 class="group-title">DPS on This Banner</h3>
              <p class="group-subtitle">Rated by supports wanting them + DPS wanting them as sub-DPS</p>
            </div>
            <span class="group-count">{{ bannerAnalysis.dps.length }}</span>
          </div>

          <div class="banner-grid">
            <div
              v-for="(rec, index) in bannerAnalysis.dps"
              :key="rec.characterId"
              class="banner-card"
              :class="[`rating-${getBaseRating(rec.rating)}`, { owned: rec.owned, clickable: rec.character }]"
              :style="{ '--index': index }"
              @click="rec.character && emit('select-character', rec.character.id)"
            >
              <!-- NEW Badge -->
              <span v-if="rec.isNew && !rec.owned" class="new-badge">NEW</span>

              <!-- Rating Badge -->
              <div class="rating-badge" :class="`rating-${getBaseRating(rec.rating)}`">
                {{ rec.rating }}
              </div>

              <!-- Character Portrait -->
              <div class="banner-card-portrait">
                <CharacterCard
                  v-if="rec.character"
                  :character="rec.character"
                  :ownership="rec.owned ? 'owned' : 'none'"
                  :show-tier="true"
                  size="lg"
                />
                <div v-else class="placeholder-portrait">
                  <span class="placeholder-icon">?</span>
                  <span class="placeholder-id">{{ rec.characterId }}</span>
                </div>
              </div>

              <!-- Character Name -->
              <div class="banner-card-name">
                {{ rec.character?.name || rec.characterId }}
              </div>

              <!-- Detailed Breakdown -->
              <div class="banner-card-details">
                <!-- Wanted By -->
                <div v-if="rec.wantedBy.length > 0" class="detail-section">
                  <span class="detail-label">Wanted by:</span>
                  <div class="wanted-chips">
                    <span
                      v-for="w in rec.wantedBy"
                      :key="w.name + (w.asSubDPS ? '-subdps' : '')"
                      class="chip"
                      :class="[w.rating, { 'subdps-chip': w.asSubDPS }]"
                    >
                      {{ w.name }}
                      <span v-if="w.asSubDPS" class="subdps-tag">sub</span>
                      <span class="chip-rating">{{ w.rating }}</span>
                    </span>
                  </div>
                </div>

                <!-- Reasoning -->
                <ul class="reasoning-list">
                  <li v-for="(reason, i) in rec.reasoning.slice(0, 4)" :key="i">{{ reason }}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty State for no characters on banner -->
        <div v-if="bannerAnalysis.supports.length === 0 && bannerAnalysis.dps.length === 0" class="no-chars-state">
          <span class="no-chars-icon">?</span>
          <p>No character data available for this banner yet.</p>
        </div>
      </div>

      <!-- Legend -->
      <div class="banner-legend">
        <div class="legend-row">
          <div class="legend-item">
            <span class="legend-badge rating-s">S</span>
            <span>Excellent</span>
          </div>
          <div class="legend-item">
            <span class="legend-badge rating-a">A</span>
            <span>Strong</span>
          </div>
          <div class="legend-item">
            <span class="legend-badge rating-b">B</span>
            <span>Good</span>
          </div>
          <div class="legend-item">
            <span class="legend-badge rating-c">C</span>
            <span>Some</span>
          </div>
          <div class="legend-item">
            <span class="legend-badge rating-d">D</span>
            <span>None</span>
          </div>
        </div>
        <p class="legend-note">Ratings include +/- modifiers for finer granularity (e.g., A+, A, A-)</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Header */
.view-header {
  margin-bottom: 1.5rem;
}

.header-content {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.celestial-icon {
  position: relative;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
}

.celestial-ring {
  position: absolute;
  inset: 0;
  border: 1px solid rgba(251, 191, 36, 0.3);
  border-radius: 50%;
}

.celestial-ring-1 {
  animation: celestial-pulse 3s ease-in-out infinite;
}

.celestial-ring-2 {
  inset: 6px;
  animation: celestial-pulse 3s ease-in-out infinite 0.5s;
}

@keyframes celestial-pulse {
  0%, 100% { transform: scale(1); opacity: 0.3; }
  50% { transform: scale(1.1); opacity: 0.6; }
}

.celestial-star {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  color: rgb(251, 191, 36);
  text-shadow: 0 0 20px rgba(251, 191, 36, 0.5);
}

.header-text .header-title {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 700;
  color: white;
}

.header-text .header-subtitle {
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 0.25rem;
}

.banner-disclaimer {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
  font-style: italic;
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 0.5rem;
  border-left: 2px solid rgba(251, 191, 36, 0.4);
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

/* Banner Content */
.banner-content {
  animation: section-enter 0.5s ease-out;
}

@keyframes section-enter {
  from { opacity: 0; transform: translateY(15px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Banner Timeline */
.banner-timeline {
  display: flex;
  gap: 0.75rem;
  padding: 1rem;
  background: linear-gradient(135deg, rgba(20, 20, 50, 0.8), rgba(30, 20, 60, 0.6));
  border-radius: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 1.5rem;
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
}

.banner-timeline::-webkit-scrollbar {
  height: 4px;
}

.banner-timeline::-webkit-scrollbar-track {
  background: transparent;
}

.banner-timeline::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}

.timeline-node {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem 1.25rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.75rem;
  cursor: pointer;
  transition: all 0.3s ease;
  min-width: 140px;
  position: relative;
}

.timeline-node:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.15);
}

.timeline-node.current {
  border-color: rgba(34, 197, 94, 0.4);
  background: rgba(34, 197, 94, 0.08);
}

.timeline-node.current:hover {
  background: rgba(34, 197, 94, 0.12);
}

.timeline-node.selected {
  border-color: rgba(99, 102, 241, 0.6);
  background: rgba(99, 102, 241, 0.15);
  box-shadow: 0 0 20px rgba(99, 102, 241, 0.2);
}

.node-status {
  position: absolute;
  top: -8px;
  right: 8px;
  font-size: 0.5rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  padding: 0.2rem 0.4rem;
  background: rgb(34, 197, 94);
  color: white;
  border-radius: 0.25rem;
  animation: live-pulse 2s ease-in-out infinite;
}

@keyframes live-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.node-date {
  font-size: 0.6875rem;
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  color: rgba(255, 255, 255, 0.5);
}

.node-name {
  font-size: 0.8125rem;
  font-weight: 600;
  color: white;
}

.node-characters {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-top: 0.25rem;
}

.node-char-dot {
  width: 6px;
  height: 6px;
  background: rgba(251, 191, 36, 0.6);
  border-radius: 50%;
}

.node-char-more {
  font-size: 0.625rem;
  color: rgba(255, 255, 255, 0.4);
}

/* Banner Groups */
.banner-groups {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.banner-group {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 0.75rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.group-header.support-header {
  border-left: 3px solid rgba(168, 85, 247, 0.6);
  background: linear-gradient(90deg, rgba(168, 85, 247, 0.08) 0%, rgba(255, 255, 255, 0.03) 100%);
}

.group-header.dps-header {
  border-left: 3px solid rgba(239, 68, 68, 0.6);
  background: linear-gradient(90deg, rgba(239, 68, 68, 0.08) 0%, rgba(255, 255, 255, 0.03) 100%);
}

.group-icon {
  font-size: 1.25rem;
  flex-shrink: 0;
}

.group-title-area {
  flex: 1;
  min-width: 0;
}

.group-title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: white;
  margin: 0;
}

.group-subtitle {
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.45);
  margin: 0.125rem 0 0 0;
}

.group-count {
  font-size: 0.75rem;
  font-weight: 600;
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  padding: 0.25rem 0.5rem;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 0.375rem;
  color: rgba(255, 255, 255, 0.6);
}

.no-chars-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 2rem;
  text-align: center;
  color: rgba(255, 255, 255, 0.4);
}

.no-chars-icon {
  font-size: 2rem;
  margin-bottom: 0.75rem;
  opacity: 0.5;
}

/* Banner Cards Grid */
.banner-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.25rem;
}

@media (min-width: 640px) {
  .banner-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1024px) {
  .banner-grid {
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  }
}

/* Banner Card */
.banner-card {
  position: relative;
  background: rgba(20, 20, 45, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 1rem;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  animation: card-enter 0.4s ease-out both;
  animation-delay: calc(var(--index) * 0.08s);
  transition: all 0.3s ease;
}

@keyframes card-enter {
  from { opacity: 0; transform: translateY(15px); }
  to { opacity: 1; transform: translateY(0); }
}

.banner-card:hover {
  border-color: rgba(255, 255, 255, 0.15);
  transform: translateY(-3px);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3);
}

.banner-card.rating-s {
  border-left: 4px solid rgb(255, 149, 0);
  box-shadow: inset 0 0 40px rgba(255, 149, 0, 0.05);
}

.banner-card.rating-s:hover {
  border-color: rgba(255, 149, 0, 0.5);
  box-shadow: 0 12px 32px rgba(255, 149, 0, 0.15), inset 0 0 40px rgba(255, 149, 0, 0.08);
}

.banner-card.rating-a {
  border-left: 4px solid rgb(168, 85, 247);
  box-shadow: inset 0 0 40px rgba(168, 85, 247, 0.03);
}

.banner-card.rating-a:hover {
  border-color: rgba(168, 85, 247, 0.5);
  box-shadow: 0 12px 32px rgba(168, 85, 247, 0.15), inset 0 0 40px rgba(168, 85, 247, 0.06);
}

.banner-card.rating-b {
  border-left: 4px solid rgb(59, 130, 246);
  box-shadow: inset 0 0 40px rgba(59, 130, 246, 0.03);
}

.banner-card.rating-b:hover {
  border-color: rgba(59, 130, 246, 0.5);
}

.banner-card.rating-c {
  border-left: 4px solid rgb(34, 197, 94);
}

.banner-card.rating-d {
  border-left: 4px solid rgb(107, 114, 128);
  opacity: 0.75;
}

.banner-card.rating-d:hover {
  opacity: 0.9;
}

.banner-card.owned {
  opacity: 0.5;
  filter: grayscale(0.4);
}

.banner-card.clickable {
  cursor: pointer;
}

/* NEW Badge */
.banner-card .new-badge {
  position: absolute;
  top: 0.75rem;
  left: 0.75rem;
  font-size: 0.5625rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  padding: 0.25rem 0.5rem;
  background: linear-gradient(135deg, rgb(251, 146, 60), rgb(249, 115, 22));
  color: white;
  border-radius: 0.25rem;
  z-index: 1;
}

/* Rating Badges */
.rating-badge {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  font-family: var(--font-display, 'Orbitron'), sans-serif;
  font-size: 0.875rem;
  font-weight: 700;
  z-index: 1;
}

.rating-badge.rating-s {
  background: linear-gradient(135deg, rgba(255, 149, 0, 0.3), rgba(255, 107, 0, 0.2));
  color: rgb(255, 200, 100);
  border: 1px solid rgba(255, 149, 0, 0.5);
  box-shadow: 0 0 12px rgba(255, 149, 0, 0.3);
}

.rating-badge.rating-a {
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.3), rgba(139, 92, 246, 0.2));
  color: rgb(196, 148, 255);
  border: 1px solid rgba(168, 85, 247, 0.5);
}

.rating-badge.rating-b {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(37, 99, 235, 0.2));
  color: rgb(147, 197, 253);
  border: 1px solid rgba(59, 130, 246, 0.5);
}

.rating-badge.rating-c {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.3), rgba(22, 163, 74, 0.2));
  color: rgb(134, 239, 172);
  border: 1px solid rgba(34, 197, 94, 0.5);
}

.rating-badge.rating-d {
  background: rgba(107, 114, 128, 0.2);
  color: rgb(156, 163, 175);
  border: 1px solid rgba(107, 114, 128, 0.3);
}

/* Character Portrait */
.banner-card-portrait {
  display: flex;
  justify-content: center;
  padding-top: 1rem;
}

.placeholder-portrait {
  width: 80px;
  height: 80px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  border: 1px dashed rgba(255, 255, 255, 0.2);
  border-radius: 1rem;
}

.placeholder-icon {
  font-size: 1.5rem;
  color: rgba(255, 255, 255, 0.3);
}

.placeholder-id {
  font-size: 0.625rem;
  color: rgba(255, 255, 255, 0.3);
  margin-top: 0.25rem;
}

/* Character Name */
.banner-card-name {
  text-align: center;
  font-size: 1rem;
  font-weight: 600;
  color: white;
}

/* Card Details */
.banner-card-details {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-top: 0.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.banner-card .detail-section {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.banner-card .detail-label {
  font-size: 0.625rem;
  color: rgba(255, 255, 255, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Wanted Chips */
.wanted-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.banner-card .chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.05);
  padding: 0.25rem 0.5rem;
  border-radius: 0.375rem;
}

.banner-card .chip.S {
  background: rgba(251, 191, 36, 0.15);
  color: rgb(253, 224, 71);
}

.banner-card .chip.A {
  background: rgba(168, 85, 247, 0.15);
  color: rgb(192, 132, 252);
}

.banner-card .chip.B {
  background: rgba(59, 130, 246, 0.15);
  color: rgb(147, 197, 253);
}

.chip-rating {
  font-size: 0.5625rem;
  font-weight: 700;
  padding: 0.1rem 0.2rem;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 0.2rem;
}

.subdps-chip {
  border: 1px dashed rgba(245, 158, 11, 0.4);
}

.subdps-tag {
  font-size: 0.5rem;
  font-weight: 600;
  padding: 0.05rem 0.2rem;
  background: rgba(245, 158, 11, 0.25);
  color: rgb(251, 191, 36);
  border-radius: 0.15rem;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

/* Reasoning List */
.reasoning-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.reasoning-list li {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
  padding-left: 1rem;
  position: relative;
  margin-bottom: 0.25rem;
  line-height: 1.4;
}

.reasoning-list li::before {
  content: '\2022';
  position: absolute;
  left: 0;
  color: rgba(255, 255, 255, 0.3);
}

/* Banner Legend */
.banner-legend {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  margin-top: 2rem;
  padding-top: 1.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.banner-legend .legend-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 1rem;
}

.banner-legend .legend-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.5);
}

.banner-legend .legend-badge {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.375rem;
  font-size: 0.6875rem;
  font-weight: 700;
}

.banner-legend .legend-note {
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.35);
  font-style: italic;
}

.legend-badge.rating-s {
  background: linear-gradient(135deg, rgba(255, 149, 0, 0.3), rgba(255, 107, 0, 0.2));
  color: rgb(255, 200, 100);
  border: 1px solid rgba(255, 149, 0, 0.4);
}

.legend-badge.rating-a {
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.3), rgba(139, 92, 246, 0.2));
  color: rgb(196, 148, 255);
  border: 1px solid rgba(168, 85, 247, 0.4);
}

.legend-badge.rating-b {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(37, 99, 235, 0.2));
  color: rgb(147, 197, 253);
  border: 1px solid rgba(59, 130, 246, 0.4);
}

.legend-badge.rating-c {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.3), rgba(22, 163, 74, 0.2));
  color: rgb(134, 239, 172);
  border: 1px solid rgba(34, 197, 94, 0.4);
}

.legend-badge.rating-d {
  background: rgba(107, 114, 128, 0.2);
  color: rgb(156, 163, 175);
  border: 1px solid rgba(107, 114, 128, 0.3);
}

/* Mobile Adjustments */
@media (max-width: 480px) {
  .banner-timeline {
    padding: 0.75rem;
    gap: 0.5rem;
  }

  .timeline-node {
    min-width: 120px;
    padding: 0.5rem 0.75rem;
  }

  .banner-card {
    padding: 1rem;
  }
}
</style>
