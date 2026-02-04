// Vercel Node.js Function: Get character data from GitHub main branch
// GET /api/get-character?id=character-id
// Headers: Authorization: Bearer <token>

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { getFileContent } from './admin/lib/github.js';
import type { Character } from './types.js';

// Set CORS headers
function setCorsHeaders(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/**
 * Parse character data from TypeScript file content
 */
function parseCharacterFile(fileContent: string): Character {
  try {
    const match = fileContent.match(/export\s+const\s+\w+:\s*Character\s*=\s*(\{[\s\S]*\});/);
    if (!match || !match[1]) {
      throw new Error('Could not find character object in file');
    }
    const objectLiteral = match[1];
    const characterData = new Function('return ' + objectLiteral)() as Character;
    return characterData;
  } catch (error) {
    throw new Error(`Failed to parse character file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Get character ID from query
  const characterId = req.query.id;
  if (!characterId || typeof characterId !== 'string') {
    return res.status(400).json({ success: false, error: 'Character ID required' });
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
    return res.status(500).json({ success: false, error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, supabaseSecretKey);

  // Verify user token and check if contributor/admin
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('id', userData.user.id)
    .single();

  if (!roleData || !['admin', 'contributor'].includes(roleData.role)) {
    return res.status(403).json({ success: false, error: 'Access denied: contributor or admin role required' });
  }

  try {
    // Fetch character file from GitHub main branch
    const filePath = `frontend/src/data/characters/${characterId}.ts`;
    const { content } = await getFileContent(filePath);

    // Parse the character data
    const character = parseCharacterFile(content);

    return res.status(200).json({
      success: true,
      character,
    });
  } catch (error) {
    console.error('Error fetching character:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch character',
    });
  }
}
