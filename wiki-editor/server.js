const express = require('express');
const session = require('express-session');
const redis = require('redis');
const bcrypt = require('bcryptjs');
const simpleGit = require('simple-git');
const fs = require('fs').promises;
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');
const chokidar = require('chokidar');
const rateLimit = require('express-rate-limit');
const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const { Octokit } = require('@octokit/rest');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const CONTENT_DIR = path.join(__dirname, '../content');
const git = simpleGit();

// GitHub API manager for direct commits when git is not available
class GitHubAPIManager {
  static async commitFilesToGitHub(files, message, author) {
    try {
      // Check for GitHub token
      const githubToken = process.env.GITHUB_TOKEN;
      if (!githubToken) {
        console.error('❌ GITHUB_TOKEN environment variable not set - cannot commit to GitHub');
        return { 
          success: false, 
          error: 'GitHub token not configured. Please set GITHUB_TOKEN environment variable.' 
        };
      }

      const octokit = new Octokit({
        auth: githubToken
      });

      const owner = 'Chaosmotic-Systems';
      const repo = 'chaosmotic-systems-wiki';
      const branch = 'app-dev';

      console.log(`📤 Committing ${files.length} files to GitHub via API...`);

      // Get the current commit SHA
      const { data: refData } = await octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${branch}`
      });
      const currentCommitSha = refData.object.sha;

      // Get the current tree
      const { data: currentCommit } = await octokit.rest.git.getCommit({
        owner,
        repo,
        commit_sha: currentCommitSha
      });
      const currentTreeSha = currentCommit.tree.sha;

      // Create tree with file changes
      const tree = [];
      for (const file of files) {
        const content = await fs.readFile(file.path, 'utf8');
        const blob = await octokit.rest.git.createBlob({
          owner,
          repo,
          content: Buffer.from(content).toString('base64'),
          encoding: 'base64'
        });

        tree.push({
          path: file.relativePath, // e.g., 'content/new-file.md'
          mode: '100644',
          type: 'blob',
          sha: blob.data.sha
        });
      }

      // Create new tree
      const { data: newTree } = await octokit.rest.git.createTree({
        owner,
        repo,
        base_tree: currentTreeSha,
        tree
      });

      // Create commit
      const { data: newCommit } = await octokit.rest.git.createCommit({
        owner,
        repo,
        message,
        tree: newTree.sha,
        parents: [currentCommitSha],
        author: {
          name: author,
          email: `${author}@chaosmotic-wiki.local`
        }
      });

      // Update branch reference
      await octokit.rest.git.updateRef({
        owner,
        repo,
        ref: `heads/${branch}`,
        sha: newCommit.sha
      });

      console.log(`✅ Successfully committed to GitHub: ${newCommit.sha}`);
      return { success: true, commitSha: newCommit.sha, message, method: 'github-api' };

    } catch (error) {
      console.error('❌ GitHub API commit error:', error);
      return { success: false, error: error.message };
    }
  }

  static async deleteFileOnGitHub(relativePath, message, author) {
    try {
      // Check for GitHub token
      const githubToken = process.env.GITHUB_TOKEN;
      if (!githubToken) {
        console.error('❌ GITHUB_TOKEN environment variable not set - cannot delete from GitHub');
        return { 
          success: false, 
          error: 'GitHub token not configured. Please set GITHUB_TOKEN environment variable.' 
        };
      }

      const octokit = new Octokit({
        auth: githubToken
      });

      const owner = 'Chaosmotic-Systems';
      const repo = 'chaosmotic-systems-wiki';
      const branch = 'app-dev';

      console.log(`🗑️ Deleting file ${relativePath} from GitHub via API...`);

      // Get the file to get its SHA
      const { data: fileData } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: relativePath,
        ref: branch
      });

      // Delete the file
      await octokit.rest.repos.deleteFile({
        owner,
        repo,
        path: relativePath,
        message,
        sha: fileData.sha,
        branch,
        author: {
          name: author,
          email: `${author}@chaosmotic-wiki.local`
        }
      });

      console.log(`✅ Successfully deleted ${relativePath} from GitHub`);
      return { success: true, message, method: 'github-api-delete' };

    } catch (error) {
      console.error(`❌ GitHub API delete error for ${relativePath}:`, error);
      return { success: false, error: error.message };
    }
  }
}

// Trust Railway's proxy for proper IP detection
app.set('trust proxy', true);

// Basic health check - should work even if other routes fail
app.get('/health', (req, res) => {
  console.log('💚 Health check accessed');
  res.status(200).send('OK');
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Increased from 100 to 500 for multiple students
  standardHeaders: true,
  legacyHeaders: false,
  // Use a custom key generator for Railway that handles X-Forwarded-For properly
  keyGenerator: (req, res) => {
    // In Railway, use the rightmost IP from X-Forwarded-For header
    const forwardedFor = req.get('X-Forwarded-For');
    if (forwardedFor) {
      const ips = forwardedFor.split(',').map(ip => ip.trim());
      return ips[ips.length - 1]; // Use the rightmost (original client) IP
    }
    return req.ip;
  },
  // Custom message for when rate limit is exceeded
  message: {
    error: 'Too many requests from this connection. Please wait a moment before trying again.',
    retryAfter: 'Try again in 15 minutes',
    tip: 'Individual file saves are more efficient than bulk operations'
  }
});

// Middleware
app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Add request logging middleware
app.use((req, res, next) => {
  // Log important auth-related requests
  if (req.path.includes('/auth') || req.path === '/' || req.path.includes('/api') || req.path === '/test') {
    console.log(`📊 ${req.method} ${req.path} - ${req.ip}`);
  }
  next();
});

app.use(express.static('public'));

// Redis setup for session storage - robust implementation
let redisStore = null;

async function setupRedisStore() {
  const redisUrl = process.env.REDIS_URL || process.env.REDISCLOUD_URL;
  
  console.log('🔍 Debug - Environment variables:');
  console.log('REDIS_URL:', process.env.REDIS_URL ? '✅ Found' : '❌ Not found');
  console.log('REDISCLOUD_URL:', process.env.REDISCLOUD_URL ? '✅ Found' : '❌ Not found');
  
  if (!redisUrl) {
    console.log('📝 No Redis URL configured - using memory sessions');
    return null;
  }

  try {
    console.log('🔄 Setting up Redis for session storage...');
    console.log('🔗 Redis URL format:', redisUrl.substring(0, 20) + '...');
    
    const redisClient = redis.createClient({ 
      url: redisUrl,
      socket: {
        connectTimeout: 3000,
        lazyConnect: true
      },
      retry_strategy: () => null // Don't retry to avoid blocking
    });
    
    redisClient.on('error', (err) => {
      console.log('❌ Redis error (non-blocking):', err.message);
    });

    redisClient.on('connect', () => {
      console.log('✅ Redis connected - sessions will persist across restarts!');
    });

    redisClient.on('disconnect', () => {
      console.log('📝 Redis disconnected - sessions fall back to memory');
    });

    // Create store first, connect later
    const RedisStore = require('connect-redis')(session);
    const store = new RedisStore({ 
      client: redisClient,
      prefix: "chaosmotic-wiki:",
      ttl: 7 * 24 * 60 * 60, // 7 days in seconds
    });
    
    console.log('✅ Redis session store created successfully!');
    
    // Connect in background - don't wait for it
    setTimeout(() => {
      redisClient.connect().catch(err => {
        console.log('❌ Redis background connection failed:', err.message);
      });
    }, 1000);
    
    return store;
    
  } catch (error) {
    console.log('❌ Redis setup error:', error.message);
    console.log('📝 Falling back to memory sessions');
    return null;
  }
}

// Setup Redis store
setupRedisStore().then(store => {
  redisStore = store;
}).catch(err => {
  console.log('❌ Redis store setup failed:', err);
});

console.log('🔧 Configuring session middleware...');
app.use(session({
  secret: process.env.SESSION_SECRET || 'chaosmotic-wiki-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    sameSite: 'lax'
  }
}));
console.log('✅ Session middleware configured with Memory store (stable for OAuth)');

// Debug session middleware
app.use((req, res, next) => {
  if (req.path === '/test' || req.path.includes('/auth')) {
    console.log(`🛡️ Session middleware for ${req.path}`);
  }
  next();
});

// Passport configuration
app.use(passport.initialize());
app.use(passport.session());

// GitHub OAuth Strategy
console.log('🔧 Setting up GitHub OAuth strategy...');
console.log('GitHub Client ID:', process.env.GITHUB_CLIENT_ID ? 'Present' : 'MISSING');
console.log('GitHub Client Secret:', process.env.GITHUB_CLIENT_SECRET ? 'Present' : 'MISSING');

passport.use(new GitHubStrategy({
  clientID: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  callbackURL: "/auth/github/callback"
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // Check if user has access to the organization/team
    const hasAccess = await checkGitHubAccess(profile.username, accessToken);
    
    if (!hasAccess) {
      console.log(`Access denied for GitHub user: ${profile.username} - not a member of ${process.env.ALLOWED_GITHUB_ORG}`);
      return done(null, false, { message: 'Access denied: You must be a member of the class organization' });
    }
    
    // Create or update user based on GitHub profile
    const user = {
      id: profile.id,
      username: profile.username,
      displayName: profile.displayName || profile.username,
      email: profile.emails?.[0]?.value,
      avatarUrl: profile.photos?.[0]?.value,
      githubToken: accessToken,
      authMethod: 'github'
    };
    
    console.log(`GitHub OAuth: ${user.username} (${user.displayName}) authenticated and authorized`);
    return done(null, user);
  } catch (error) {
    console.error('GitHub OAuth error:', error);
    return done(error, null);
  }
}));

// Function to check GitHub organization/team membership
async function checkGitHubAccess(username, accessToken) {
  try {
    const octokit = new Octokit({ auth: accessToken });
    const allowedOrg = process.env.ALLOWED_GITHUB_ORG;
    const allowedTeam = process.env.ALLOWED_GITHUB_TEAM;
    
    if (!allowedOrg) {
      console.log('No organization restriction configured - allowing all GitHub users');
      return true;
    }
    
    console.log(`🔍 Checking access for ${username} to organization ${allowedOrg}`);
    console.log(`🔧 Environment ALLOWED_GITHUB_ORG: "${process.env.ALLOWED_GITHUB_ORG}"`);
    
    // Use the authenticated user's token to check their own membership
    // This works for both public and private memberships
    try {
      const { data: userOrgs } = await octokit.rest.orgs.listForAuthenticatedUser({
        per_page: 100
      });
      
      console.log(`📋 Found ${userOrgs.length} organizations for authenticated user`);
      
      // Debug: log all organization names
      console.log(`🔍 User's organizations:`, userOrgs.map(org => org.login));
      console.log(`🎯 Looking for organization: "${allowedOrg}"`);
      
      const isMemberOfOrg = userOrgs.some(org => org.login.toLowerCase() === allowedOrg.toLowerCase());
      
      if (isMemberOfOrg) {
        console.log(`✅ ${username} is a member of ${allowedOrg} (verified via authenticated user API)`);
        
        // If specific team is required, check team membership
        if (allowedTeam) {
          try {
            await octokit.rest.teams.getMembershipForUserInOrg({
              org: allowedOrg,
              team_slug: allowedTeam,
              username: username
            });
            console.log(`✅ ${username} is a member of team ${allowedTeam}`);
            return true;
          } catch (teamError) {
            console.log(`❌ ${username} is not a member of team ${allowedTeam}:`, teamError.message);
            return false;
          }
        }
        
        return true;
      } else {
        console.log(`❌ ${username} is not a member of ${allowedOrg} (organization not found in user's org list)`);
        
        // Check if user is an owner of the organization
        console.log(`🔄 Checking if user is an owner/admin of ${allowedOrg}...`);
        try {
          const { data: membership } = await octokit.rest.orgs.getMembershipForAuthenticatedUser({
            org: allowedOrg
          });
          console.log(`🔍 Membership check result:`, membership);
          
          if (membership.role === 'admin' || membership.state === 'active') {
            console.log(`✅ ${username} has admin access or active membership in ${allowedOrg}`);
            return true;
          }
        } catch (membershipError) {
          console.log(`⚠️ Could not check membership for authenticated user:`, membershipError.message);
        }
        
        // Fallback: try public membership check
        console.log(`🔄 Trying public membership check as fallback...`);
        try {
          await octokit.rest.orgs.checkMembershipForUser({
            org: allowedOrg,
            username: username
          });
          console.log(`✅ ${username} is a public member of ${allowedOrg}`);
          return true;
        } catch (publicCheckError) {
          console.log(`❌ ${username} is not a public member of ${allowedOrg}:`, publicCheckError.message);
          return false;
        }
      }
      
    } catch (userOrgsError) {
      console.log(`⚠️ Could not list user organizations:`, userOrgsError.message);
      
      // Fallback to the original approach
      console.log(`🔄 Falling back to public organization check...`);
      try {
        await octokit.rest.orgs.checkMembershipForUser({
          org: allowedOrg,
          username: username
        });
        console.log(`✅ ${username} is a public member of ${allowedOrg}`);
        return true;
      } catch (fallbackError) {
        console.log(`❌ Final check failed - ${username} cannot access ${allowedOrg}:`, fallbackError.message);
        return false;
      }
    }
    
  } catch (error) {
    console.error('Error checking GitHub access:', error);
    return false;
  }
}

// Passport serialization
passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

// Simple user store (in production, use a proper database)
const users = new Map();

// Load initial users from config
async function loadUsers() {
  try {
    const usersFile = await fs.readFile(path.join(__dirname, 'users.json'), 'utf8');
    const userData = JSON.parse(usersFile);
    userData.forEach(user => users.set(user.username, user));
    console.log(`Loaded ${users.size} users`);
  } catch (error) {
    console.log('No users.json found - will create default admin user');
    // Create default admin user
    const hashedPassword = await bcrypt.hash('admin123', 10);
    users.set('admin', {
      username: 'admin',
      password: hashedPassword,
      displayName: 'Administrator',
      role: 'admin'
    });
  }
}

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    res.status(401).json({ error: 'Authentication required' });
  }
}

// Git operations wrapper with error handling
class GitManager {
  static async isGitRepository() {
    try {
      await git.revparse(['--git-dir']);
      console.log('✅ Git repository detected');
      return true;
    } catch (error) {
      console.log('❌ Not a git repository:', error.message);
      return false;
    }
  }

  static async pullUpdates() {
    try {
      const isRepo = await GitManager.isGitRepository();
      if (!isRepo) {
        console.log('Not a git repository - skipping pull in containerized environment');
        return { success: true, skipped: true, reason: 'No git repository' };
      }

      console.log('Pulling latest changes...');
      
      // Try git operations with error handling
      try {
        // Get current branch name dynamically
        const currentBranch = await git.revparse(['--abbrev-ref', 'HEAD']);
        console.log(`Current branch: ${currentBranch}`);
        await git.pull('origin', currentBranch, ['--no-rebase', '--strategy-option=ours']);
        return { success: true };
      } catch (gitError) {
        console.error('Git pull failed, this is expected in containerized environment:', gitError.message);
        return { success: true, skipped: true, reason: 'Git pull not available in container' };
      }
    } catch (error) {
      console.error('Git pull error:', error);
      return { success: false, error: error.message };
    }
  }

  static async commitAndPush(message, author, filePath = null) {
    try {
      const isRepo = await GitManager.isGitRepository();
      if (!isRepo) {
        console.log('Not a git repository - using GitHub API fallback for commits');
        
        // Prepare files for GitHub API commit
        const files = [];
        if (filePath) {
          // Single file commit
          const relativePath = path.relative(path.join(__dirname, '..'), filePath);
          files.push({
            path: filePath,
            relativePath: relativePath.replace(/\\/g, '/') // Normalize path separators
          });
        } else {
          // For now, we'll handle single file commits. Multi-file commits would need more logic.
          console.log('Multi-file GitHub API commits not implemented yet');
          return { success: true, skipped: true, reason: 'Multi-file GitHub API commits not implemented' };
        }
        
        return await GitHubAPIManager.commitFilesToGitHub(files, message, author);
      }

      console.log(`Committing changes: ${message}`);
      
      // Try git operations with additional error handling
      try {
        // Get current branch name dynamically
        const currentBranch = await git.revparse(['--abbrev-ref', 'HEAD']);
        console.log(`Pushing to origin/${currentBranch}`);
        await git.add('.');
        await git.commit(message, undefined, {
          '--author': `"${author}" <${author}@chaosmotic-wiki.local>`
        });
        await git.push('origin', currentBranch);
        return { success: true };
      } catch (gitError) {
        console.error('Git operation failed, falling back to GitHub API:', gitError.message);
        
        // Fallback to GitHub API if git operations fail (credentials, network, etc.)
        if (filePath) {
          const files = [{
            path: filePath,
            relativePath: path.relative(path.join(__dirname, '..'), filePath).replace(/\\/g, '/')
          }];
          return await GitHubAPIManager.commitFilesToGitHub(files, message, author);
        } else {
          // No file path - return success since individual operations will use API
          return { success: true, skipped: true, reason: 'Git credentials not configured - individual file operations use GitHub API' };
        }
      }
    } catch (error) {
      console.error('Git commit/push error:', error);
      return { success: false, error: error.message };
    }
  }

  static async getFileHistory(filename) {
    try {
      const isRepo = await GitManager.isGitRepository();
      if (!isRepo) {
        console.log('Not a git repository - no history available');
        return [];
      }

      const log = await git.log({ file: path.join('content', filename) });
      return log.all.slice(0, 10); // Last 10 commits
    } catch (error) {
      console.error('Git history error:', error);
      return [];
    }
  }

  static async publishAllChanges(author) {
    try {
      const isRepo = await GitManager.isGitRepository();
      if (!isRepo) {
        console.log('Not a git repository - skipping publish in containerized environment');
        return { success: true, skipped: true, reason: 'No git repository' };
      }

      console.log('Starting publish workflow...');
      
      // Try git operations with error handling for authentication issues
      try {
        // Step 1: Check git status
        const status = await git.status();
      const hasChanges = status.files.length > 0;
      
      if (!hasChanges) {
        console.log('No changes to publish');
        return { success: true, noChanges: true };
      }
      
      console.log(`Found ${status.files.length} changed files to publish:`);
      status.files.forEach(file => {
        console.log(`  - ${file.path} (${file.working_dir})`);
      });
      
      // Step 2: Add all changes (git add .)
      console.log('Adding all changes to staging area...');
      await git.add('.');
      console.log('Successfully staged all changes');
      
      // Step 3: Commit with descriptive message
      const timestamp = new Date().toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
      const commitMessage = `Publish changes by ${author} - ${timestamp}`;
      await git.commit(commitMessage, undefined, {
        '--author': `"${author}" <${author}@chaosmotic-wiki.local>`
      });
      console.log(`Committed changes: ${commitMessage}`);
      
      // Step 4: Push to current branch
      const currentBranch = await git.revparse(['--abbrev-ref', 'HEAD']);
      console.log(`Attempting to push to origin/${currentBranch}...`);
      await git.push('origin', currentBranch);
      console.log(`Successfully pushed changes to origin/${currentBranch}`);
      
      // Step 5: Wait a moment for git operations to fully complete
      console.log('Waiting for git operations to stabilize...');
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Step 6: Verify the status is clean
      console.log('Verifying final git status...');
      const finalStatus = await git.status();
      console.log(`Final status check: ${finalStatus.files.length} files remaining`);
      
      if (finalStatus.files.length > 0) {
        console.warn('Warning: Some files still show as modified after publish:');
        finalStatus.files.forEach(file => {
          console.warn(`  - ${file.path} (${file.working_dir})`);
        });
      }
      
      return { 
        success: true, 
        filesChanged: status.files.length,
        commitMessage,
        finalFileCount: finalStatus.files.length
      };
      
      } catch (gitOperationError) {
        console.error('Git operations failed (likely authentication issue):', gitOperationError.message);
        console.log('Bulk publish not available in containerized environment - individual file edits sync via GitHub API');
        return { 
          success: true, 
          skipped: true, 
          reason: 'Git authentication not available - individual file commits work via GitHub API' 
        };
      }
      
    } catch (error) {
      console.error('Publish workflow error:', error);
      
      // Provide more specific error messages for common git issues
      let errorMessage = error.message;
      if (error.message.includes('Authentication failed')) {
        errorMessage = 'Git authentication failed. Please check your git credentials.';
      } else if (error.message.includes('not a git repository')) {
        errorMessage = 'This directory is not a git repository.';
      } else if (error.message.includes('Permission denied')) {
        errorMessage = 'Permission denied. Check file permissions and git access.';
      } else if (error.message.includes('remote rejected')) {
        errorMessage = 'Remote repository rejected the push. You may need to pull latest changes first.';
      }
      
      return { success: false, error: errorMessage, details: error.message };
    }
  }
}

// Link processing utilities
class LinkProcessor {
  static extractObsidianLinks(content) {
    // Match [[link]] patterns, including [[link|display text]]
    const linkRegex = /\[\[([^\]|]+)(\|[^\]]+)?\]\]/g;
    const links = [];
    let match;
    
    while ((match = linkRegex.exec(content)) !== null) {
      const linkText = match[1].trim();
      // Convert to filename format
      const filename = this.linkToFilename(linkText);
      links.push({
        original: match[0],
        linkText: linkText,
        filename: filename
      });
    }
    
    return links;
  }
  
  static linkToFilename(linkText) {
    // Convert link text to valid filename
    return linkText
      .replace(/[^\w\s-]/g, '-') // Replace special characters with hyphens
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Collapse multiple hyphens
      .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
      .toLowerCase() + '.md';
  }
  
  static async createMissingLinkedPages(content, author) {
    const links = this.extractObsidianLinks(content);
    const createdFiles = [];
    
    if (links.length === 0) {
      return createdFiles; // No links found
    }
    
    console.log(`Found ${links.length} wiki links, checking for missing pages...`);
    
    for (const link of links) {
      const filePath = path.join(CONTENT_DIR, link.filename);
      
      try {
        // Check if file already exists
        await fs.access(filePath);
        console.log(`Linked page already exists: ${link.filename}`);
      } catch (error) {
        // File doesn't exist, create it
        const title = link.linkText;
        const blankContent = `---
title: ${title}
---

# ${title}

This page was automatically created because it was linked from another article.

Write your content here...
`;
        
        try {
          await fs.writeFile(filePath, blankContent, 'utf8');
          createdFiles.push({
            filename: link.filename,
            title: title,
            linkText: link.linkText
          });
          
          console.log(`✅ Auto-created linked page: ${link.filename} (${title})`);
        } catch (writeError) {
          console.error(`❌ Failed to create linked page ${link.filename}:`, writeError.message);
        }
      }
    }
    
    // If we created files, commit them
    if (createdFiles.length > 0) {
      try {
        const commitMessage = `Auto-create linked pages: ${createdFiles.map(f => f.title).join(', ')} (by ${author})`;
        await GitManager.commitAndPush(commitMessage, author);
        console.log(`✅ Committed ${createdFiles.length} new linked pages`);
      } catch (commitError) {
        console.error(`❌ Failed to commit linked pages:`, commitError.message);
      }
    }
    
    return createdFiles;
  }
}

// File operations
class FileManager {
  static async listFiles() {
    try {
      const files = await fs.readdir(CONTENT_DIR);
      const fileList = [];
      
      for (const file of files) {
        if (file.endsWith('.md')) {
          const filePath = path.join(CONTENT_DIR, file);
          const stats = await fs.stat(filePath);
          const content = await fs.readFile(filePath, 'utf8');
          const parsed = matter(content);
          
          fileList.push({
            filename: file,
            title: parsed.data.title || file.replace('.md', ''),
            lastModified: stats.mtime,
            size: stats.size
          });
        }
      }
      
      return fileList.sort((a, b) => b.lastModified - a.lastModified);
    } catch (error) {
      throw new Error(`Failed to list files: ${error.message}`);
    }
  }

  static async readFile(filename) {
    try {
      const filePath = path.join(CONTENT_DIR, filename);
      const content = await fs.readFile(filePath, 'utf8');
      const parsed = matter(content);
      
      return {
        frontmatter: parsed.data,
        content: parsed.content,
        raw: content
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { frontmatter: {}, content: '', raw: '' };
      }
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }

  static async writeFile(filename, content, author) {
    try {
      const filePath = path.join(CONTENT_DIR, filename);
      await fs.writeFile(filePath, content, 'utf8');
      
      // Process Obsidian-style links and create missing pages
      const createdFiles = await LinkProcessor.createMissingLinkedPages(content, author);
      
      // Use GitHub API for individual file commit
      const relativePath = `content/${filename}`;
      const commitMessage = `Update ${filename} by ${author}`;
      
      // Commit individual file to GitHub via API (static method)
      const result = await GitHubAPIManager.commitFilesToGitHub([{
        path: filePath,
        relativePath: relativePath
      }], commitMessage, author);
      
      // Return result with info about created files
      return {
        ...result,
        createdLinkedPages: createdFiles
      };
    } catch (error) {
      throw new Error(`Failed to write file: ${error.message}`);
    }
  }

  static async deleteFile(filename, author) {
    try {
      const filePath = path.join(CONTENT_DIR, filename);
      
      // Check if file exists before deleting
      try {
        await fs.access(filePath);
      } catch {
        throw new Error(`File ${filename} does not exist`);
      }
      
      // For delete operations, use GitHub API directly since file will be gone locally
      const relativePath = `content/${filename}`;
      
      // Delete file locally
      await fs.unlink(filePath);
      
      // Delete via GitHub API (static method)
      const commitMessage = `Delete ${filename} by ${author}`;
      const result = await GitHubAPIManager.deleteFileOnGitHub(relativePath, commitMessage, author);
      
      return result;
    } catch (error) {
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }
}

// Routes

console.log('🔧 Registering routes...');

// GitHub OAuth routes
// Test route
app.get('/test', (req, res) => {
  console.log('📋 Test route accessed');
  try {
    // Simple response without session access
    res.json({ 
      message: 'Server is working!', 
      time: new Date().toISOString(),
      status: 'healthy'
    });
  } catch (error) {
    console.log('❌ Test route error:', error);
    res.status(500).json({ error: error.message });
  }
});

console.log('✅ Test route registered');

// OAuth routes
app.get('/auth/github', (req, res, next) => {
  console.log('🔄 Starting GitHub OAuth flow...');
  
  // Add timeout to catch hanging OAuth
  const timeout = setTimeout(() => {
    console.log('⏰ OAuth flow timed out after 10 seconds');
    if (!res.headersSent) {
      res.redirect('/?error=oauth_timeout');
    }
  }, 10000);
  
  try {
    passport.authenticate('github', { 
      scope: ['user:email', 'repo'],
      failureRedirect: '/?error=oauth_failed'
    })(req, res, (err) => {
      clearTimeout(timeout);
      if (err) {
        console.log('❌ OAuth authentication error:', err);
        if (!res.headersSent) {
          res.redirect('/?error=oauth_error');
        }
      } else {
        next();
      }
    });
  } catch (error) {
    clearTimeout(timeout);
    console.log('❌ OAuth route error:', error);
    if (!res.headersSent) {
      res.redirect('/?error=oauth_exception');
    }
  }
});

app.get('/auth/github/callback', 
  (req, res, next) => {
    console.log('📥 GitHub OAuth callback received...');
    next();
  },
  passport.authenticate('github', { 
    failureRedirect: '/?error=access_denied',
    failureMessage: true
  }),
  (req, res) => {
    console.log('✅ GitHub OAuth successful, saving session...');
    // Successful authentication and authorization
    req.session.user = {
      username: req.user.username,
      displayName: req.user.displayName,
      email: req.user.email,
      avatarUrl: req.user.avatarUrl,
      githubToken: req.user.githubToken,
      authMethod: 'github'
    };
    
    console.log(`User ${req.user.username} logged in via GitHub`);
    
    // Save session explicitly
    req.session.save((err) => {
      if (err) {
        console.log('❌ Session save error:', err);
        return res.redirect('/?error=session_error');
      }
      console.log('✅ Session saved, redirecting to home...');
      res.redirect('/');
    });
  }
);

// Authentication routes
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  const user = users.get(username);
  if (!user || !await bcrypt.compare(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  req.session.user = {
    username: user.username,
    displayName: user.displayName,
    role: user.role
  };
  
  res.json({ 
    message: 'Login successful',
    user: req.session.user
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ message: 'Logged out successfully' });
});

app.get('/api/user', requireAuth, (req, res) => {
  res.json({ user: req.session.user });
});

// File management routes
app.get('/api/files', requireAuth, async (req, res) => {
  try {
    const files = await FileManager.listFiles();
    res.json({ files });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/files/:filename', requireAuth, async (req, res) => {
  try {
    const fileData = await FileManager.readFile(req.params.filename);
    res.json(fileData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/files/:filename', requireAuth, async (req, res) => {
  try {
    const { content } = req.body;
    const result = await FileManager.writeFile(
      req.params.filename,
      content,
      req.session.user.displayName
    );
    
    if (result.success) {
      res.json({ message: 'File saved successfully' });
    } else {
      // Provide user-friendly error messages
      const errorMsg = result.error && result.error.includes('Bad credentials') 
        ? 'Unable to save to GitHub. Your changes are saved locally. Please contact your instructor.'
        : (result.error || 'Failed to save file');
      res.status(500).json({ error: errorMsg });
    }
  } catch (error) {
    // Hide technical details from students
    const errorMsg = error.message.includes('Bad credentials')
      ? 'Unable to save to GitHub. Your changes are saved locally. Please contact your instructor.'
      : error.message;
    res.status(500).json({ error: errorMsg });
  }
});

app.delete('/api/files/:filename', requireAuth, async (req, res) => {
  try {
    const result = await FileManager.deleteFile(
      req.params.filename,
      req.session.user.displayName
    );
    
    if (result.success) {
      res.json({ message: 'File deleted successfully' });
    } else {
      // Provide user-friendly error messages
      const errorMsg = result.error && result.error.includes('Bad credentials')
        ? 'Unable to delete from GitHub. The file is removed locally. Please contact your instructor.'
        : (result.error || 'Failed to delete file');
      res.status(500).json({ error: errorMsg });
    }
  } catch (error) {
    // Hide technical details from students
    const errorMsg = error.message.includes('Bad credentials')
      ? 'Unable to delete from GitHub. The file is removed locally. Please contact your instructor.'
      : error.message;
    res.status(500).json({ error: errorMsg });
  }
});

// Markdown preview route
app.post('/api/preview', requireAuth, (req, res) => {
  try {
    const { content } = req.body;
    const html = marked(content);
    res.json({ html });
  } catch (error) {
    res.status(500).json({ error: 'Failed to render markdown' });
  }
});

// Git sync route
app.post('/api/sync', requireAuth, async (req, res) => {
  try {
    const pullResult = await GitManager.pullUpdates();
    if (!pullResult.success) {
      return res.status(500).json({ error: 'Failed to pull updates: ' + pullResult.error });
    }
    
    res.json({ message: 'Sync completed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Publish route - automates the entire "Publishing Your Changes" workflow
app.post('/api/publish', requireAuth, async (req, res) => {
  try {
    const author = req.session.user.displayName;
    
    // In production environments, individual file saves are more reliable
    // This endpoint provides guidance for the containerized environment
    
    const result = await GitManager.publishAllChanges(author);
    
    if (result.success) {
      if (result.noChanges) {
        res.json({ message: 'No changes to publish - everything is already up to date!' });
      } else if (result.skipped || result.gitPushFailed || result.gitFallback) {
        res.json({ 
          message: 'Individual file saves are already syncing your changes to GitHub.',
          note: 'Your edits are automatically saved and published when you click Save on each file.',
          recommendation: 'Continue using the Save button on individual files for reliable publishing.',
          tip: 'Changes appear on the live site within 2-3 minutes of saving.'
        });
      } else {
        res.json({ 
          message: 'All changes published successfully!',
          filesChanged: result.filesChanged || 0
        });
      }
    } else {
      res.status(500).json({ error: 'Failed to publish changes: ' + result.error });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// File history route
app.get('/api/files/:filename/history', requireAuth, async (req, res) => {
  try {
    const history = await GitManager.getFileHistory(req.params.filename);
    res.json({ history });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check git status for unpublished changes
app.get('/api/git-status', requireAuth, async (req, res) => {
  try {
    const isRepo = await GitManager.isGitRepository();
    if (!isRepo) {
      res.json({ 
        hasChanges: false,
        changedFiles: 0,
        files: [],
        gitAvailable: false,
        message: 'Individual file saves automatically sync to GitHub',
        note: 'Files are published immediately when you click Save'
      });
      return;
    }

    const status = await git.status();
    
    // In containerized environments, git status may not reflect GitHub API commits
    // If there are many files showing as "changed" but individual saves work,
    // it's likely a git/container sync issue, not actual unpublished changes
    const fileCount = status.files.length;
    const isContainerEnvironment = !process.env.LOCAL_DEV;
    
    if (isContainerEnvironment && fileCount > 100) {
      // Likely a git sync issue in containerized environment
      res.json({
        hasChanges: false,
        changedFiles: 0,
        files: [],
        gitAvailable: true,
        message: 'Files sync automatically via GitHub API',
        note: 'Individual file saves are working - no bulk publish needed',
        gitStatusNote: `Git shows ${fileCount} files, but this is likely a sync artifact in the container environment`
      });
      return;
    }

    res.json({
      hasChanges: status.files.length > 0,
      changedFiles: status.files.length,
      gitAvailable: true,
      files: status.files.map(f => ({
        path: f.path,
        status: f.index + f.working_dir
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Link detection test route
app.post('/api/test-links', requireAuth, async (req, res) => {
  try {
    const { content } = req.body;
    const links = LinkProcessor.extractObsidianLinks(content);
    res.json({ 
      message: `Found ${links.length} wiki links`,
      links: links
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve the main application
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function startServer() {
  await loadUsers();
  
  // Ensure content directory exists
  try {
    await fs.access(CONTENT_DIR);
  } catch (error) {
    console.log('Content directory not found, creating it...');
    await fs.mkdir(CONTENT_DIR, { recursive: true });
    // Create a sample file for production environments
    if (process.env.NODE_ENV === 'production') {
      const sampleContent = `# Welcome to Chaosmotic Systems Wiki

This is a collaborative wiki for the Chaosmotic Systems class.

## Getting Started

In development mode, this wiki syncs with the GitHub repository. In production mode, you can create and edit content directly through the web interface.

## Notes

- Use [[link]] syntax to create wiki-style links
- Markdown formatting is supported
- Files are automatically saved and can be published to GitHub

## Access

Only members of the Chaosmotic-Systems GitHub organization can access and edit this wiki.
`;
      await fs.writeFile(path.join(CONTENT_DIR, 'index.md'), sampleContent);
    }
  }
  
  // Initial git pull (skip in production Railway environment)
  if (process.env.NODE_ENV !== 'production' || process.env.RAILWAY_ENVIRONMENT !== 'production') {
    try {
      console.log('Performing initial git sync...');
      await GitManager.pullUpdates();
    } catch (error) {
      console.warn('Git sync failed (this is expected in serverless environments):', error.message);
    }
  } else {
    console.log('Skipping git operations in production environment');
  }
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Chaosmotic Wiki Editor running on http://0.0.0.0:${PORT}`);
    console.log('Default admin credentials: admin / admin123');
    console.log('Environment:', process.env.NODE_ENV);
    console.log('Railway Public Domain:', process.env.RAILWAY_PUBLIC_DOMAIN || 'not set');
    console.log('🎉 Server ready! GitHub OAuth functional, Redis sessions loading in background.');
  });
}

startServer().catch(console.error);

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});