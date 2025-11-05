const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const simpleGit = require('simple-git');
const fs = require('fs').promises;
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');
const chokidar = require('chokidar');
const WebSocket = require('ws');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const CONTENT_DIR = path.join(__dirname, '../content');
const git = simpleGit();

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
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
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

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
  static async pullUpdates() {
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
    try {
      const log = await git.log({ file: path.join('content', filename) });
      return log.all.slice(0, 10); // Last 10 commits
    } catch (error) {
      console.error('Git history error:', error);
      return [];
    }
  }

  static async publishAllChanges(author) {
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
  
  // Initial git pull
  console.log('Performing initial git sync...');
  await GitManager.pullUpdates();
  
  app.listen(PORT, () => {
    console.log(`Chaosmotic Wiki Editor running on http://localhost:${PORT}`);
    console.log('Default admin credentials: admin / admin123');
  });
}

startServer().catch(console.error);