/**
 * CHANGELOG DATA FILE
 *
 * This file contains user-facing changelog entries shown to returning visitors.
 *
 * IMPORTANT: Update this file when shipping user-visible changes!
 * - Keep entries USER-FOCUSED (what they can do now), not developer-focused
 * - Group related changes into single entries (don't list every commit)
 * - Use clear, non-technical language
 *
 * VERSION NUMBERING (Major.Minor.Patch):
 * - MAJOR (x.0.0): Breaking changes, complete redesigns, major new sections
 * - MINOR (0.x.0): New features users can interact with (new buttons, views, modes)
 * - PATCH (0.0.x): Improvements, bug fixes, tweaks to existing features
 *
 * Entry types:
 * - 'feature': New functionality users can use
 * - 'improvement': Enhancements to existing features
 * - 'fix': Bug fixes that affected users
 * - 'content': New characters, data updates, etc.
 */

export type ChangelogEntryType = 'feature' | 'improvement' | 'fix' | 'content';

export interface ChangelogEntry {
  type: ChangelogEntryType;
  text: string;
}

export interface ChangelogVersion {
  /** Semantic version (e.g., '1.2.0') or date-based (e.g., '2024-12-12') */
  version: string;
  /** ISO date string (YYYY-MM-DD) */
  date: string;
  /** User-facing entries for this version */
  entries: ChangelogEntry[];
}

/**
 * Changelog entries - newest first!
 *
 * Add new versions at the TOP of this array.
 */
export const changelog: ChangelogVersion[] = [
  {
    version: '3.9.0',
    date: '2026-02-04',
    entries: [
      { type: 'feature', text: 'Roster Management page - dedicated full-page view for managing your character collection with visible names and explicit ownership controls' },
      { type: 'feature', text: 'Group characters by element, path, rarity, role, or ownership status with tier or alphabetical sorting' },
      { type: 'improvement', text: 'Planned characters now show a dotted border to distinguish them from owned characters beyond color alone' },
    ],
  },
  {
    version: '3.8.0',
    date: '2026-01-23',
    entries: [
      { type: 'feature', text: 'DPS recommendations in Pull Advisor - "For Your Supports" tab now shows which DPS you can build teams for based on your owned supports' },
      { type: 'feature', text: 'DPS filter in Pull Advisor - filter support recommendations by specific DPS to see who would help that character' },
      { type: 'improvement', text: 'Quality-aware scoring - DPS recommendations now consider teammate quality (S-tier supports score higher than B-tier)' },
      { type: 'improvement', text: 'Better support rankings - supports wanted by many DPS now score higher (breadth bonus)' },
    ],
  },
  {
    version: '3.7.0',
    date: '2026-01-22',
    entries: [
      { type: 'improvement', text: 'Redesigned playstyle selector - now shows best team compositions with larger portraits and grouped alternatives' },
      { type: 'feature', text: 'Playstyle context indicator - tabs now show which playstyle is filtering your teammates and teams' },
      { type: 'improvement', text: 'Smarter alternative suggestions - S-tier alternatives shown first, duplicate roles share combined alternatives' },
    ],
  },
  {
    version: '3.6.0',
    date: '2026-01-21',
    entries: [
      { type: 'feature', text: 'Public profiles - Share your collection at starguide-bay.vercel.app/u/username' },
      { type: 'feature', text: 'Profile showcase - Highlight your favorite 4-8 characters on your profile' },
      { type: 'feature', text: 'Roster statistics and element/path distribution charts on profiles' },
      { type: 'feature', text: '"Rare finds" section showing characters few players own' },
    ],
  },
  {
    version: '3.5.0',
    date: '2026-01-14',
    entries: [
      { type: 'feature', text: 'Share direct links to characters - URLs now update when viewing character pages (e.g., starguide-bay.vercel.app/character/acheron)' },
      { type: 'improvement', text: 'Better search engine optimization - character pages now have unique titles and descriptions for improved discoverability' },
      { type: 'improvement', text: 'Shareable page previews - sharing links on social media now shows character-specific images and descriptions' },
    ],
  },
  {
    version: '3.4.0',
    date: '2025-12-17',
    entries: [
      { type: 'content', text: 'Version 3.8 Patch Update - The Dahlia character data with full teammate recommendations, team compositions, and investment info' },
      { type: 'content', text: 'Major Break meta update - Firefly, Rappa, Boothill, and break supports buffed significantly in tier lists' },
      { type: 'content', text: 'Updated 8 Break characters (Firefly, Rappa, Boothill, Fugue, Lingsha, Ruan Mei, Gallagher, Harmony Trailblazer) with The Dahlia synergies' },
      { type: 'content', text: 'Banner schedule updated for Version 3.8 (Dahlia/Firefly, Fugue/Lingsha, Aglaea/Sunday)' },
    ],
  },
  {
    version: '3.3.0',
    date: '2025-12-17',
    entries: [
      { type: 'feature', text: 'Light cone images now display in the Investment panel - easily identify light cones at a glance' },
    ],
  },
  {
    version: '3.2.0',
    date: '2025-12-16',
    entries: [
      { type: 'feature', text: 'Community statistics - see what percentage of players own each character, eidolon levels, and light cone choices' },
      { type: 'improvement', text: 'Ownership stats shown on unowned characters to help with pull decisions' },
      { type: 'improvement', text: 'Eidolon and light cone popularity stats in the Investment panel' },
    ],
  },
  {
    version: '3.1.1',
    date: '2025-12-16',
    entries: [
      { type: 'improvement', text: 'Investment panel redesigned with clearer visual hierarchy - "Your Tier" is now the hero element with dynamic glow and progress indicator' },
      { type: 'improvement', text: 'Tier contribution now displays clearly - removed "power" terminology and replaced with "tier pts" to avoid damage/buff confusion' },
      { type: 'improvement', text: 'Fixed investment scoring so every eidolon/light cone contributes immediately - no more "wasted" first investments' },
      { type: 'improvement', text: 'Progress bar now accurately shows how far you are toward the next tier, with precise point requirements' },
      { type: 'improvement', text: 'Added helpful tip to playstyle selector - users now see that changing playstyle affects all team recommendations' },
      { type: 'improvement', text: 'Fixed tier badge sizing in character cards to properly display "T-0.5" and "T-1" without breaking layout' },
      { type: 'fix', text: 'Removed "Rating is wrong" feedback option for team issues - focus feedback on actionable problems' },
    ],
  },
  {
    version: '3.1.0',
    date: '2025-12-15',
    entries: [
      { type: 'feature', text: 'Contextual feedback buttons - flag icons throughout the app let you report missing teammates, wrong ratings, tier issues, and more' },
      { type: 'improvement', text: 'Feedback is now more structured - select specific issues like "rating wrong" or "teammate missing" for faster resolution' },
    ],
  },
  {
    version: '3.0.0',
    date: '2025-12-14',
    entries: [
      { type: 'feature', text: 'User accounts - sign in with email or Google to sync your roster and settings across devices' },
      { type: 'feature', text: 'Cloud sync - your character roster, investments, and favorited teams automatically sync when signed in' },
      { type: 'feature', text: 'Guest mode - use the app without an account (data stays on your device)' },
      { type: 'feature', text: 'Account settings - manage your account, export data, and sign out from the new settings menu' },
    ],
  },
  {
    version: '2.0.0',
    date: '2025-12-14',
    entries: [
      { type: 'feature', text: 'Investment tracking - set your eidolon levels and light cones for all characters to get personalized team rankings' },
      { type: 'feature', text: 'Team generation now accounts for your actual investment - E6S5 teams rank higher than E0 teams' },
      { type: 'feature', text: 'Investment planning mode - preview any character at any eidolon/light cone combination before deciding to pull' },
      { type: 'improvement', text: 'Teams now ranked with granular precision based on investment differences, not just tier labels' },
      { type: 'improvement', text: 'Mobile: Investment selectors auto-scroll into view for easier selection' },
      { type: 'improvement', text: 'Page automatically scrolls to top when switching between main tabs' },
      { type: 'improvement', text: 'Character grid now scrolls naturally with the page instead of having nested scrollbars' },
      { type: 'fix', text: 'Fixed team scoring bug where T0.5 teams were ranking lower than T1 teams' },
    ],
  },
  {
    version: '1.4.0',
    date: '2025-12-13',
    entries: [
      { type: 'content', text: 'Major character data overhaul - all 80 characters now have detailed teammate recommendations and team compositions' },
      { type: 'improvement', text: 'Team generation now uses composition-specific ratings for more accurate team suggestions' },
      { type: 'feature', text: 'Coming soon: Eidolon and Light Cone tracking to personalize recommendations based on your investment' },
    ],
  },
  {
    version: '1.3.0',
    date: '2025-12-12',
    entries: [
      { type: 'feature', text: 'Pull Advisor now considers character tier - higher tier characters rank higher' },
      { type: 'feature', text: 'Pull Advisor now applies coverage penalty - characters you already have good options for rank lower' },
      { type: 'fix', text: 'Fixed incorrect Cerydra anti-synergy with Seele (Seele uses Skill, not Enhanced Basic)' },
      { type: 'content', text: 'Added Sunday as teammate option for Seele' },
      { type: 'content', text: 'Added Cyrene synergies for Aglaea and Hysilens' },
    ],
  },
  {
    version: '1.2.2',
    date: '2025-12-12',
    entries: [
      { type: 'improvement', text: 'Improved Imbibitor Lunae teammate ratings - Robin now rated A-tier for strong Sunday+Robin synergy' },
      { type: 'improvement', text: 'Sunday+Robin team for Imbibitor Lunae upgraded to A-tier (renamed "Charmony Siblings")' },
    ],
  },
  {
    version: '1.2.1',
    date: '2025-12-12',
    entries: [
      { type: 'improvement', text: 'Team tier ratings now reflect synergy quality - poor team composition will show a lower tier' },
      { type: 'improvement', text: 'My Teams view now generates better teams for support characters (Amplifiers/Sustains)' },
      { type: 'improvement', text: 'Teams with strong synergies now rank higher than teams with just high-tier characters' },
    ],
  },
  {
    version: '1.2.0',
    date: '2025-12-12',
    entries: [
      { type: 'feature', text: 'Added favorite (heart) button to save your best teams - favorited teams appear at the top' },
      { type: 'feature', text: 'Added AVG mode option in Best Teams view to show averaged tiers across all game modes' },
      { type: 'improvement', text: 'Team ratings (S/A/B/C) now factor in character tiers, not just synergy' },
      { type: 'improvement', text: 'Character tiers in Best Teams view now change based on selected game mode (MoC/PF/AS/AVG)' },
      { type: 'improvement', text: 'Unified tier badge styling for better readability' },
      { type: 'fix', text: 'Fixed locked teams showing characters in wrong order' },
    ],
  },
  {
    version: '1.1.0',
    date: '2024-12-12',
    entries: [
      { type: 'feature', text: 'Added "What\'s New" popup to show updates when you return' },
      { type: 'improvement', text: 'Team composition now shows characters in optimal order' },
      { type: 'fix', text: 'Character selection modal no longer gets cut off on mobile' },
    ],
  },
  // Add older versions below as needed
];

/** Get the latest version string for tracking */
export const currentVersion = changelog[0]?.version ?? '1.0.0';

/** Get entries newer than a given version */
export function getEntriesSinceVersion(lastSeenVersion: string | null): ChangelogVersion[] {
  if (!lastSeenVersion) {
    // First visit - return empty (they'll see changelog next time)
    return [];
  }

  const lastSeenIndex = changelog.findIndex(v => v.version === lastSeenVersion);

  if (lastSeenIndex === -1) {
    // Version not found (maybe very old) - show ALL versions
    return changelog;
  }

  if (lastSeenIndex === 0) {
    // Already on latest
    return [];
  }

  // Return versions newer than last seen
  return changelog.slice(0, lastSeenIndex);
}
