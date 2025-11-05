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
      await git.pull('origin', 'v4', ['--no-rebase', '--strategy-option=ours']);
      return { success: true };
    } catch (error) {
      console.error('Git pull error:', error);
      return { success: false, error: error.message };
    }
  }

  static async commitAndPush(message, author) {
    try {
      console.log(`Committing changes: ${message}`);
      await git.add('.');
      await git.commit(message, undefined, {
        '--author': `"${author}" <${author}@chaosmotic-wiki.local>`
      });
      await git.push('origin', 'v4');
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
      
      // Auto-commit changes
      const commitMessage = `Update ${filename} by ${author}`;
      return await GitManager.commitAndPush(commitMessage, author);
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

// File history route
app.get('/api/files/:filename/history', requireAuth, async (req, res) => {
  try {
    const history = await GitManager.getFileHistory(req.params.filename);
    res.json({ history });
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