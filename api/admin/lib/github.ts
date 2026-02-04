// GitHub API helpers for committing files
// Uses GitHub REST API directly (no Octokit dependency to keep Edge-compatible)

const GITHUB_API = 'https://api.github.com';

interface GitHubError {
  message: string;
  documentation_url?: string;
}

function getConfig() {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;

  if (!token || !owner || !repo) {
    throw new Error('Missing required GitHub environment variables: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO');
  }

  return { token, owner, repo };
}

function getHeaders(token: string): HeadersInit {
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 403 && response.headers.get('X-RateLimit-Remaining') === '0') {
    const resetTime = response.headers.get('X-RateLimit-Reset');
    const retryAfter = resetTime
      ? Math.ceil((parseInt(resetTime) * 1000 - Date.now()) / 1000)
      : 60;
    throw new GitHubRateLimitError(retryAfter);
  }

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;
    try {
      const error = await response.json() as GitHubError;
      errorMessage = error.message || errorMessage;
    } catch {
      // Response wasn't JSON, use status text
      errorMessage = response.statusText || errorMessage;
    }
    throw new GitHubAPIError(response.status, errorMessage);
  }

  return response.json() as Promise<T>;
}

export class GitHubRateLimitError extends Error {
  constructor(public retryAfter: number) {
    super(`GitHub API rate limit exceeded. Retry after ${retryAfter} seconds.`);
    this.name = 'GitHubRateLimitError';
  }
}

export class GitHubAPIError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'GitHubAPIError';
  }
}

/**
 * Get file content and SHA from repository
 */
export async function getFileContent(path: string): Promise<{ content: string; sha: string }> {
  const { token, owner, repo } = getConfig();
  const response = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`,
    { headers: getHeaders(token) }
  );
  if (!response.ok) {
    throw new GitHubAPIError(response.status, 'Failed to get file');
  }
  const file = await response.json() as { content: string; sha: string };
  return {
    content: Buffer.from(file.content, 'base64').toString('utf-8'),
    sha: file.sha
  };
}

/**
 * Commit a file directly to main branch
 */
export async function commitFileToMain(
  path: string,
  content: string,
  message: string
): Promise<{ sha: string }> {
  const { token, owner, repo } = getConfig();

  // Get current file SHA
  const getResponse = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`,
    { headers: getHeaders(token) }
  );
  if (!getResponse.ok && getResponse.status !== 404) {
    throw new GitHubAPIError(getResponse.status, 'Failed to get current file');
  }
  const currentFile = getResponse.status === 404 ? null : await getResponse.json() as { sha: string } | null;

  // Direct commit to main
  const putResponse = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`,
    {
      method: 'PUT',
      headers: getHeaders(token),
      body: JSON.stringify({
        message,
        content: Buffer.from(content).toString('base64'),
        sha: currentFile?.sha,
        branch: 'main'
      })
    }
  );
  if (!putResponse.ok) {
    const error = await putResponse.json() as GitHubError;
    throw new GitHubAPIError(putResponse.status, error.message || 'Commit failed');
  }
  const result = await putResponse.json() as { commit: { sha: string } };
  return { sha: result.commit.sha };
}
