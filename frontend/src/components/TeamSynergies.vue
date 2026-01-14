<script setup lang="ts">
import { computed } from 'vue';
import type { Character } from '../types';
import type { SynergyBreakdown, CharacterContribution } from '../utils/teamGenerator';

// ==================
// PROPS
// ==================

interface Props {
  team: Character[];
  breakdowns: SynergyBreakdown[];
  roles: string[];
  contributions?: CharacterContribution[];
  keySynergies?: string[];
}

const props = defineProps<Props>();

// ==================
// INTELLIGENT SYNERGY GROUPING
// ==================

// Group contributions by similar mechanics/buffs to avoid repetition
const groupedMechanics = computed(() => {
  const groups: Map<string, {
    mechanic: string;
    icon: string;
    color: string;
    characters: { id: string; name: string; detail: string }[];
  }> = new Map();

  // Keywords to group by
  const mechanicKeywords = [
    { keywords: ['ATK', 'attack'], mechanic: 'Attack Boost', icon: '⚔', color: '#f4634e' },
    { keywords: ['CRIT', 'crit rate', 'crit dmg'], mechanic: 'Critical Enhancement', icon: '◆', color: '#ff9500' },
    { keywords: ['SPD', 'speed', 'action advance'], mechanic: 'Speed Control', icon: '⚡', color: '#5fe8b6' },
    { keywords: ['DEF', 'defense shred', 'defense reduction'], mechanic: 'Defense Manipulation', icon: '🛡', color: '#47c7fd' },
    { keywords: ['DMG%', 'damage bonus', 'damage increase'], mechanic: 'Damage Amplification', icon: '▲', color: '#a855f7' },
    { keywords: ['heal', 'HP', 'recovery'], mechanic: 'Sustain & Recovery', icon: '♥', color: '#22c55e' },
    { keywords: ['break', 'weakness'], mechanic: 'Break Synergy', icon: '💥', color: '#3b82f6' },
    { keywords: ['follow-up', 'FUA'], mechanic: 'Follow-up Attacks', icon: '↺', color: '#f3d86b' },
    { keywords: ['energy', 'ultimate'], mechanic: 'Energy Generation', icon: '✧', color: '#d376f0' },
    { keywords: ['buff', 'support'], mechanic: 'Team Buffing', icon: '✦', color: '#ff9500' },
    { keywords: ['debuff', 'vulnerability', 'impair'], mechanic: 'Enemy Debuffing', icon: '◉', color: '#f4634e' },
    { keywords: ['memosprite', 'summon'], mechanic: 'Memosprite Synergy', icon: '🌟', color: '#625afa' },
    { keywords: ['DoT', 'bleed', 'burn', 'shock', 'wind shear'], mechanic: 'DoT Stacking', icon: '☠', color: '#c4c4c4' },
  ];

  if (props.contributions && props.contributions.length > 0) {
    for (const contrib of props.contributions) {
      const text = (contrib.contribution || contrib.reason || '').toLowerCase();
      let matched = false;

      for (const mech of mechanicKeywords) {
        if (mech.keywords.some(k => text.includes(k.toLowerCase()))) {
          if (!groups.has(mech.mechanic)) {
            groups.set(mech.mechanic, {
              mechanic: mech.mechanic,
              icon: mech.icon,
              color: mech.color,
              characters: []
            });
          }
          groups.get(mech.mechanic)!.characters.push({
            id: contrib.characterId,
            name: contrib.characterName,
            detail: contrib.contribution || contrib.reason
          });
          matched = true;
          break;
        }
      }

      // If no match, add to general category
      if (!matched && (contrib.contribution || contrib.reason)) {
        const generalKey = 'Core Synergy';
        if (!groups.has(generalKey)) {
          groups.set(generalKey, {
            mechanic: generalKey,
            icon: '◇',
            color: '#9ca3af',
            characters: []
          });
        }
        groups.get(generalKey)!.characters.push({
          id: contrib.characterId,
          name: contrib.characterName,
          detail: contrib.contribution || contrib.reason
        });
      }
    }
  }

  // Filter out groups with only 1 character (not really a "synergy")
  // But keep them if they have meaningful info
  return Array.from(groups.values()).filter(g => g.characters.length > 0);
});

// Team composition insight
const teamComposition = computed(() => {
  const roles = props.roles;
  const dpsCount = roles.filter(r => r === 'DPS' || r === 'Main DPS').length;
  const supportCount = roles.filter(r => r === 'Amplifier' || r === 'Support DPS').length;
  const sustainCount = roles.filter(r => r === 'Sustain').length;

  if (dpsCount >= 2) return { type: 'Multi-Carry', desc: 'Multiple damage dealers sharing the spotlight', icon: '⚔⚔' };
  if (supportCount >= 2) return { type: 'Hyper-Buffed', desc: 'Stacking buffs on a single carry', icon: '✦✦' };
  if (sustainCount >= 2) return { type: 'Ultra-Sustain', desc: 'Maximum survivability focus', icon: '♥♥' };
  return { type: 'Balanced', desc: 'Classic team composition', icon: '◆' };
});

// Anti-synergies
const antiSynergies = computed(() => {
  return props.breakdowns.filter(bd => bd.score < 0);
});

// Element diversity
const elementDiversity = computed(() => {
  const elements = new Set(props.team.map(c => c.element));
  return {
    count: elements.size,
    elements: Array.from(elements),
    isMonoElement: elements.size === 1,
    isDiverse: elements.size >= 3
  };
});

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
</script>

<template>
  <div class="synergy-constellation">
    <!-- Team Composition Badge -->
    <div class="composition-header">
      <div class="composition-badge">
        <span class="comp-icon">{{ teamComposition.icon }}</span>
        <div class="comp-info">
          <span class="comp-type">{{ teamComposition.type }}</span>
          <span class="comp-desc">{{ teamComposition.desc }}</span>
        </div>
      </div>

      <!-- Element Spread -->
      <div class="element-spread">
        <div
          v-for="element in elementDiversity.elements"
          :key="element"
          class="element-pip"
          :style="{ background: elementColors[element], boxShadow: `0 0 8px ${elementColors[element]}60` }"
          :title="element"
        ></div>
        <span class="element-count">{{ elementDiversity.count }} Elements</span>
      </div>
    </div>

    <!-- Synergy Mechanics Grid -->
    <div v-if="groupedMechanics.length > 0" class="mechanics-section">
      <div class="section-label">
        <span class="label-line"></span>
        <span class="label-text">Synergy Mechanics</span>
        <span class="label-line"></span>
      </div>

      <div class="mechanics-grid">
        <div
          v-for="(group, index) in groupedMechanics"
          :key="group.mechanic"
          class="mechanic-card"
          :style="{
            '--mech-color': group.color,
            '--mech-delay': `${index * 0.08}s`
          }"
        >
          <div class="mech-header">
            <span class="mech-icon" :style="{ color: group.color }">{{ group.icon }}</span>
            <span class="mech-name">{{ group.mechanic }}</span>
          </div>

          <div class="mech-contributors">
            <div
              v-for="char in group.characters"
              :key="char.id"
              class="contributor"
            >
              <img
                :src="`/icons/${char.id}.webp`"
                :alt="char.name"
                class="contributor-avatar"
                @error="($event.target as HTMLImageElement).style.display = 'none'"
              />
              <span class="contributor-name">{{ char.name }}</span>
            </div>
          </div>

          <!-- Condensed detail (avoid repetition) -->
          <div v-if="group.characters.length === 1 && group.characters[0]" class="mech-detail">
            {{ group.characters[0]?.detail }}
          </div>
        </div>
      </div>
    </div>

    <!-- Anti-Synergies Warning -->
    <div v-if="antiSynergies.length > 0" class="warnings-section">
      <div class="section-label warning">
        <span class="label-line"></span>
        <span class="label-text">⚠ Potential Conflicts</span>
        <span class="label-line"></span>
      </div>

      <div class="warning-cards">
        <div
          v-for="(anti, i) in antiSynergies"
          :key="i"
          class="warning-card"
        >
          <div class="conflict-pair">
            <span class="conflict-name">{{ anti.source }}</span>
            <span class="conflict-x">✕</span>
            <span class="conflict-name">{{ anti.target }}</span>
          </div>
          <p class="conflict-reason">{{ anti.reason }}</p>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="groupedMechanics.length === 0" class="empty-state">
      <div class="empty-icon">◇</div>
      <p class="empty-text">Standard team composition</p>
      <p class="empty-subtext">No special synergy mechanics detected</p>
    </div>
  </div>
</template>

<style scoped>
/* ==================
   CONSTELLATION THEME
   Celestial map aesthetic with connected nodes
   ================== */

.synergy-constellation {
  position: relative;
  padding: 1.5rem;
  background: linear-gradient(165deg, rgba(12, 10, 24, 0.6) 0%, rgba(8, 8, 20, 0.8) 100%);
  border-radius: 1.25rem;
  border: 1px solid rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

/* ==================
   COMPOSITION HEADER
   ================== */

.composition-header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-wrap: wrap;
}

.composition-badge {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 0.75rem 1.25rem;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
}

.comp-icon {
  font-size: 1.5rem;
  filter: drop-shadow(0 0 4px rgba(255, 180, 32, 0.4));
}

.comp-info {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.comp-type {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.875rem;
  font-weight: 600;
  color: white;
  letter-spacing: 0.02em;
}

.comp-desc {
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.45);
}

.element-spread {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.element-pip {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  transition: transform 0.2s ease;
}

.element-pip:hover {
  transform: scale(1.3);
}

.element-count {
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.4);
  margin-left: 0.25rem;
}

/* ==================
   SECTION LABELS
   ================== */

.section-label {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
}

.section-label.warning .label-text {
  color: #f87171;
}

.label-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
}

.label-text {
  font-size: 0.6875rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  white-space: nowrap;
}

/* ==================
   MECHANICS GRID
   ================== */

.mechanics-section {
  position: relative;
  margin-bottom: 1.5rem;
}

.mechanics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.875rem;
}

.mechanic-card {
  position: relative;
  padding: 1rem;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.01) 100%);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-left: 3px solid var(--mech-color);
  border-radius: 10px;
  animation: card-enter 0.4s ease-out both;
  animation-delay: var(--mech-delay, 0s);
  transition: all 0.2s ease;
}

.mechanic-card:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.1);
  transform: translateX(4px);
}

@keyframes card-enter {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.mech-header {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  margin-bottom: 0.75rem;
}

.mech-icon {
  font-size: 1.125rem;
  filter: drop-shadow(0 0 4px currentColor);
}

.mech-name {
  font-size: 0.8125rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}

.mech-contributors {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.contributor {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.5rem 0.25rem 0.25rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 9999px;
}

.contributor-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.contributor-name {
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.7);
}

.mech-detail {
  margin-top: 0.625rem;
  padding-top: 0.625rem;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.5);
  line-height: 1.4;
  font-style: italic;
}

/* ==================
   WARNINGS
   ================== */

.warnings-section {
  margin-top: 1rem;
}

.warning-cards {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.warning-card {
  padding: 0.875rem 1rem;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 8px;
}

.conflict-pair {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  margin-bottom: 0.5rem;
}

.conflict-name {
  font-size: 0.8125rem;
  font-weight: 600;
  color: #fca5a5;
}

.conflict-x {
  font-size: 0.75rem;
  color: #ef4444;
}

.conflict-reason {
  margin: 0;
  font-size: 0.75rem;
  color: rgba(252, 165, 165, 0.7);
  line-height: 1.4;
}

/* ==================
   EMPTY STATE
   ================== */

.empty-state {
  text-align: center;
  padding: 2rem 1rem;
}

.empty-icon {
  font-size: 2rem;
  color: rgba(255, 255, 255, 0.15);
  margin-bottom: 0.75rem;
}

.empty-text {
  margin: 0 0 0.25rem 0;
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.5);
}

.empty-subtext {
  margin: 0;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.3);
}

/* ==================
   RESPONSIVE
   ================== */

@media (max-width: 640px) {
  .synergy-constellation {
    padding: 1rem;
  }

  .composition-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .mechanics-grid {
    grid-template-columns: 1fr;
  }
}
</style>
