// Vercel Node.js Function: Approve and deploy character edit to GitHub
// POST /api/approve-edit
// Body: { editId: number }
// Headers: Authorization: Bearer <token>

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { getFileContent, commitFileToMain, GitHubRateLimitError, GitHubAPIError } from './admin/lib/github.js';
import { generateCharacterFile } from './admin/lib/codegen.js';
import type { Character, Role, TierRating } from './types.js';

/**
 * Set a value at a dot-separated path in an object.
 */
function setValueAtPath(obj: unknown, path: string, value: unknown): void {
  const parts = path.split('.');
  if (parts.length === 0) return;

  let current = obj as Record<string, unknown>;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    // Handle array indices
    if (/^\d+$/.test(part)) {
      const index = parseInt(part, 10);
      if (!Array.isArray(current)) return;
      if (current[index] === undefined) {
        (current as unknown[])[index] = {};
      }
      current = current[index] as Record<string, unknown>;
    } else {
      if (!(part in current) || current[part] === null || current[part] === undefined) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }
  }

  const lastPart = parts[parts.length - 1]!;
  current[lastPart] = value;
}

// Types for database records
interface CharacterEdit {
  id: number;
  character_id: string;
  character_data: Character | null;  // Legacy: full character data (for backward compatibility)
  field_changes: Record<string, unknown> | null;  // New: field-level changes { "path": value }
  tier_edits: TierEditsMap | null;
  status: 'pending' | 'approved' | 'rejected' | 'deployed';
  editor_id: string;
  created_at: string;
  reviewer_id: string | null;
  reviewed_at: string | null;
  github_commit_sha: string | null;
  change_summary: string | null;
  review_notes: string | null;
}

// Tier edits structure as stored in database (matches useCharacterEditor.ts TierEdits)
interface TierEditsMap {
  moc?: Partial<Record<Role, TierRating>>;
  pf?: Partial<Record<Role, TierRating>>;
  as?: Partial<Record<Role, TierRating>>;
}

// Validate request body
interface ApproveEditRequest {
  editId: number;
}

function isValidRequest(body: unknown): body is ApproveEditRequest {
  return (
    typeof body === 'object' &&
    body !== null &&
    'editId' in body &&
    typeof (body as ApproveEditRequest).editId === 'number'
  );
}

// Set CORS headers
function setCorsHeaders(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/**
 * Parse character data from TypeScript file content
 * Extracts the Character object from: export const characterName: Character = { ... };
 */
function parseCharacterFile(fileContent: string): Character {
  try {
    // Extract the object literal between 'export const ... = {' and final '};'
    const match = fileContent.match(/export\s+const\s+\w+:\s*Character\s*=\s*(\{[\s\S]*\});/);
    if (!match || !match[1]) {
      throw new Error('Could not find character object in file');
    }

    // Use Function constructor to safely evaluate the object literal
    // This is safe because the content comes from our own repository
    const objectLiteral = match[1];
    const characterData = new Function('return ' + objectLiteral)() as Character;

    return characterData;
  } catch (error) {
    throw new Error(`Failed to parse character file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  setCorsHeaders(res);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Extract auth token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Missing or invalid Authorization header' });
  }
  const token = authHeader.slice(7);

  // Initialize Supabase client
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    console.error('Missing Supabase environment variables');
    return res.status(500).json({ success: false, error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, supabaseSecretKey);

  // Verify the user's token and admin status
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }

  // Check if user is admin
  const { data: roleData, error: roleError } = await supabase
    .from('user_roles')
    .select('id, role')
    .eq('id', userData.user.id)
    .single();

  if (roleError || !roleData || roleData.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Access denied: admin privileges required' });
  }

  // Parse request body
  const body = req.body;

  if (!isValidRequest(body)) {
    return res.status(400).json({ success: false, error: 'Invalid request: editId (number) required' });
  }

  const { editId } = body;

  // Fetch the edit from database
  const { data: edit, error: editError } = await supabase
    .from('character_edits')
    .select('*')
    .eq('id', editId)
    .single();

  if (editError || !edit) {
    return res.status(404).json({ success: false, error: 'Edit not found' });
  }

  const characterEdit = edit as CharacterEdit;

  // Verify edit is in approved status (ready for deployment)
  if (characterEdit.status !== 'approved') {
    return res.status(400).json({
      success: false,
      error: `Edit cannot be deployed: current status is '${characterEdit.status}'. Only 'approved' edits can be deployed.`,
    });
  }

  // Verify GitHub environment variables are set before attempting API calls
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_OWNER || !process.env.GITHUB_REPO) {
    console.error('Missing GitHub environment variables');
    return res.status(500).json({
      success: false,
      error: 'Server configuration error: GitHub integration not configured',
    });
  }

  try {
    let characterData: Character;
    const filePath = `frontend/src/data/characters/${characterEdit.character_id}.ts`;

    // Check if this is a legacy edit (full character_data) or new edit (field_changes)
    if (characterEdit.field_changes) {
      // NEW SYSTEM: Field-level changes - fetch current file and apply changes
      console.log(`Processing field-level edit for ${characterEdit.character_id}`);

      // Fetch current character file from GitHub
      let fileContent: string;
      try {
        const fileData = await getFileContent(filePath);
        fileContent = fileData.content;
      } catch (error) {
        console.error('Failed to fetch character file from GitHub:', error);
        return res.status(500).json({
          success: false,
          error: `Failed to fetch current character file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }

      // Parse the current character data
      try {
        characterData = parseCharacterFile(fileContent);
      } catch (parseError) {
        console.error('Failed to parse character file:', parseError);
        return res.status(500).json({
          success: false,
          error: `Failed to parse character file: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
        });
      }

      // Apply each field change to the parsed character data
      for (const [path, value] of Object.entries(characterEdit.field_changes)) {
        try {
          setValueAtPath(characterData, path, value);
        } catch (setError) {
          console.error(`Failed to set value at path '${path}':`, setError);
          return res.status(500).json({
            success: false,
            error: `Failed to apply field change at '${path}': ${setError instanceof Error ? setError.message : 'Unknown error'}`,
          });
        }
      }

      console.log(`Applied ${Object.keys(characterEdit.field_changes).length} field changes`);
    } else if (characterEdit.character_data) {
      // LEGACY SYSTEM: Full character data replacement
      console.log(`Processing legacy full-data edit for ${characterEdit.character_id}`);
      characterData = characterEdit.character_data;
    } else {
      // Neither field_changes nor character_data present - invalid edit
      return res.status(400).json({
        success: false,
        error: 'Invalid edit: neither field_changes nor character_data present',
      });
    }

    // Generate the updated character file content
    let characterFileContent: string;
    try {
      characterFileContent = generateCharacterFile(characterData);
    } catch (genError) {
      console.error('Code generation error:', genError);
      return res.status(500).json({
        success: false,
        error: `Failed to generate character file: ${genError instanceof Error ? genError.message : 'Unknown error'}`,
      });
    }

    // Handle tier edits warning
    if (characterEdit.tier_edits && Object.keys(characterEdit.tier_edits).length > 0) {
      console.warn(
        `Edit ${editId} has tier edits that need manual review:`,
        characterEdit.tier_edits
      );
    }

    // Prepare commit message
    const commitMessage = `Update ${characterData.name} character data

${characterEdit.change_summary || 'Character data update'}

Edit ID: ${editId}
Approved by: ${userData.user.email}`;

    // Commit directly to main branch
    const result = await commitFileToMain(filePath, characterFileContent, commitMessage);

    // Update edit status to deployed
    const { error: updateError } = await supabase
      .from('character_edits')
      .update({
        status: 'deployed',
        github_commit_sha: result.sha,
        reviewer_id: userData.user.id,
        reviewed_at: new Date().toISOString(),
        deployed_at: new Date().toISOString(),
      })
      .eq('id', editId);

    if (updateError) {
      console.error('Failed to update edit status:', updateError);
    }

    const hasTierEdits = characterEdit.tier_edits && Object.keys(characterEdit.tier_edits).length > 0;

    return res.status(200).json({
      success: true,
      commitSha: result.sha,
      message: `Deployed ${characterData.name} update directly to main`,
      tierEditsNote: hasTierEdits
        ? 'Note: Tier edits need to be applied manually to tierData.ts'
        : undefined,
    });
  } catch (error) {
    if (error instanceof GitHubRateLimitError) {
      res.setHeader('Retry-After', String(error.retryAfter));
      return res.status(429).json({
        success: false,
        error: 'GitHub API rate limit exceeded',
        retryAfter: error.retryAfter,
      });
    }

    if (error instanceof GitHubAPIError) {
      return res.status(error.status >= 500 ? 502 : 500).json({
        success: false,
        error: `GitHub API error: ${error.message}`,
      });
    }

    console.error('Unexpected error during commit:', error);
    return res.status(500).json({
      success: false,
      error: `Failed to commit changes: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }
}
