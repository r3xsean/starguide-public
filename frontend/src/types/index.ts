// ========================================
// STARGUIDE - Core Type Definitions
// ========================================

// Element types (7 total)
export type Element =
  | 'Physical'
  | 'Fire'
  | 'Ice'
  | 'Lightning'
  | 'Wind'
  | 'Quantum'
  | 'Imaginary';

// Path types (8 total)
export type Path =
  | 'Destruction'
  | 'Hunt'
  | 'Erudition'
  | 'Harmony'
  | 'Nihility'
  | 'Preservation'
  | 'Abundance'
  | 'Remembrance';

// Character roles (from Prydwen tier lists)
export type Role = 'DPS' | 'Support DPS' | 'Amplifier' | 'Sustain';

// Tier rankings (from Prydwen, extended with negative tiers for investment gains)
// T-1 = Peak performance (max invested meta character)
// T-0.5 = Excellent performance (well-invested strong character)
// T0-T5 = Standard Prydwen tiers (T0 = great, T5 = weak)
export type TierRating = 'T-1' | 'T-0.5' | 'T0' | 'T0.5' | 'T1' | 'T1.5' | 'T2' | 'T3' | 'T4' | 'T5';

// Team tier (calculated from character tiers)
export type TeamTier = 'T-1' | 'T-0.5' | 'T0' | 'T0.5' | 'T1' | 'T1.5' | 'T2' | 'T3' | 'T4' | 'T5';

// Teammate rating (S+ = boosted by investment synergy, S = best, D = niche)
export type TeammateRating = 'S+' | 'S' | 'A' | 'B' | 'C' | 'D';

// Team rating for bestTeams
export type TeamRating = 'S' | 'A' | 'B' | 'C';

// Role-based tiers for a single game mode
export type RoleTiers = Partial<Record<Role, TierRating>>;

// Endgame role-based tiers (per game mode, per role)
export interface EndgameRoleTiers {
  moc?: RoleTiers;   // Memory of Chaos
  pf?: RoleTiers;    // Pure Fiction
  as?: RoleTiers;    // Apocalyptic Shadow
}

// Tier score mapping (T-1 = best/peak, T5 = worst)
export const TIER_SCORES: Record<TierRating, number> = {
  'T-1': 115,
  'T-0.5': 107,
  'T0': 100,
  'T0.5': 90,
  'T1': 80,
  'T1.5': 70,
  'T2': 60,
  'T3': 50,
  'T4': 40,
  'T5': 30,
};

// Teammate rating score mapping
export const TEAMMATE_RATING_SCORES: Record<TeammateRating, number> = {
  'S+': 6,
  'S': 5,
  'A': 4,
  'B': 3,
  'C': 2,
  'D': 1,
};

// Ownership status
export type OwnershipStatus = 'owned' | 'concept' | 'none';

// ========================================
// Investment System Types (NEW - Overhaul)
// ========================================

/**
 * 1-10 scale for mode strength, effectiveness, etc.
 * Frontend converts to labels via scaleConverters.ts
 */
export type NumericScale = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/**
 * Synergy modifier triggered by a character's investment.
 * Applied BIDIRECTIONALLY by the system - define once, works both ways.
 * Lives on the character whose investment triggers the effect.
 */
export interface SynergyModifier {
  /** The other character this synergy applies with */
  withCharacterId: string;

  /**
   * Modifier value applied to synergy score.
   * Scale: +10 ≈ one tier improvement (C→B, B→A, etc.)
   * Applied equally in BOTH directions by the system.
   */
  modifier: number;

  /** Human-readable explanation of why this investment affects synergy */
  reason: string;
}

/**
 * Definition for a single eidolon level.
 * Penalty system: E6 = 0 (perfect), missing eidolons = cumulative penalties.
 */
export interface EidolonDefinition {
  /** Eidolon level (1-6) */
  level: 1 | 2 | 3 | 4 | 5 | 6;

  /**
   * Penalty for NOT having this eidolon.
   * Always negative or zero. Impact is derived from Math.abs(penalty).
   *
   * Guidelines:
   * - Transformative (game-changing): -30 to -40
   * - Major (substantially changes play): -20 to -29
   * - Significant (meaningful improvement): -10 to -19
   * - Minor (noticeable but small): -5 to -9
   * - Negligible (trace levels, QoL): -1 to -4
   */
  penalty: number;

  /** What this eidolon does mechanically */
  description: string;

  /**
   * Synergy modifiers triggered by having this eidolon.
   * Applied BIDIRECTIONALLY with the named character(s).
   */
  synergyModifiers?: SynergyModifier[];
}

/**
 * Light cone source type
 */
export type LightConeSource = 'signature' | 'standard' | 'event' | 'herta-store' | 'battle-pass' | 'craftable';

/**
 * Definition for a light cone option.
 * Penalty system: Signature S5 = 0 (perfect), alternatives = penalties.
 */
export interface LightConeDefinition {
  /** Light cone ID (kebab-case) */
  id: string;

  /** Display name */
  name: string;

  /** Rarity (3, 4, or 5 star) */
  rarity: 3 | 4 | 5;

  /** Is this the character's signature/BiS light cone? */
  isSignature: boolean;

  /**
   * Penalties for using this LC at different superimposition levels.
   * Signature S5 should be { s1: -X, s5: 0 } where X is the S1 penalty.
   */
  penalties: {
    s1: number;
    s5: number;
  };

  /** General notes about this light cone's benefits */
  notes: string;

  /** Notes about playstyle changes if this LC requires different play */
  playstyleNotes?: string;

  /** How to obtain this light cone */
  source: LightConeSource;

  /**
   * Synergy modifiers triggered by having this light cone.
   * Applied BIDIRECTIONALLY with the named character(s).
   */
  synergyModifiers?: SynergyModifier[];
}

/**
 * Investment data for a character - eidolons and light cones.
 */
export interface CharacterInvestment {
  /**
   * Eidolon definitions. Should have exactly 6 entries (E1-E6).
   * Order by level ascending.
   */
  eidolons: EidolonDefinition[];

  /**
   * Light cone options. Order by recommendation (signature first, then alternatives).
   * Include at least: signature, 1-2 good alternatives, 1 F2P option.
   */
  lightCones: LightConeDefinition[];

  /**
   * Natural language investment priority recommendation.
   * Examples: "S1 > E1 > E2", "E2 > S1 > E1"
   */
  investmentPriority?: string;

  /**
   * Minimum viable investment to use the character effectively.
   * Example: "E0 + On the Fall of an Aeon S5"
   */
  minimumViable?: string;
}

/**
 * Override for a teammate's rating in a specific composition.
 */
export interface TeammateOverride {
  /** Character ID to override */
  id: string;

  /** New rating for this composition (omit to keep base rating) */
  rating?: TeammateRating;

  /** New reason for this composition (omit to keep base reason) */
  reason?: string;

  /** Set to true to EXCLUDE this character from this composition entirely */
  excluded?: boolean;
}

/**
 * A specific team composition/archetype for a character.
 * Uses overrides instead of full teammate lists to reduce duplication.
 */
export interface TeamComposition {
  /** Unique ID for this composition (kebab-case) */
  id: string;

  /** Display name */
  name: string;

  /** What this composition is about */
  description: string;

  /** Is this the default/recommended composition? Only one should be true. */
  isPrimary: boolean;

  /** The core mechanic or synergy that makes this composition work */
  coreMechanic: string;

  /**
   * Modes where this composition struggles despite good teammates.
   * Only specify when there's an inherent weakness in the archetype.
   * Omit entirely if composition works well in all modes.
   *
   * Team generator applies a fixed penalty (~15%) when current mode is listed.
   * This avoids double-counting with teammate ratings (which already reflect quality).
   *
   * Examples:
   * - Sustainless comps: weak in AS (long phases exhaust team)
   * - Single-target comps: weak in PF (inefficient against waves)
   */
  weakModes?: {
    mode: 'moc' | 'pf' | 'as';
    reason: string;
  }[];

  /** Investment notes specific to this composition */
  investmentNotes?: string[];

  /**
   * Required team structure for this composition.
   * Specifies exact counts of each role type.
   * Total must equal 4 (team size).
   * If not specified, generator will create all valid structures.
   *
   * Common structures:
   * - Hypercarry: { dps: 1, amplifier: 2, sustain: 1 }
   * - Dual-carry: { dps: 2, amplifier: 1, sustain: 1 }
   * - Sustainless: { dps: 1, amplifier: 3, sustain: 0 }
   */
  structure?: {
    dps: number;       // Number of DPS/Support DPS slots
    amplifier: number; // Number of Amplifier slots
    sustain: number;   // Number of Sustain slots
  };

  /**
   * Irreplaceable characters for this composition.
   * Without them, the core mechanic doesn't function.
   * Different from S rating - S means "best", core means "no alternative exists".
   *
   * IMPORTANT: At least one composition per character must have NO core requirements
   * to ensure all players can build teams. See "Accessibility Rule" in spec.
   */
  core?: {
    /** Character ID that is irreplaceable */
    characterId: string;
    /** Minimum eidolon required (0 or undefined = any, 1-6 = at least this) */
    minEidolon?: number;
    /** Required light cones (any of these). Empty/undefined = any LC fine */
    lightConeIds?: string[];
    /** Why this character is irreplaceable */
    reason: string;
  }[];

  /**
   * Path constraints for this composition.
   * Example: "Need 2 Erudition characters for Anaxa A4 Trace"
   */
  pathRequirements?: {
    path: Path;
    count: number;
    reason: string;
  }[];

  /**
   * Label constraints for this composition.
   * Used for cross-path requirements based on character labels.
   * Example: "Need 3 Chrysos Heir characters" or "Need 1 Memosprite character"
   */
  labelRequirements?: {
    label: string;
    count: number;
    reason: string;
  }[];

  /**
   * Teammate OVERRIDES for this composition.
   * Characters not listed here use ratings from baseTeammates.
   * Use `excluded: true` to remove a character from this composition.
   */
  teammateOverrides?: {
    dps?: TeammateOverride[];
    subDPS?: TeammateOverride[];
    amplifiers?: TeammateOverride[];
    sustains?: TeammateOverride[];
  };

  /** Pre-built teams for this composition */
  teams?: BestTeam[];
}

// ========================================
// Teammate Recommendation Types
// ========================================

export interface TeammateRec {
  id: string;                    // Character ID (kebab-case)
  rating: TeammateRating;        // S/A/B/C/D
  reason: string;                // Why they synergize (under 80 chars)

  /**
   * Score modifiers based on THIS TEAMMATE's investment level.
   * Receiver's perspective: "I value them more at these levels"
   *
   * Combined with their SynergyModifiers (investment owner's perspective)
   * via averaging at runtime.
   *
   * Scale: +10 ≈ one tier improvement (same as SynergyModifier)
   */
  theirInvestmentModifiers?: {
    level: 1 | 2 | 3 | 4 | 5 | 6;
    modifier: number;
    reason?: string;
  }[];
}

export interface BestTeam {
  name: string;                  // Descriptive team name
  characters: [string, string, string, string];  // Exactly 4 character IDs
  rating: TeamRating;            // S/A/B
  structure: string;             // e.g., 'hypercarry', 'dual-carry', etc.
  notes?: string;                // Optional: Explains WHY this team works (specific synergies)
}

export interface TeamStructures {
  preferred: string;             // Best structure for this character
  viable: string[];              // All structures that work
  notes: string;                 // Why this structure works best
}

export interface Teammates {
  dps?: TeammateRec[];           // For Amplifiers/Sustains: which DPS they support
  subDPS?: TeammateRec[];        // For DPS: dual/triple carry structures
  supportDPS?: TeammateRec[];    // Support DPS characters
  amplifiers?: TeammateRec[];    // Buffers, debuffers
  sustains?: TeammateRec[];      // Healers, shielders
}

export interface Restrictions {
  avoid?: { id: string; reason: string }[];  // Characters to avoid
  warnings?: string[];           // General cautions
}

// ========================================
// Character Data Structure
// ========================================

export interface Character {
  // === Identity ===
  id: string;                    // kebab-case: 'firefly', 'the-herta'
  name: string;                  // Display name: 'Firefly', 'The Herta'
  element: Element;
  path: Path;
  rarity: 4 | 5;

  // === Classification ===
  roles: Role[];                 // From Prydwen: 'DPS', 'Support DPS', 'Amplifier', 'Sustain'
  description?: string;          // 1-2 sentence summary of playstyle
  labels?: string[];             // Descriptive tags (scaling, damage type, mechanics)

  // === NEW: Investment Data (Overhaul) ===
  investment?: CharacterInvestment;

  // === NEW: Base Teammates (Overhaul) ===
  /**
   * Base teammate recommendations that apply to ALL compositions.
   * Compositions can override these with teammateOverrides.
   */
  baseTeammates?: Teammates;

  // === NEW: Compositions (Overhaul) ===
  /**
   * Team compositions with composition-specific overrides.
   * Each composition has its own context and can modify base ratings.
   */
  compositions?: TeamComposition[];

  // === Team Building (LEGACY - keep for backwards compatibility) ===
  teamStructures?: TeamStructures;
  teammates?: Teammates;         // Keep populated during migration
  bestTeams?: BestTeam[];        // Keep populated during migration
  restrictions?: Restrictions;

  // === Legacy fields (to be removed after migration) ===
  tags?: string[];               // Old playstyle tags - DEPRECATED
  provides?: string[];           // Old synergy system - DEPRECATED
  wants?: string[];              // Old synergy system - DEPRECATED
  antiSynergies?: string[];      // Old synergy system - DEPRECATED
  sourceUrl?: string;            // Old source URL - DEPRECATED
}

// ========================================
// Team Display
// ========================================

export interface TeamDisplay {
  id: string;
  name: string;
  characters: Character[];
  reasoning: string[];           // Why this team works
  isAvailable: boolean;          // User owns all characters
  missingCharacters: string[];   // Character IDs user is missing
  rating?: TeamRating;           // S/A/B rating
  structure?: string;            // Team structure type
}

// ========================================
// User & Roster
// ========================================

/**
 * User's investment in a specific character.
 * This is DIFFERENT from Character.investment which defines the eidolon/LC DATA.
 * This tracks what the USER actually has.
 */
export interface UserCharacterInvestment {
  ownership: OwnershipStatus;
  eidolonLevel: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /**
   * Light cone ID from character.investment.lightCones.
   * - undefined or 'generic': No recommended LC (applies generic -40 penalty)
   * - string: ID of a specific recommended LC (uses that LC's penalty)
   */
  lightConeId?: string;
  lightConeSuperimposition?: 1 | 2 | 3 | 4 | 5;
}

/**
 * User's full roster with investment data.
 * Map from character ID to their investment status.
 */
export type UserRosterMap = Map<string, UserCharacterInvestment>;

/**
 * Helper to create a default investment for a newly owned character.
 */
export function createDefaultInvestment(ownership: OwnershipStatus = 'owned'): UserCharacterInvestment {
  return {
    ownership,
    eidolonLevel: 0,
    lightConeId: undefined,
    lightConeSuperimposition: undefined,
  };
}

/**
 * Check if a value is a legacy ownership status (string) vs new investment object.
 */
export function isLegacyOwnership(value: unknown): value is OwnershipStatus {
  return typeof value === 'string' && ['owned', 'concept', 'none'].includes(value);
}

/**
 * @deprecated Use UserRosterMap instead
 */
export interface UserRoster {
  owned: Set<string>;            // Character IDs the user owns
  concept: Set<string>;          // Characters user is considering
}

export interface CharacterSuggestion {
  character: Character;
  impact: number;                // How much it would improve best team score
  unlocksTeams: string[];        // Team names that become available
  reasoning: string;
}

// ========================================
// UI State
// ========================================

export interface FilterState {
  elements: Element[];
  paths: Path[];
  tiers: TierRating[];
  roles: Role[];
  search: string;
  showOwned: boolean;
  showConcept: boolean;
  showUnowned: boolean;
}

// ========================================
// Element Colors (for styling)
// ========================================

export const ELEMENT_COLORS: Record<Element, string> = {
  'Physical': '#c4c4c4',
  'Fire': '#f4634e',
  'Ice': '#47c7fd',
  'Lightning': '#d376f0',
  'Wind': '#5fe8b6',
  'Quantum': '#625afa',
  'Imaginary': '#f3d86b',
};

// ========================================
// Path Icons (emoji placeholders)
// ========================================

export const PATH_ICONS: Record<Path, string> = {
  'Destruction': '⚔️',
  'Hunt': '🎯',
  'Erudition': '📚',
  'Harmony': '🎵',
  'Nihility': '💀',
  'Preservation': '🛡️',
  'Abundance': '💚',
  'Remembrance': '🔮',
};

// ========================================
// Banner Advisor Types
// ========================================

// Granular ratings for calculated scores (Banner Advisor, generated teams)
// Uses +/- modifiers for finer granularity than the base S/A/B/C/D
// S+ is the highest rating, awarded when investment synergy modifiers boost a character
export type GranularRating =
  | 'S+' | 'S' | 'S-'
  | 'A+' | 'A' | 'A-'
  | 'B+' | 'B' | 'B-'
  | 'C+' | 'C' | 'C-'
  | 'D';

export type BannerRating = GranularRating;

export interface BannerCharacterAnalysis {
  characterId: string;
  character: Character | null;  // null if character data doesn't exist yet
  isNew: boolean;
  owned: boolean;

  // Letter rating based on current roster synergy
  rating: BannerRating;

  // Detailed breakdown - who wants this character (with their tier for weighting)
  wantedBy: { name: string; rating: TeammateRating; tier: TierRating }[];

  reasoning: string[];
}

// ========================================
// Community Statistics Types
// ========================================

/**
 * Community statistics for a single character.
 * Aggregated from all user rosters.
 */
export interface CharacterCommunityStats {
  owned: {
    count: number;       // Number of users who own this character
    percentage: number;  // Percentage of total users (0-100)
  };
  planning: {
    count: number;       // Number of users planning to pull
    percentage: number;  // Percentage of total users (0-100)
  };
  eidolons: Record<string, {
    owned: { count: number; percentage: number };    // Of owners
    planning: { count: number; percentage: number }; // Of planners
  }>;
  lightCones: Record<string, {
    owned: { count: number; percentage: number; avgSuperimposition: number };
    planning: { count: number; percentage: number; avgSuperimposition: number };
  }>;
}

/**
 * Full community statistics payload.
 * Fetched from community_stats Supabase table.
 */
export interface CommunityStats {
  characterStats: Record<string, CharacterCommunityStats>;
  totalUsers: number;
  lastAggregatedAt: string;
}
