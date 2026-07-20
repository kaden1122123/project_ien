/**
 * githubUpload.js — GitHub Git Data API helpers
 * Used by uploader.js to push images directly to GitHub CDN
 */

async function apiRequest(path, token, options = {}) {
    const { method = 'GET', body = null } = options;
    const url = `https://api.github.com${path}`;
    const headers = {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
    };
    if (body) {
        const resp = await fetch(url, {
            method,
            headers,
            body: JSON.stringify(body),
        });
        return resp.json();
    } else {
        const resp = await fetch(url, { method, headers });
        return resp.json();
    }
}

/**
 * Create a Git blob from a Buffer
 */
export async function createBlob(buffer, token, repo) {
    const b64 = buffer.toString('base64');
    const data = { content: b64, encoding: 'base64' };
    const blob = await apiRequest(`/repos/${repo}/git/blobs`, token, {
        method: 'POST',
        body: data,
    });
    return blob.sha;
}

/**
 * Create a Git tree with one file entry
 */
export async function createTree(objectKey, blobSha, token, repo, branch) {
    // Get current commit SHA for the branch
    const refData = await apiRequest(`/repos/${repo}/git/ref/heads/${branch}`, token);
    const currentCommitSha = refData.object.sha;

    const tree = await apiRequest(`/repos/${repo}/git/trees`, token, {
        method: 'POST',
        body: {
            base_tree: currentCommitSha,
            tree: [{
                path: objectKey,
                mode: '100644',
                type: 'blob',
                sha: blobSha,
            }],
        },
    });
    return tree.sha;
}

/**
 * Create a Git commit pointing to a tree
 */
export async function createCommit(message, treeSha, token, repo, branch) {
    // Get current commit SHA for the branch
    const refData = await apiRequest(`/repos/${repo}/git/ref/heads/${branch}`, token);
    const parentCommitSha = refData.object.sha;

    const commit = await apiRequest(`/repos/${repo}/git/commits`, token, {
        method: 'POST',
        body: {
            message,
            tree: treeSha,
            parents: [parentCommitSha],
        },
    });
    return commit.sha;
}

/**
 * Update a branch ref to a new commit
 */
export async function updateRef(commitSha, token, repo, branch) {
    await apiRequest(`/repos/${repo}/git/refs/heads/${branch}`, token, {
        method: 'PATCH',
        body: { sha: commitSha },
    });
}
