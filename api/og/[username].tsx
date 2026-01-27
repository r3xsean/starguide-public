import { ImageResponse } from '@vercel/og';

// Types
interface UserProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_character_id: string | null;
  showcase_characters: string[];
  show_investment: 'all' | 'showcase' | 'none';
}

interface PublicRoster {
  roster: [string, any][];
}

interface RosterStats {
  totalOwned: number;
  totalCharacters: number;
  fiveStarCount: number;
  fourStarCount: number;
  signatureLCCount: number;
}

// Helper to fetch profile data
async function fetchProfileData(username: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  try {
    // Fetch profile
    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/user_profiles?username=eq.${username}&is_public=eq.true&select=*`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    );
    const profiles = await profileRes.json();
    if (!profiles || profiles.length === 0) return null;
    const profile: UserProfile = profiles[0];

    // Fetch roster
    const rosterRes = await fetch(
      `${supabaseUrl}/rest/v1/user_data?id=eq.${profile.id}&is_roster_public=eq.true&select=roster`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    );
    const rosters = await rosterRes.json();
    const roster: PublicRoster | null = rosters && rosters.length > 0 ? rosters[0] : null;

    return { profile, roster };
  } catch (e) {
    console.error('Failed to fetch profile data:', e);
    return null;
  }
}

// Calculate roster stats
function calculateStats(roster: PublicRoster | null): RosterStats {
  if (!roster?.roster) {
    return { totalOwned: 0, totalCharacters: 80, fiveStarCount: 0, fourStarCount: 0, signatureLCCount: 0 };
  }

  const owned = roster.roster.filter(([_, inv]: [string, any]) => inv?.ownership === 'owned');

  let fiveStarCount = 0;
  let fourStarCount = 0;
  let signatureLCCount = 0;

  // Note: We'd need character data to determine rarity and signature LCs
  // For now, use approximate counts
  owned.forEach(([charId, inv]: [string, any]) => {
    // Simplified - in reality would check character.rarity
    if (charId.includes('-')) fourStarCount++; // Rough heuristic
    else fiveStarCount++;

    if (inv?.lightConeId) signatureLCCount++;
  });

  return {
    totalOwned: owned.length,
    totalCharacters: 80,
    fiveStarCount,
    fourStarCount,
    signatureLCCount,
  };
}

// Get investment badge text
function getInvestmentBadge(charId: string, roster: PublicRoster | null, showInvestment: string): string {
  if (showInvestment === 'none' || !roster?.roster) return '';

  const investment = roster.roster.find(([id]) => id === charId)?.[1];
  if (!investment || investment.ownership !== 'owned') return '';

  const eidolon = investment.eidolonLevel || 0;
  const lcLevel = investment.lightConeSuperimposition || 0;

  if (eidolon > 0 && lcLevel > 0) return `E${eidolon}S${lcLevel}`;
  if (eidolon > 0) return `E${eidolon}`;
  if (lcLevel > 0) return `S${lcLevel}`;
  return '';
}

export default async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const username = url.pathname.split('/').pop()?.replace('.png', '');

    if (!username) {
      return new Response('Username required', { status: 400 });
    }

    // Fetch profile data
    const data = await fetchProfileData(username);
    if (!data) {
      return new Response('Profile not found', { status: 404 });
    }

    const { profile, roster } = data;
    const stats = calculateStats(roster);
    const displayName = profile.display_name || profile.username;

    // Get showcase characters (max 6 for OG image)
    const showcaseIds = profile.showcase_characters.slice(0, 6);

    // Generate OG image
    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#0a0a14',
            backgroundImage: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(168, 85, 247, 0.05) 50%, rgba(249, 147, 7, 0.05) 100%)',
            padding: '48px 60px',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          {/* Header with Avatar and Stats */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '32px' }}>
            {/* Avatar Circle */}
            <div
              style={{
                width: '120px',
                height: '120px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #f99307, #a855f7, #6366f1)',
                padding: '4px',
                marginRight: '32px',
                display: 'flex',
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  backgroundColor: '#1a1a2e',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '48px',
                  color: 'rgba(255, 255, 255, 0.6)',
                }}
              >
                {profile.avatar_character_id ? '★' : '👤'}
              </div>
            </div>

            {/* Username and Stats */}
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <h1
                style={{
                  fontSize: '48px',
                  fontWeight: 700,
                  color: 'white',
                  margin: '0 0 8px 0',
                  letterSpacing: '-0.02em',
                }}
              >
                {displayName}
              </h1>
              <div style={{ display: 'flex', gap: '24px', fontSize: '24px', color: 'rgba(255, 255, 255, 0.7)' }}>
                <span>{stats.totalOwned}/{stats.totalCharacters} Characters</span>
                <span style={{ color: '#fbbf24' }}>★★★★★: {stats.fiveStarCount}</span>
                <span style={{ color: '#a78bfa' }}>★★★★: {stats.fourStarCount}</span>
              </div>
            </div>
          </div>

          {/* Showcase Section */}
          {showcaseIds.length > 0 && (
            <>
              <div
                style={{
                  fontSize: '20px',
                  color: 'rgba(255, 255, 255, 0.5)',
                  marginBottom: '16px',
                  fontWeight: 500,
                }}
              >
                SHOWCASE
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: '16px',
                  marginBottom: '32px',
                }}
              >
                {showcaseIds.map((charId, i) => (
                  <div
                    key={i}
                    style={{
                      width: '80px',
                      height: '80px',
                      borderRadius: '12px',
                      backgroundColor: 'rgba(255, 255, 255, 0.1)',
                      border: '2px solid rgba(255, 255, 255, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '32px',
                      position: 'relative',
                    }}
                  >
                    ★
                    {profile.show_investment !== 'none' && (
                      <div
                        style={{
                          position: 'absolute',
                          bottom: '-8px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          backgroundColor: '#f99307',
                          color: 'white',
                          fontSize: '12px',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {getInvestmentBadge(charId, roster, profile.show_investment)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Footer */}
          <div
            style={{
              marginTop: 'auto',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                fontSize: '32px',
                fontWeight: 700,
                color: '#f99307',
                letterSpacing: '0.05em',
              }}
            >
              STARGUIDE
            </div>
            <div
              style={{
                fontSize: '18px',
                color: 'rgba(255, 255, 255, 0.5)',
              }}
            >
              starguide-bay.vercel.app/u/{username}
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (e) {
    console.error('OG image generation error:', e);
    return new Response('Failed to generate image', { status: 500 });
  }
}
