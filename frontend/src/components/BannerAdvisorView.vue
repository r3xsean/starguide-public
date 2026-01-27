<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Character, TeammateRating, BannerRating, TierRating, UserCharacterInvestment } from '../types';
import RecommendationCard from './RecommendationCard.vue';
import { getActiveBanners, getBannerStatus, formatBannerDateRange } from '../data/bannerData';
import { getTierData } from '../data/tierData';
import {
  getTeammatesForComposition,
  findRoleOverlap,
  findSlotBasedGaps,
  analyzeTeamsForRecommendation,
  analyzeTeamBuildingForDPS,
  computePullVerdict,
  computeDPSPullVerdict,
  type RoleOverlap,
  type SlotBasedGapEntry,
  type TeamAnalysis,
  type DPSTeamBuildingAnalysis,
  type PullVerdict,
} from '../utils/characterUtils';

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
  roleCategory: 'dps' | 'support';
}

// ==================
// HELPERS
// ==================

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

function isDPSCharacter(char: Character): boolean {
  return char.roles.includes('DPS') || char.roles.includes('Support DPS');
}

function getEidolonRequirement(theirInvestmentModifiers?: { level: 1 | 2 | 3 | 4 | 5 | 6; modifier: number; reason?: string }[]): number | undefined {
  if (!theirInvestmentModifiers || theirInvestmentModifiers.length === 0) return undefined;

  const mostSignificant = theirInvestmentModifiers
    .filter(mod => mod.modifier !== 0)
    .sort((a, b) => Math.abs(b.modifier) - Math.abs(a.modifier))[0];

  return mostSignificant?.level;
}

const TIER_WEIGHTS: Record<TierRating, number> = {
  'T-1': 3.5, 'T-0.5': 3.25, 'T0': 3.0, 'T0.5': 2.5, 'T1': 2.0, 'T1.5': 1.5,
  'T2': 1.2, 'T3': 0.9, 'T4': 0.6, 'T5': 0.3,
};

const SYNERGY_WEIGHTS: Record<TeammateRating, number> = { 'S+': 3.5, S: 3.0, A: 2.0, B: 1.2, C: 0.6, D: 0.2 };

function calculatePullRating(
  wantedBy: { name: string; rating: TeammateRating; tier: TierRating; eidolonRequirement?: number; currentEidolon?: number }[]
): { rating: BannerRating; score: number } {
  if (wantedBy.length === 0) return { rating: 'D', score: 0 };

  let weightedSum = 0;
  for (const w of wantedBy) {
    const tierWeight = TIER_WEIGHTS[w.tier] || 1.0;
    const synergyWeight = SYNERGY_WEIGHTS[w.rating] || 1.0;

    let eidolonMultiplier = 1;
    if (w.eidolonRequirement) {
      const currentEidolon = w.currentEidolon ?? 0;
      if (currentEidolon === 0) {
        eidolonMultiplier = 1 + w.eidolonRequirement;
      } else {
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

const ownedDPS = computed(() =>
  props.ownedCharacters.filter(c => isDPSCharacter(c))
);

const ownedSupports = computed(() =>
  props.ownedCharacters.filter(c => !isDPSCharacter(c))
);

function calculateSupportAnalysis(bannerChar: Character): {
  rating: BannerRating;
  score: number;
  wantedBy: { name: string; rating: TeammateRating; tier: TierRating; eidolonRequirement?: number; currentEidolon?: number }[];
  reasoning: string[];
} {
  const wantedBy: { name: string; rating: TeammateRating; tier: TierRating; eidolonRequirement?: number; currentEidolon?: number }[] = [];
  const reasoning: string[] = [];

  const isOwned = props.getOwnership(bannerChar.id) !== 'none';
  const currentEidolon = isOwned ? (props.getInvestment(bannerChar.id)?.eidolonLevel ?? 0) : 0;

  for (const dps of ownedDPS.value) {
    const dpsTier = getBestTier(dps.id, props.gameMode);
    const dpsTeammates = getTeammatesForComposition(dps);
    const supportRecs = [
      ...(dpsTeammates.amplifiers || []),
      ...(dpsTeammates.sustains || []),
      ...(dpsTeammates.subDPS || []),
    ];
    const rec = supportRecs.find(r => r.id === bannerChar.id);
    if (rec && ['S', 'A', 'B', 'C', 'D'].includes(rec.rating)) {
      const eidolonRequirement = getEidolonRequirement(rec.theirInvestmentModifiers);

      if (isOwned) {
        if (!eidolonRequirement || currentEidolon >= eidolonRequirement) {
          continue;
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

function calculateDPSAnalysis(bannerChar: Character): {
  rating: BannerRating;
  score: number;
  wantedBy: { name: string; rating: TeammateRating; tier: TierRating; asSubDPS?: boolean; eidolonRequirement?: number; currentEidolon?: number }[];
  reasoning: string[];
} {
  const wantedBy: { name: string; rating: TeammateRating; tier: TierRating; asSubDPS?: boolean; eidolonRequirement?: number; currentEidolon?: number }[] = [];
  const reasoning: string[] = [];

  const isOwned = props.getOwnership(bannerChar.id) !== 'none';
  const currentEidolon = isOwned ? (props.getInvestment(bannerChar.id)?.eidolonLevel ?? 0) : 0;

  for (const support of ownedSupports.value) {
    const supportTier = getBestTier(support.id, props.gameMode);
    const supportTeammates = getTeammatesForComposition(support);
    const dpsRecs = supportTeammates.dps || [];
    const rec = dpsRecs.find(r => r.id === bannerChar.id);
    if (rec && ['S', 'A', 'B', 'C', 'D'].includes(rec.rating)) {
      const eidolonRequirement = getEidolonRequirement(rec.theirInvestmentModifiers);

      if (isOwned) {
        if (!eidolonRequirement || currentEidolon >= eidolonRequirement) {
          continue;
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

  for (const dps of ownedDPS.value) {
    const dpsTier = getBestTier(dps.id, props.gameMode);
    const dpsTeammates = getTeammatesForComposition(dps);
    const subDPSRecs = dpsTeammates.subDPS || [];
    const rec = subDPSRecs.find(r => r.id === bannerChar.id);
    if (rec && ['S', 'A', 'B', 'C', 'D'].includes(rec.rating)) {
      const eidolonRequirement = getEidolonRequirement(rec.theirInvestmentModifiers);

      if (isOwned) {
        if (!eidolonRequirement || currentEidolon >= eidolonRequirement) {
          continue;
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

const bannerAnalysis = computed(() => {
  if (!selectedBanner.value) return { supports: [], dps: [] };

  const supports: GroupedBannerAnalysis[] = [];
  const dps: GroupedBannerAnalysis[] = [];

  for (const featured of selectedBanner.value.featured5Star) {
    const char = props.characters.find(c => c.id === featured.id);
    const owned = char ? props.getOwnership(char.id) !== 'none' : false;

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
        roleCategory: 'support',
      };
      supports.push(analysis);
      continue;
    }

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

  supports.sort((a, b) => b.score - a.score);
  dps.sort((a, b) => b.score - a.score);

  return { supports, dps };
});

// ==================
// ENRICHED BANNER ANALYSIS WITH OVERLAP + GAPS
// ==================

interface EnrichedBannerAnalysis extends GroupedBannerAnalysis {
  roleOverlap: RoleOverlap[];
  rosterGaps: SlotBasedGapEntry[];
  teamAnalysis: TeamAnalysis[];
  dpsTeamAnalysis: DPSTeamBuildingAnalysis | null;
  verdict: PullVerdict;
}

// Helper to get DPS tier for verdict scoring
const getDpsTier = (characterId: string): string | undefined => {
  const tierData = getTierData(characterId);
  if (!tierData) return undefined;

  // Get DPS tier from current game mode
  const modeData = tierData[props.gameMode];
  if (!modeData) return undefined;

  // Return DPS tier, or Support DPS tier if no DPS
  return modeData['DPS'] || modeData['Support DPS'];
};

const enrichedBannerAnalysis = computed(() => {
  const ownedIds = new Set(props.ownedCharacters.map(c => c.id));

  const enrichSupport = (rec: GroupedBannerAnalysis): EnrichedBannerAnalysis => {
    if (!rec.character || rec.owned) {
      return { ...rec, roleOverlap: [], rosterGaps: [], teamAnalysis: [], dpsTeamAnalysis: null, verdict: { level: 'skip', reason: rec.owned ? 'Already owned' : 'No data', score: 0 } };
    }

    const wantedByDPS = rec.wantedBy.map(w => {
      const dpsChar = props.ownedCharacters.find(c => c.name === w.name);
      return dpsChar ? { dpsId: dpsChar.id, dpsChar, rating: w.rating } : null;
    }).filter((x): x is { dpsId: string; dpsChar: Character; rating: TeammateRating } => x !== null);

    const roleOverlap = findRoleOverlap(
      rec.character.id,
      ownedIds,
      wantedByDPS,
      props.characters
    );

    const rosterGaps = findSlotBasedGaps(
      rec.character.id,
      ownedIds,
      wantedByDPS,
      props.characters
    );

    const teamAnalysis = analyzeTeamsForRecommendation(
      rec.character.id,
      ownedIds,
      wantedByDPS,
      props.characters
    );

    const isOwned = props.getOwnership(rec.character.id) === 'owned';
    const verdict = computePullVerdict(teamAnalysis, getDpsTier, isOwned);
    return { ...rec, roleOverlap, rosterGaps, teamAnalysis, dpsTeamAnalysis: null, verdict };
  };

  const enrichDPS = (rec: GroupedBannerAnalysis): EnrichedBannerAnalysis => {
    if (!rec.character || rec.owned) {
      return { ...rec, roleOverlap: [], rosterGaps: [], teamAnalysis: [], dpsTeamAnalysis: null, verdict: { level: 'skip', reason: rec.owned ? 'Already owned' : 'No data', score: 0 } };
    }

    // For DPS recommendations, analyze what supports the user has for this DPS
    const dpsTeamAnalysis = analyzeTeamBuildingForDPS(
      rec.character,
      ownedIds,
      props.characters
    );

    const isOwned = props.getOwnership(rec.character.id) === 'owned';
    const dpsTier = getDpsTier(rec.character.id);
    const verdict = computeDPSPullVerdict(dpsTeamAnalysis, dpsTier, isOwned);

    // Legacy fields (not used for DPS but needed for interface)
    const roleOverlap: RoleOverlap[] = [];
    const rosterGaps: SlotBasedGapEntry[] = [];
    const teamAnalysis: TeamAnalysis[] = [];

    return { ...rec, roleOverlap, rosterGaps, teamAnalysis, dpsTeamAnalysis, verdict };
  };

  return {
    supports: bannerAnalysis.value.supports.map(enrichSupport).sort((a, b) => b.verdict.score - a.verdict.score),
    dps: bannerAnalysis.value.dps.map(enrichDPS).sort((a, b) => b.verdict.score - a.verdict.score),
  };
});
</script>

<template>
  <div class="banner-advisor-view">
    <!-- Header -->
    <header class="view-header" data-onboarding="banner-advisor-header">
      <div class="header-content">
        <div class="celestial-icon">
          <div class="celestial-ring"></div>
          <div class="celestial-glow"></div>
          <span class="celestial-star">✦</span>
        </div>
        <div class="header-text">
          <h1 class="header-title">Banner Advisor</h1>
          <p class="header-subtitle">Current banners rated for your {{ ownedCharacters.length }}-character roster</p>
        </div>
      </div>
      <p class="banner-disclaimer">
        Note: This only considers synergy with your existing roster, not building entirely new team archetypes.
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
        Mark at least 4 characters as owned to generate banner recommendations.<br />
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
      <div v-if="selectedBanner" class="banner-sections">
        <!-- Supports Section -->
        <section v-if="enrichedBannerAnalysis.supports.length > 0" class="banner-section">
          <div class="section-header support-header">
            <span class="section-icon">✨</span>
            <div class="section-title-area">
              <h3 class="section-title">Supports on This Banner</h3>
              <p class="section-subtitle">Rated by how much your {{ ownedDPS.length }} DPS want them</p>
            </div>
            <span class="section-count">{{ enrichedBannerAnalysis.supports.length }}</span>
          </div>

          <div class="recommendation-list">
            <RecommendationCard
              v-for="(rec, index) in enrichedBannerAnalysis.supports"
              :key="rec.characterId"
              :character="rec.character"
              :character-id="rec.characterId"
              :owned="rec.owned"
              :is-new="rec.isNew"
              :rating="rec.rating"
              :rank="index + 1"
              role-label="Support"
              role-class="support"
              :wanted-by="rec.wantedBy"
              wanted-by-label="DPS"
              :team-analysis="rec.teamAnalysis"
              :dps-team-analysis="rec.dpsTeamAnalysis"
              :verdict="rec.verdict"
              :reasoning="rec.reasoning"
              :all-characters="characters"
              :owned-character-ids="new Set(ownedCharacters.map(c => c.id))"
              :index="index"
              @select-character="emit('select-character', $event)"
            />
          </div>
        </section>

        <!-- DPS Section -->
        <section v-if="enrichedBannerAnalysis.dps.length > 0" class="banner-section">
          <div class="section-header dps-header">
            <span class="section-icon">⚔️</span>
            <div class="section-title-area">
              <h3 class="section-title">DPS on This Banner</h3>
              <p class="section-subtitle">Rated by supports wanting them + DPS wanting them as sub-DPS</p>
            </div>
            <span class="section-count">{{ enrichedBannerAnalysis.dps.length }}</span>
          </div>

          <div class="recommendation-list">
            <RecommendationCard
              v-for="(rec, index) in enrichedBannerAnalysis.dps"
              :key="rec.characterId"
              :character="rec.character"
              :character-id="rec.characterId"
              :owned="rec.owned"
              :is-new="rec.isNew"
              :rating="rec.rating"
              :rank="index + 1"
              role-label="DPS"
              role-class="dps"
              :wanted-by="rec.wantedBy"
              wanted-by-label="supports"
              :team-analysis="rec.teamAnalysis"
              :dps-team-analysis="rec.dpsTeamAnalysis"
              :verdict="rec.verdict"
              :reasoning="rec.reasoning"
              :all-characters="characters"
              :owned-character-ids="new Set(ownedCharacters.map(c => c.id))"
              :index="index"
              @select-character="emit('select-character', $event)"
            />
          </div>
        </section>

        <!-- Empty State for no characters on banner -->
        <div v-if="enrichedBannerAnalysis.supports.length === 0 && enrichedBannerAnalysis.dps.length === 0" class="no-chars-state">
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
/* ==========================================
   BANNER ADVISOR V2 - STELLAR NEXUS DESIGN
   ========================================== */

/* Header */
.view-header {
  margin-bottom: 2rem;
}

.header-content {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.celestial-icon {
  position: relative;
  width: 52px;
  height: 52px;
  flex-shrink: 0;
}

.celestial-ring {
  position: absolute;
  inset: 0;
  border: 2px solid rgba(251, 191, 36, 0.25);
  border-radius: 50%;
  animation: celestial-pulse 3s ease-in-out infinite;
}

.celestial-glow {
  position: absolute;
  inset: 6px;
  background: radial-gradient(circle, rgba(251, 191, 36, 0.15) 0%, transparent 70%);
  border-radius: 50%;
  animation: celestial-pulse 3s ease-in-out infinite 0.5s;
}

@keyframes celestial-pulse {
  0%, 100% { opacity: 0.5; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.05); }
}

.celestial-star {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  color: rgb(251, 191, 36);
  text-shadow: 0 0 20px rgba(251, 191, 36, 0.6);
}

.header-title {
  font-family: var(--font-display, 'Orbitron', sans-serif);
  font-size: 1.375rem;
  font-weight: 700;
  color: white;
  letter-spacing: 0.02em;
  margin: 0;
}

.header-subtitle {
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.5);
  margin: 0.25rem 0 0 0;
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
  padding: 4rem 2rem;
  text-align: center;
}

.empty-orb {
  position: relative;
  width: 100px;
  height: 100px;
  margin-bottom: 1.5rem;
}

.orb-ring {
  position: absolute;
  inset: 0;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 50%;
}

.orb-ring-1 { animation: orb-pulse 4s ease-in-out infinite; }
.orb-ring-2 { inset: 12px; animation: orb-pulse 4s ease-in-out infinite 0.5s; }
.orb-ring-3 { inset: 24px; animation: orb-pulse 4s ease-in-out infinite 1s; }

@keyframes orb-pulse {
  0%, 100% { opacity: 0.3; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(1.05); }
}

.orb-icon {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  color: rgba(255, 255, 255, 0.15);
}

.empty-title {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
  margin: 0 0 0.5rem 0;
}

.empty-desc {
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.4);
  line-height: 1.6;
  max-width: 380px;
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

.timeline-node.selected {
  border-color: rgba(251, 191, 36, 0.6);
  background: rgba(251, 191, 36, 0.1);
  box-shadow: 0 0 20px rgba(251, 191, 36, 0.15);
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
  font-family: var(--font-mono);
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

/* Banner Sections */
.banner-sections {
  display: flex;
  flex-direction: column;
  gap: 2.5rem;
}

.banner-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 0.75rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.section-header.support-header {
  border-left: 3px solid rgba(168, 85, 247, 0.6);
  background: linear-gradient(90deg, rgba(168, 85, 247, 0.08) 0%, rgba(255, 255, 255, 0.03) 100%);
}

.section-header.dps-header {
  border-left: 3px solid rgba(239, 68, 68, 0.6);
  background: linear-gradient(90deg, rgba(239, 68, 68, 0.08) 0%, rgba(255, 255, 255, 0.03) 100%);
}

.section-icon {
  font-size: 1.25rem;
  flex-shrink: 0;
}

.section-title-area {
  flex: 1;
  min-width: 0;
}

.section-title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: white;
  margin: 0;
}

.section-subtitle {
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.45);
  margin: 0.125rem 0 0 0;
}

.section-count {
  font-size: 0.75rem;
  font-weight: 600;
  font-family: var(--font-mono);
  padding: 0.25rem 0.5rem;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 0.375rem;
  color: rgba(255, 255, 255, 0.6);
}

/* Recommendation Cards List */
.recommendation-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* No Characters State */
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

.legend-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 1rem;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.5);
}

.legend-badge {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.375rem;
  font-size: 0.6875rem;
  font-weight: 700;
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

.legend-note {
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.35);
  font-style: italic;
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
}
</style>
