// ========================================
// STARGUIDE - Synergy Tag Taxonomy
// ========================================
// This taxonomy is used by the team generation algorithm
// to understand character mechanics and find synergies.
// Tags are extracted from Game8 and Prydwen data.

// ==================
// DPS ARCHETYPES
// ==================
export const DPS_ARCHETYPES = [
  'Hypercarry',           // Single main DPS focus
  'Sub-DPS',              // Secondary damage dealer
  'Dual DPS',             // Two DPS setup
  'Break DPS',            // Firefly, Boothill - Break focused
  'DoT DPS',              // Kafka, Black Swan - Damage over Time
  'Follow-up DPS',        // Feixiao, Dr. Ratio - Follow-up focused
  'Debuff Stacker',       // Acheron - stacks from debuffs
  'Erudition DPS',        // The Herta, Jade - AoE focused
  'Counter DPS',          // Yunli, Clara - Counter focused
] as const;

// ==================
// DAMAGE TYPE
// ==================
export const DAMAGE_TYPES = [
  'AoE',                  // Hits all enemies
  'Blast',                // Main target + adjacent
  'Single Target',        // One enemy
  'Bounce',               // Hits bounce between enemies
] as const;

// ==================
// RESOURCE MECHANICS
// ==================
export const RESOURCE_TAGS = [
  'HP Consumption',       // Uses own/team HP
  'HP Scaling',           // Damage scales with HP
  'High HP',              // Has naturally high Max HP (good for HP drain teams)
  'SP Positive',          // Generates more SP than uses
  'SP Neutral',           // Balanced SP usage
  'SP Negative',          // Consumes lots of SP
  'No Energy',            // Uses alternate charge system
  'Energy Battery',       // Restores team energy
  'High Energy Cost',     // 160+ energy Ultimate
  'High SPD',             // Naturally fast or has SPD buffs
] as const;

// ==================
// BREAK MECHANICS
// ==================
export const BREAK_TAGS = [
  'Super Break',          // Deals Super Break DMG
  'Break Efficiency',     // Increases break speed
  'Break Effect Buffer',  // Buffs team Break Effect
  'Break DMG Buffer',     // Increases Break DMG taken
  'Super Break Buffer',   // Increases Super Break multiplier
  'Break Extend',         // Extends Weakness Broken state
  'Weakness Implant',     // Applies element weakness
  'Exo-Toughness',        // Extra toughness layer
  'Toughness Shred',      // High toughness damage
  'Toughness Ignore',     // Ignores weakness type for toughness
] as const;

// ==================
// DOT MECHANICS
// ==================
export const DOT_TAGS = [
  'DoT Detonation',       // Triggers all DoTs instantly
  'DoT Buffer',           // Increases DoT damage
  'Shock',                // Lightning DoT
  'Burn',                 // Fire DoT
  'Bleed',                // Physical DoT
  'Wind Shear',           // Wind DoT
  'Arcana',               // Black Swan stacking DoT
] as const;

// ==================
// BUFF TYPES (what they provide)
// ==================
export const BUFF_TAGS = [
  'ATK Buffer',           // Increases ATK
  'CRIT Rate Buffer',     // Increases CRIT Rate
  'CRIT DMG Buffer',      // Increases CRIT DMG
  'DMG% Buffer',          // Increases DMG%
  'Skill DMG Buffer',     // Buffs Skill damage specifically (Cerydra)
  'DEF Shred',            // Reduces enemy DEF
  'RES PEN',              // Resistance Penetration
  'Vulnerability',        // Increases DMG taken by enemy
  'SPD Buffer',           // Increases SPD
  'Max HP Buffer',        // Increases Max HP
  'True DMG',             // Adds True DMG instance
  'Follow-up Buffer',     // Buffs follow-up attacks specifically
  'Effect RES Buffer',    // Increases Effect RES
  'Summon Buffer',        // Buffs summons (Sunday)
  'Memosprite Buffer',    // Buffs memosprites specifically
] as const;

// ==================
// HEALING
// ==================
export const HEALING_TAGS = [
  'Burst Heal',           // Large single heal
  'Healing on Hit',       // Heals when attacking enemy
  'Healing on HP Loss',   // Heals when HP is lost (Hyacine passive)
  'High Healing',         // Very high healing throughput (Gallagher, Luocha)
  'Self Heal',            // Heals self only
  'Revive',               // Can revive fallen allies
] as const;

// ==================
// DEFENSIVE
// ==================
export const DEFENSIVE_TAGS = [
  'Shield',               // Provides shields
  'Stacking Shield',      // Shields can stack
  'DMG Reduction',        // Reduces incoming damage
  'Effect RES',           // Resists debuffs
  'CC Immunity',          // Immune to crowd control
  'Debuff Cleanse',       // Removes debuffs
  'Taunt',                // Redirects enemy attacks to the character
] as const;

// ==================
// ACTION MANIPULATION
// ==================
export const ACTION_TAGS = [
  'Turn Advance',         // Grants extra turn to ally
  'Action Advance',       // Advances action gauge
  'Team Action Advance',  // Advances entire team
  'Action Delay',         // Delays enemy actions
  'Fixed SPD',            // SPD cannot be modified
] as const;

// ==================
// SPECIAL MECHANICS
// ==================
export const SPECIAL_TAGS = [
  'Summon',               // Has a summon/pet
  'Memosprite',           // Remembrance summon specifically
  'Follow-up Attack',     // Has follow-up attacks
  'Coord Attack',         // Attacks when allies attack (Robin)
  'Counter',              // Attacks when hit
  'EHR Scaling',          // Scales with Effect Hit Rate
  'DEF Scaling',          // Scales with DEF
  'Debuff Applier',       // Frequently applies debuffs
  'Chrysos Heir',         // Characters from Amphoreus
  'Stored DMG',           // Stores team damage for later use (Cipher)
  'Multi-Hit',            // Attacks that hit multiple times in one action
  'Frequent Attacker',    // Can attack more than once per turn
  'Charge Mechanic',      // Gains stacks from ally attacks (Jade)
  'DMG Redirection',      // Redirects ally damage to self (Fu Xuan)
  'Amplifier',            // Harmony support who pairs with other amplifiers
] as const;

// ==================
// ANTI-SYNERGIES (things that DON'T work)
// ==================
export const ANTI_SYNERGY_TAGS = [
  'Anti-Shield',          // Doesn't work with shields (Castorice)
  'Anti-Toughness Lock',  // Useless vs locked toughness (Firefly)
  'Delayed Buff',         // Buffs don't apply retroactively (Sunday)
] as const;

// ==================
// ALL TAGS COMBINED
// ==================
export const ALL_TAGS = [
  ...DPS_ARCHETYPES,
  ...DAMAGE_TYPES,
  ...RESOURCE_TAGS,
  ...BREAK_TAGS,
  ...DOT_TAGS,
  ...BUFF_TAGS,
  ...HEALING_TAGS,
  ...DEFENSIVE_TAGS,
  ...ACTION_TAGS,
  ...SPECIAL_TAGS,
  ...ANTI_SYNERGY_TAGS,
] as const;

export type SynergyTag = typeof ALL_TAGS[number];

// ==================
// SYNERGY RULES
// ==================
// These define which tags synergize well together
// `reason` should be a clear, player-friendly explanation

export interface SynergyRule {
  if: SynergyTag[];       // If character has these tags
  wants: SynergyTag[];    // They want teammates with these tags
  weight: number;         // How important (1-10)
  reason: string;         // Explanation for UI
  category: 'core' | 'amplify' | 'utility' | 'sustain';  // For grouping in UI
}

export const SYNERGY_RULES: SynergyRule[] = [
  // ==================
  // HP CONSUMPTION SYNERGIES
  // ==================
  {
    if: ['HP Consumption'],
    wants: ['Healing on HP Loss'],
    weight: 10,
    reason: 'Passive healing triggers whenever HP is drained, keeping the team healthy while the DPS consumes HP freely',
    category: 'core'
  },
  {
    if: ['HP Consumption'],
    wants: ['Max HP Buffer'],
    weight: 9,
    reason: 'Higher Max HP means more HP available to consume, directly increasing damage output',
    category: 'amplify'
  },
  {
    if: ['HP Consumption'],
    wants: ['High Healing'],
    weight: 9,
    reason: 'High healing throughput keeps the team topped off, enabling aggressive HP consumption without risk',
    category: 'core'
  },
  {
    if: ['HP Consumption'],
    wants: ['Healing on Hit'],
    weight: 8,
    reason: 'Attack-triggered healing accelerates resource generation (like Newbud) while sustaining the team',
    category: 'core'
  },
  {
    if: ['HP Consumption'],
    wants: ['High HP'],
    weight: 7,
    reason: 'Teammates with high Max HP contribute more to HP drain mechanics, accelerating charge generation',
    category: 'amplify'
  },
  {
    if: ['HP Consumption'],
    wants: ['Burst Heal'],
    weight: 6,
    reason: 'Emergency healing to recover from heavy HP consumption phases',
    category: 'sustain'
  },

  // ==================
  // MEMOSPRITE SYNERGIES
  // ==================
  {
    if: ['Memosprite'],
    wants: ['Memosprite Buffer'],
    weight: 10,
    reason: 'Buffs apply to the Memosprite summon, dramatically increasing its damage contribution',
    category: 'core'
  },
  {
    if: ['Memosprite'],
    wants: ['Summon Buffer'],
    weight: 9,
    reason: 'Summon-specific buffs enhance Memosprite damage and attack frequency',
    category: 'core'
  },
  {
    if: ['Memosprite'],
    wants: ['Memosprite'],
    weight: 6,
    reason: 'Multiple Memosprites create more targets for HP drain mechanics',
    category: 'utility'
  },
  {
    if: ['Summon'],
    wants: ['Summon Buffer'],
    weight: 9,
    reason: 'Summons gain full benefit from dedicated summon buffs',
    category: 'core'
  },

  // ==================
  // NO ENERGY (ALTERNATE CHARGE) SYNERGIES
  // ==================
  {
    if: ['No Energy'],
    wants: ['Follow-up Attack'],
    weight: 7,
    reason: 'Follow-up attacks help proc healing and other on-attack effects without consuming resources',
    category: 'utility'
  },

  // ==================
  // BREAK DPS SYNERGIES
  // ==================
  {
    if: ['Break DPS'],
    wants: ['Super Break Buffer'],
    weight: 10,
    reason: 'Super Break damage is the primary damage source—buffing it directly multiplies output',
    category: 'core'
  },
  {
    if: ['Break DPS'],
    wants: ['Break Efficiency'],
    weight: 10,
    reason: 'Break Efficiency directly multiplies Super Break damage and accelerates breaking enemies',
    category: 'core'
  },
  {
    if: ['Break DPS'],
    wants: ['Break Effect Buffer'],
    weight: 9,
    reason: 'Higher Break Effect increases both break speed and Super Break damage',
    category: 'core'
  },
  {
    if: ['Break DPS'],
    wants: ['Break Extend'],
    weight: 8,
    reason: 'Extending Weakness Broken state allows more Super Break hits before recovery',
    category: 'amplify'
  },
  {
    if: ['Break DPS'],
    wants: ['Break DMG Buffer'],
    weight: 8,
    reason: 'Increases all Break-related damage including Super Break',
    category: 'amplify'
  },
  {
    if: ['Break DPS'],
    wants: ['DEF Shred'],
    weight: 7,
    reason: 'DEF reduction directly scales Super Break damage calculation',
    category: 'amplify'
  },
  {
    if: ['Break DPS'],
    wants: ['Weakness Implant'],
    weight: 7,
    reason: 'Implanting weakness ensures enemies can always be broken regardless of element',
    category: 'utility'
  },
  {
    if: ['Break DPS'],
    wants: ['Toughness Shred'],
    weight: 8,
    reason: 'High toughness damage from teammates accelerates breaking enemies for more Super Break windows',
    category: 'amplify'
  },

  // ==================
  // DOT DPS SYNERGIES
  // ==================
  {
    if: ['DoT DPS'],
    wants: ['DoT Detonation'],
    weight: 10,
    reason: 'Instantly triggers all active DoTs for massive burst damage',
    category: 'core'
  },
  {
    if: ['DoT DPS'],
    wants: ['DoT Buffer'],
    weight: 9,
    reason: 'Directly increases all DoT damage ticks',
    category: 'amplify'
  },
  {
    if: ['DoT DPS'],
    wants: ['Debuff Applier'],
    weight: 7,
    reason: 'Additional debuffs help stack more DoT effects on enemies',
    category: 'amplify'
  },
  {
    if: ['DoT DPS'],
    wants: ['RES PEN'],
    weight: 7,
    reason: 'RES PEN applies to DoT damage as a separate multiplier',
    category: 'amplify'
  },
  {
    if: ['DoT DPS'],
    wants: ['Vulnerability'],
    weight: 7,
    reason: 'Vulnerability increases all damage including DoT ticks',
    category: 'amplify'
  },

  // ==================
  // FOLLOW-UP DPS SYNERGIES
  // ==================
  {
    if: ['Follow-up DPS'],
    wants: ['Follow-up Buffer'],
    weight: 10,
    reason: 'Buffs specifically designed for follow-up attacks maximize their damage',
    category: 'core'
  },
  {
    if: ['Follow-up DPS'],
    wants: ['Coord Attack'],
    weight: 9,
    reason: 'Coordinated attacks trigger on every action, adding consistent extra damage',
    category: 'core'
  },
  {
    if: ['Follow-up DPS'],
    wants: ['Follow-up Attack'],
    weight: 7,
    reason: 'More follow-up attacks from allies generate stacks faster',
    category: 'amplify'
  },
  {
    if: ['Follow-up DPS'],
    wants: ['Team Action Advance'],
    weight: 8,
    reason: 'More team actions mean more opportunities to trigger follow-ups',
    category: 'amplify'
  },

  // ==================
  // DEBUFF STACKER (ACHERON) SYNERGIES
  // ==================
  {
    if: ['Debuff Stacker'],
    wants: ['Debuff Applier'],
    weight: 10,
    reason: 'Every debuff applied counts as a stack, accelerating Ultimate charge',
    category: 'core'
  },
  {
    if: ['Debuff Stacker'],
    wants: ['Vulnerability'],
    weight: 8,
    reason: 'Vulnerability counts as a debuff while also increasing damage',
    category: 'core'
  },
  {
    if: ['Debuff Stacker'],
    wants: ['DEF Shred'],
    weight: 8,
    reason: 'DEF Shred is both a debuff stack and a damage increase',
    category: 'amplify'
  },

  // ==================
  // HYPERCARRY SYNERGIES
  // ==================
  {
    if: ['Hypercarry'],
    wants: ['CRIT DMG Buffer'],
    weight: 8,
    reason: 'CRIT DMG buffs scale multiplicatively with high crit rate builds',
    category: 'amplify'
  },
  {
    if: ['Hypercarry'],
    wants: ['CRIT Rate Buffer'],
    weight: 7,
    reason: 'Higher crit rate means more consistent damage spikes',
    category: 'amplify'
  },
  {
    if: ['Hypercarry'],
    wants: ['ATK Buffer'],
    weight: 7,
    reason: 'ATK buffs directly increase damage for ATK-scaling abilities',
    category: 'amplify'
  },
  {
    if: ['Hypercarry'],
    wants: ['RES PEN'],
    weight: 8,
    reason: 'RES PEN is a separate damage multiplier, highly efficient at high investment',
    category: 'amplify'
  },
  {
    if: ['Hypercarry'],
    wants: ['Vulnerability'],
    weight: 8,
    reason: 'Vulnerability increases all incoming damage, stacking with other buffs',
    category: 'amplify'
  },
  {
    if: ['Hypercarry'],
    wants: ['DEF Shred'],
    weight: 7,
    reason: 'DEF reduction is universally effective damage amplification',
    category: 'amplify'
  },
  {
    if: ['Hypercarry'],
    wants: ['Turn Advance'],
    weight: 7,
    reason: 'Extra turns allow more skill/ultimate uses in the same timeframe',
    category: 'utility'
  },
  {
    if: ['Hypercarry'],
    wants: ['Action Advance'],
    weight: 6,
    reason: 'Action advancement helps the DPS act more frequently',
    category: 'utility'
  },

  // ==================
  // ERUDITION DPS SYNERGIES
  // ==================
  {
    if: ['Erudition DPS'],
    wants: ['CRIT DMG Buffer'],
    weight: 8,
    reason: 'AoE attacks benefit from CRIT buffs on every hit',
    category: 'amplify'
  },
  {
    if: ['Erudition DPS'],
    wants: ['RES PEN'],
    weight: 8,
    reason: 'RES PEN applies to all enemies hit by AoE attacks',
    category: 'amplify'
  },
  {
    if: ['Erudition DPS'],
    wants: ['Vulnerability'],
    weight: 8,
    reason: 'Vulnerability applies to all enemies hit by AoE attacks',
    category: 'amplify'
  },
  {
    if: ['Erudition DPS'],
    wants: ['Erudition DPS'],
    weight: 15,
    reason: 'Multiple Erudition characters enable massive team-wide damage bonuses (Anaxa A4: +50% team DMG, The Herta: +80% CRIT DMG)',
    category: 'core'
  },
  {
    if: ['Erudition DPS'],
    wants: ['Sub-DPS'],
    weight: 7,
    reason: 'Sub-DPS characters provide additional damage while main Erudition DPS focuses AoE',
    category: 'amplify'
  },

  // ==================
  // COUNTER DPS SYNERGIES
  // ==================
  {
    if: ['Counter DPS'],
    wants: ['DMG Reduction'],
    weight: 8,
    reason: 'Damage reduction keeps the counter unit healthy to keep countering',
    category: 'sustain'
  },
  {
    if: ['Counter DPS'],
    wants: ['CRIT DMG Buffer'],
    weight: 7,
    reason: 'Counter attacks can crit for massive damage spikes',
    category: 'amplify'
  },

  // ==================
  // SP ECONOMY
  // ==================
  {
    if: ['SP Negative'],
    wants: ['SP Positive'],
    weight: 8,
    reason: 'SP-positive teammates sustain the skill point economy',
    category: 'utility'
  },

  // ==================
  // ACTION MANIPULATION
  // ==================
  {
    if: ['Hypercarry', 'Follow-up DPS', 'Break DPS'],
    wants: ['Turn Advance'],
    weight: 7,
    reason: 'Extra turns multiply damage output over time',
    category: 'utility'
  },
  {
    if: ['Hypercarry', 'Follow-up DPS'],
    wants: ['Team Action Advance'],
    weight: 8,
    reason: 'Team-wide action advance creates burst damage windows',
    category: 'utility'
  },

  // ==================
  // ENERGY MANAGEMENT
  // ==================
  {
    if: ['High Energy Cost'],
    wants: ['Energy Battery'],
    weight: 8,
    reason: 'Energy regeneration helps charge expensive Ultimates faster',
    category: 'utility'
  },

  // ==================
  // ERUDITION ADVANCED SYNERGIES
  // ==================
  {
    if: ['Erudition DPS'],
    wants: ['Follow-up Attack', 'Multi-Hit', 'Frequent Attacker'],
    weight: 12,
    reason: 'Frequent attacks generate Energy and stacks for Erudition passives (The Herta Interpretation: gains stacks from ally attacks)',
    category: 'core'
  },

  // ==================
  // DUAL DPS SYNERGIES
  // ==================
  {
    if: ['Dual DPS', 'Sub-DPS'],
    wants: ['RES PEN', 'Vulnerability'],
    weight: 10,
    reason: 'In dual-DPS teams, team-wide buffs multiply damage for both DPS instead of buffing only one',
    category: 'core'
  },

  // ==================
  // CHARGE MECHANIC SYNERGIES
  // ==================
  {
    if: ['Charge Mechanic'],
    wants: ['Follow-up Attack', 'AoE', 'Multi-Hit', 'Frequent Attacker'],
    weight: 14,
    reason: 'Charge mechanics (Jade) generate stacks from ally hits - frequent AoE attackers maximize charge generation',
    category: 'core'
  },

  // ==================
  // FOLLOW-UP ADVANCED SYNERGIES
  // ==================
  {
    if: ['Follow-up DPS'],
    wants: ['Vulnerability'],
    weight: 9,
    reason: 'Vulnerability is a separate damage multiplier, extremely effective for frequent follow-up attacks',
    category: 'core'
  },
  {
    if: ['Follow-up DPS', 'High SPD'],
    wants: ['Stored DMG'],
    weight: 8,
    reason: 'Frequent actions maximize damage storage, creating multiplicative scaling',
    category: 'amplify'
  },
  {
    if: ['Follow-up Attack', 'Follow-up Buffer'],
    wants: ['Follow-up DPS'],
    weight: 10,
    reason: 'Follow-up supports are designed to amplify follow-up DPS, creating multiplicative scaling',
    category: 'core'
  },
  {
    if: ['Follow-up Attack', 'High Healing'],
    wants: ['Follow-up Attack', 'Follow-up DPS'],
    weight: 9,
    reason: 'Follow-up attacks charge sustain mechanics while providing defensive benefits',
    category: 'core'
  },

  // ==================
  // DOT ADVANCED SYNERGIES
  // ==================
  {
    if: ['Debuff Stacker'],
    wants: ['Shock', 'Burn', 'Bleed', 'Wind Shear', 'Arcana'],
    weight: 9,
    reason: 'DoT effects count as debuffs, generating Ultimate stacks while also dealing damage',
    category: 'core'
  },
  {
    if: ['Debuff Stacker'],
    wants: ['Stored DMG'],
    weight: 8,
    reason: 'Stored damage mechanics allow burst windows to capitalize on Ultimate damage windows',
    category: 'amplify'
  },
  {
    if: ['DoT Detonation'],
    wants: ['DoT DPS'],
    weight: 10,
    reason: 'Detonation mechanics require multiple DoT sources to maximize burst damage',
    category: 'core'
  },
  {
    if: ['DoT Detonation'],
    wants: ['Shock', 'Burn', 'Bleed', 'Wind Shear', 'Arcana'],
    weight: 10,
    reason: 'Multiple DoT types create more detonation targets for massive instant damage',
    category: 'core'
  },
  {
    if: ['DoT DPS', 'DoT Detonation'],
    wants: ['SP Positive'],
    weight: 7,
    reason: 'DoT characters are often SP negative, requiring SP-positive supports',
    category: 'utility'
  },
  {
    if: ['Arcana'],
    wants: ['DoT DPS'],
    weight: 10,
    reason: 'Each DoT tick has a chance to stack Arcana, creating exponential damage scaling',
    category: 'core'
  },
  {
    if: ['Arcana'],
    wants: ['Shock', 'Burn', 'Bleed', 'Wind Shear'],
    weight: 9,
    reason: 'Multiple DoT types maximize Arcana stacking and enable turbo-stacking with Ultimate',
    category: 'core'
  },
  {
    if: ['Arcana'],
    wants: ['DoT Detonation'],
    weight: 10,
    reason: 'Detonation triggers Arcana stacking effects and converts stacked Arcana into burst damage',
    category: 'core'
  },
  {
    if: ['EHR Scaling'],
    wants: ['EHR Scaling'],
    weight: 7,
    reason: 'Characters with EHR scaling benefit from shared ATK buffs (Kafka A2)',
    category: 'amplify'
  },

  // ==================
  // BREAK ADVANCED SYNERGIES
  // ==================
  {
    if: ['Break DPS', 'Weakness Implant'],
    wants: ['Break Efficiency'],
    weight: 9,
    reason: 'Break Efficiency multiplies Super Break damage and speeds up breaking',
    category: 'core'
  },
  {
    if: ['Break DPS', 'Weakness Implant'],
    wants: ['Toughness Shred'],
    weight: 8,
    reason: 'High toughness damage from teammates accelerates the break cycle',
    category: 'amplify'
  },
  {
    if: ['Break DPS', 'Single Target'],
    wants: ['Exo-Toughness'],
    weight: 13,
    reason: 'Exo-Toughness (Fugue) provides additional break instances on same target, multiplying Break DMG opportunities (critical for Boothill)',
    category: 'core'
  },
  {
    if: ['Break DPS', 'Toughness Shred'],
    wants: ['Action Advance'],
    weight: 8,
    reason: 'More actions means more breaks and more charge stacks for massive damage spikes',
    category: 'amplify'
  },
  {
    if: ['Break DPS', 'AoE'],
    wants: ['Toughness Shred'],
    weight: 8,
    reason: 'AoE toughness damage from teammates helps break multiple enemies faster for charge generation',
    category: 'amplify'
  },
  {
    if: ['Break DPS'],
    wants: ['Break DMG Buffer'],
    weight: 8,
    reason: 'Break DMG buffs multiply Super Break damage output',
    category: 'core'
  },

  // ==================
  // HARMONY DOUBLE/TRIPLE AMPLIFIER SYNERGIES
  // ==================
  {
    if: ['Team Action Advance'],
    wants: ['Turn Advance', 'Action Advance'],
    weight: 9,
    reason: 'Team Action Advance + Turn Advance creates maximum action efficiency for hypercarries',
    category: 'core'
  },
  {
    if: ['Coord Attack'],
    wants: ['High SPD', 'Turn Advance', 'Action Advance'],
    weight: 8,
    reason: 'More team actions trigger coordinated attacks more frequently for extra damage',
    category: 'amplify'
  },
  {
    if: ['Turn Advance'],
    wants: ['Turn Advance', 'Team Action Advance'],
    weight: 8,
    reason: 'Multiple Turn Advance supports create maximum action efficiency for hypercarries',
    category: 'amplify'
  },
  {
    if: ['Summon Buffer'],
    wants: ['Hypercarry'],
    weight: 5,
    reason: 'Summon buffers provide generic buffs, but work best with summon DPS',
    category: 'amplify'
  },

  // ==================
  // RES PEN / VULNERABILITY SYNERGIES
  // ==================
  {
    if: ['RES PEN'],
    wants: ['Hypercarry', 'Erudition DPS'],
    weight: 9,
    reason: 'RES PEN is an undiluted multiplier that stacks well with self-buffing DPS',
    category: 'amplify'
  },
  {
    if: ['Vulnerability'],
    wants: ['Hypercarry', 'Erudition DPS', 'Sub-DPS'],
    weight: 9,
    reason: 'Vulnerability increases all damage taken by enemies, stacking with other buffs',
    category: 'amplify'
  },

  // ==================
  // SUSTAIN SYNERGIES
  // ==================
  {
    if: ['Hypercarry', 'Follow-up DPS'],
    wants: ['CRIT Rate Buffer'],
    weight: 8,
    reason: 'CRIT Rate buffs dramatically increase damage consistency and average DPS',
    category: 'amplify'
  },
  {
    if: ['Hypercarry'],
    wants: ['DMG Reduction'],
    weight: 6,
    reason: 'Damage reduction allows DPS to survive without needing shields or heavy healing',
    category: 'sustain'
  },
  {
    if: ['AoE', 'Erudition DPS'],
    wants: ['Healing on Hit'],
    weight: 8,
    reason: 'AoE attacks trigger healing on every enemy hit, providing massive sustain in multi-target scenarios',
    category: 'sustain'
  },
  {
    if: ['Shield'],
    wants: ['Hypercarry', 'Follow-up DPS'],
    weight: 7,
    reason: 'Shield sustains provide consistent protection allowing DPS to focus on offense',
    category: 'sustain'
  },

  // ==================
  // AMPLIFIER SYNERGIES
  // ==================
  {
    if: ['Amplifier'],
    wants: ['Amplifier'],
    weight: 12,
    reason: 'Double or triple harmony teams create multiplicative buffs and action loops (Robin+Sunday, Robin+Sunday+Tribbie)',
    category: 'core'
  },

  // ==================
  // DEBUFF STACKER ACTION SYNERGIES
  // ==================
  {
    if: ['Debuff Stacker'],
    wants: ['Turn Advance', 'Action Advance'],
    weight: 10,
    reason: 'Action advance allows debuff stackers (Acheron) to take more turns, generating stacks faster',
    category: 'core'
  },
];

// ==================
// CHARACTER SYNERGY DATA
// ==================
// Extended character data for algorithm

export interface CharacterSynergyData {
  id: string;

  // What this character provides to the team (matches other characters' wants)
  provides: SynergyTag[];

  // Character-specific wants (in addition to generic SYNERGY_RULES)
  // Use for unique synergies that generic rules don't capture
  wants?: SynergyTag[];

  // Anti-synergies (critical conflicts)
  antiSynergies?: SynergyTag[];

  // NOTE: Character.tags (in types/index.ts) triggers SYNERGY_RULES
  // No duplicate tags field needed here
}

// ==================
// TEAM STRUCTURE
// ==================
// TeamRole matches the Prydwen tier list roles
export type TeamRole = 'DPS' | 'Support DPS' | 'Amplifier' | 'Sustain';

export interface TeamStructure {
  name: string;
  slots: TeamRole[];
}

export const TEAM_STRUCTURES: TeamStructure[] = [
  { name: 'Hypercarry', slots: ['DPS', 'Amplifier', 'Amplifier', 'Sustain'] },
  { name: 'Dual DPS', slots: ['DPS', 'Support DPS', 'Amplifier', 'Sustain'] },
  { name: 'Triple Support', slots: ['DPS', 'Amplifier', 'Amplifier', 'Amplifier'] },
];
