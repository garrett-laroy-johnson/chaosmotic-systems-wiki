const express = require('express');
const session = require('express-session');
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

// Trust Railway's proxy for proper IP detection
app.set('trust proxy', true);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
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
  }
});

// Middleware
app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
  secret: process.env.SESSION_SECRET || 'chaosmotic-wiki-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production', // HTTPS in production
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// Passport configuration
app.use(passport.initialize());
app.use(passport.session());

// GitHub OAuth Strategy
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
  static isProductionEnvironment() {
    return process.env.NODE_ENV === 'production';
  }

  static async pullUpdates() {
    if (GitManager.isProductionEnvironment()) {
      console.log('Skipping git pull in production environment');
      return { success: true, skipped: true };
    }
    
    try {
      console.log('Pulling latest changes...');
      // Get current branch name dynamically
      const currentBranch = await git.revparse(['--abbrev-ref', 'HEAD']);
      console.log(`Current branch: ${currentBranch}`);
      await git.pull('origin', currentBranch, ['--no-rebase', '--strategy-option=ours']);
      return { success: true };
    } catch (error) {
      console.error('Git pull error:', error);
      return { success: false, error: error.message };
    }
  }

  static async commitAndPush(message, author) {
    if (GitManager.isProductionEnvironment()) {
      console.log('Skipping git commit/push in production environment');
      return { success: true, skipped: true };
    }
    
    try {
      console.log(`Committing changes: ${message}`);
      // Get current branch name dynamically
      const currentBranch = await git.revparse(['--abbrev-ref', 'HEAD']);
      console.log(`Pushing to origin/${currentBranch}`);
      await git.add('.');
      await git.commit(message, undefined, {
        '--author': `"${author}" <${author}@chaosmotic-wiki.local>`
      });
      await git.push('origin', currentBranch);
      return { success: true };
    } catch (error) {
      console.error('Git commit/push error:', error);
      return { success: false, error: error.message };
    }
  }

  static async getFileHistory(filename) {
    if (GitManager.isProductionEnvironment()) {
      console.log('Skipping git history in production environment');
      return [];
    }
    
    try {
      const log = await git.log({ file: path.join('content', filename) });
      return log.all.slice(0, 10); // Last 10 commits
    } catch (error) {
      console.error('Git history error:', error);
      return [];
    }
  }

  static async publishAllChanges(author) {
    if (GitManager.isProductionEnvironment()) {
      console.log('Skipping git publish in production environment');
      return { success: true, skipped: true };
    }
    
    try {
      console.log('Starting publish workflow...');
      
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
      
      // Auto-commit the main file
      const commitMessage = `Update ${filename} by ${author}`;
      const result = await GitManager.commitAndPush(commitMessage, author);
      
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
      await fs.unlink(filePath);
      
      const commitMessage = `Delete ${filename} by ${author}`;
      return await GitManager.commitAndPush(commitMessage, author);
    } catch (error) {
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }
}

// Routes

// GitHub OAuth routes
app.get('/auth/github', passport.authenticate('github', { scope: ['user:email', 'repo'] }));

app.get('/auth/github/callback', 
  passport.authenticate('github', { 
    failureRedirect: '/?error=access_denied',
    failureMessage: true
  }),
  (req, res) => {
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
    res.redirect('/');
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
      res.status(500).json({ error: 'Git operation failed: ' + result.error });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
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
      res.status(500).json({ error: 'Git operation failed: ' + result.error });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
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
    
    // This replicates the manual workflow:
    // 1. git status (check for changes)
    // 2. git add . (stage all changes)  
    // 3. git commit -m "message" (commit with message)
    // 4. git push origin v4 (push to share)
    
    const result = await GitManager.publishAllChanges(author);
    
    if (result.success) {
      if (result.noChanges) {
        res.json({ message: 'No changes to publish - everything is already up to date!' });
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
    if (GitManager.isProductionEnvironment()) {
      // In production, there are no git operations, so no changes to track
      res.json({ 
        hasChanges: false,
        changedFiles: 0,
        files: [],
        productionMode: true
      });
      return;
    }
    
    const status = await git.status();
    res.json({ 
      hasChanges: status.files.length > 0,
      changedFiles: status.files.length,
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
  });
}

startServer().catch(console.error);