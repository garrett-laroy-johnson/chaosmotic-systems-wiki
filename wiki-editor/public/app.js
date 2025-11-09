// Chaosmotic Systems Wiki Editor - Client Application

class WikiEditor {
  constructor() {
    this.currentFile = null;
    this.currentUser = null;
    this.files = [];
    this.isPreviewMode = false;
    this.unsavedChanges = false;
    
    this.init();
  }

  init() {
    this.bindEvents();
    this.checkForAuthErrors();
    this.checkAuth();
  }

  // Event Binding
  bindEvents() {
    // Login form
    document.getElementById('login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.login();
    });

    // Logout
    document.getElementById('logout-btn').addEventListener('click', () => {
      this.logout();
    });

    // File operations
    document.getElementById('new-file-btn').addEventListener('click', () => {
      this.showModal('new-file-modal');
    });

    document.getElementById('new-file-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.createNewFile();
    });

    // Editor controls
    document.getElementById('save-btn').addEventListener('click', () => {
      this.saveCurrentFile();
    });

    document.getElementById('preview-toggle').addEventListener('click', () => {
      this.togglePreview();
    });

    document.getElementById('live-preview-btn').addEventListener('click', () => {
      this.openLivePreview();
    });

    document.getElementById('delete-btn').addEventListener('click', () => {
      this.deleteCurrentFile();
    });

    // Sync and Publish buttons
    document.getElementById('sync-btn').addEventListener('click', () => {
      this.syncWithGit();
    });

    // Editor content change detection
    const editor = document.getElementById('editor');
    editor.addEventListener('input', () => {
      this.markUnsaved();
      if (this.isPreviewMode) {
        this.debouncePreview();
      }
    });

    // File title change
    document.getElementById('file-title').addEventListener('input', () => {
      this.markUnsaved();
    });

    // Toolbar buttons
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        this.applyFormatting(action);
      });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch(e.key) {
          case 's':
            e.preventDefault();
            this.saveCurrentFile();
            break;
          case 'p':
            e.preventDefault();
            this.togglePreview();
            break;
        }
      }
    });

    // Publish status dropdown hover events
    const publishStatusContainer = document.querySelector('.publish-status-container');
    const publishStatus = document.getElementById('publish-status');
    const dropdown = document.getElementById('publish-status-dropdown');
    
    if (publishStatusContainer && publishStatus && dropdown) {
      let hoverTimeout;
      
      publishStatusContainer.addEventListener('mouseenter', () => {
        clearTimeout(hoverTimeout);
        if (!publishStatus.classList.contains('published')) {
          dropdown.classList.remove('hidden');
        }
      });
      
      publishStatusContainer.addEventListener('mouseleave', () => {
        hoverTimeout = setTimeout(() => {
          dropdown.classList.add('hidden');
        }, 300); // Small delay to prevent flickering
      });
    }
  }

  // Check for authentication errors in URL
  checkForAuthErrors() {
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get('error');
    
    if (error === 'access_denied') {
      this.showToast('Access denied: You must be a member of the class organization to access this wiki.', 'error');
      // Clear the error from URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (error === 'auth_failed') {
      this.showToast('GitHub authentication failed. Please try again.', 'error');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  // Authentication
  async checkAuth() {
    try {
      const response = await fetch('/api/user');
      if (response.ok) {
        const data = await response.json();
        this.currentUser = data.user;
        this.showEditor();
      } else {
        this.showLogin();
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      this.showLogin();
    }
  }

  async login() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('login-error');

    this.showLoading(true);

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (response.ok) {
        this.currentUser = data.user;
        this.showEditor();
        this.showToast('Welcome to the wiki!', 'success');
      } else {
        errorDiv.textContent = data.error || 'Login failed';
      }
    } catch (error) {
      errorDiv.textContent = 'Connection error. Please try again.';
      console.error('Login error:', error);
    } finally {
      this.showLoading(false);
    }
  }

  async logout() {
    try {
      // Stop status polling
      this.stopStatusPolling();
      
      await fetch('/api/logout', { method: 'POST' });
      this.currentUser = null;
      this.currentFile = null;
      this.showLogin();
      this.showToast('Logged out successfully');
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  // UI State Management
  showLogin() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('editor-screen').classList.add('hidden');
    document.getElementById('username').focus();
  }

  showEditor() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('editor-screen').classList.remove('hidden');
    document.getElementById('current-user').textContent = `Welcome, ${this.currentUser.displayName}`;
    this.loadFiles();
    
    // Start periodic status checking to catch external file changes
    this.startStatusPolling();
  }

  showModal(modalId) {
    document.getElementById(modalId).classList.remove('hidden');
  }

  closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
  }

  showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (show) {
      overlay.classList.remove('hidden');
    } else {
      overlay.classList.add('hidden');
    }
  }

  // File Management
  async loadFiles() {
    try {
      const response = await fetch('/api/files');
      const data = await response.json();
      
      if (response.ok) {
        this.files = data.files;
        this.renderFileList();
        this.updateStats();
      } else {
        this.showToast(data.error || 'Failed to load files', 'error');
      }
    } catch (error) {
      console.error('Load files error:', error);
      this.showToast('Failed to connect to server', 'error');
    }
  }

  renderFileList() {
    const fileList = document.getElementById('file-list');
    
    if (this.files.length === 0) {
      fileList.innerHTML = '<div class="file-item"><div class="file-name">No articles yet</div><div class="file-meta">Create your first article!</div></div>';
      return;
    }

    fileList.innerHTML = this.files.map(file => `
      <div class="file-item" data-filename="${file.filename}" onclick="app.openFile('${file.filename}')">
        <div class="file-name">${file.title}</div>
        <div class="file-meta">
          ${new Date(file.lastModified).toLocaleDateString()} • ${this.formatFileSize(file.size)}
        </div>
      </div>
    `).join('');
  }

  async openFile(filename) {
    if (this.unsavedChanges) {
      if (!confirm('You have unsaved changes. Continue without saving?')) {
        return;
      }
    }

    this.showLoading(true);

    try {
      const response = await fetch(`/api/files/${filename}`);
      const data = await response.json();

      if (response.ok) {
        this.currentFile = {
          filename: filename,
          originalContent: data.raw,
          frontmatter: data.frontmatter
        };

        // Update UI
        document.getElementById('file-title').value = data.frontmatter.title || filename.replace('.md', '');
        document.getElementById('editor').value = data.content;
        
        // Show editor, hide welcome
        document.getElementById('welcome-screen').classList.add('hidden');
        document.getElementById('editor-container').classList.remove('hidden');
        
        // Update file list active state
        document.querySelectorAll('.file-item').forEach(item => {
          item.classList.remove('active');
          if (item.dataset.filename === filename) {
            item.classList.add('active');
          }
        });

        this.unsavedChanges = false;
        this.updateSaveButton();

        // Update preview if in preview mode
        if (this.isPreviewMode) {
          this.updatePreview();
        }

      } else {
        this.showToast(data.error || 'Failed to open file', 'error');
      }
    } catch (error) {
      console.error('Open file error:', error);
      this.showToast('Failed to open file', 'error');
    } finally {
      this.showLoading(false);
    }
  }

  async createNewFile() {
    const filename = document.getElementById('new-filename').value.trim();
    const title = document.getElementById('new-title').value.trim();

    if (!filename || !title) {
      this.showToast('Please fill in all fields', 'error');
      return;
    }

    const fullFilename = filename.endsWith('.md') ? filename : filename + '.md';
    
    // Check if file already exists
    if (this.files.some(f => f.filename === fullFilename)) {
      this.showToast('A file with this name already exists', 'error');
      return;
    }

    this.showLoading(true);

    const content = `---
title: ${title}
---

# ${title}

Write your article content here...
`;

    try {
      const response = await fetch(`/api/files/${fullFilename}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });

      const data = await response.json();

      if (response.ok) {
        this.closeModal('new-file-modal');
        document.getElementById('new-file-form').reset();
        await this.loadFiles();
        await this.openFile(fullFilename);
        this.showToast('Article created successfully!', 'success');
      } else {
        this.showToast(data.error || 'Failed to create file', 'error');
      }
    } catch (error) {
      console.error('Create file error:', error);
      this.showToast('Failed to create file', 'error');
    } finally {
      this.showLoading(false);
    }
  }

  async saveCurrentFile() {
    if (!this.currentFile) return;

    const title = document.getElementById('file-title').value.trim();
    const content = document.getElementById('editor').value;

    // Build the complete markdown with frontmatter
    const frontmatter = { ...this.currentFile.frontmatter, title };
    const fullContent = `---
title: ${title}
---

${content}`;

    this.showLoading(true);

    try {
      const response = await fetch(`/api/files/${this.currentFile.filename}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: fullContent })
      });

      const data = await response.json();

      if (response.ok) {
        this.currentFile.originalContent = fullContent;
        this.unsavedChanges = false;
        this.updateSaveButton();
        await this.loadFiles();
        
        // Check if any linked pages were created
        if (data.createdLinkedPages && data.createdLinkedPages.length > 0) {
          const pageNames = data.createdLinkedPages.map(p => `"${p.title}"`).join(', ');
          this.showToast(`Article saved! Also created linked pages: ${pageNames}`, 'success');
        } else {
          this.showToast('Article saved successfully!', 'success');
        }
      } else {
        this.showToast(data.error || 'Failed to save file', 'error');
      }
    } catch (error) {
      console.error('Save file error:', error);
      this.showToast('Failed to save file', 'error');
    } finally {
      this.showLoading(false);
    }
  }

  async deleteCurrentFile() {
    if (!this.currentFile) return;

    if (!confirm(`Are you sure you want to delete "${this.currentFile.filename}"? This cannot be undone.`)) {
      return;
    }

    this.showLoading(true);

    try {
      const response = await fetch(`/api/files/${this.currentFile.filename}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (response.ok) {
        this.currentFile = null;
        document.getElementById('welcome-screen').classList.remove('hidden');
        document.getElementById('editor-container').classList.add('hidden');
        await this.loadFiles();
        this.checkPublishStatus(); // Update publish status after deletion
        this.showToast('Article deleted successfully', 'success');
      } else {
        this.showToast(data.error || 'Failed to delete file', 'error');
      }
    } catch (error) {
      console.error('Delete file error:', error);
      this.showToast('Failed to delete file', 'error');
    } finally {
      this.showLoading(false);
    }
  }

  // Editor Functions
  togglePreview() {
    const previewPane = document.getElementById('preview-pane');
    const previewBtn = document.getElementById('preview-toggle');

    this.isPreviewMode = !this.isPreviewMode;

    if (this.isPreviewMode) {
      previewPane.classList.remove('hidden');
      previewBtn.textContent = '✏️ Edit';
      this.updatePreview();
    } else {
      previewPane.classList.add('hidden');
      previewBtn.textContent = '👁️ Preview';
    }
  }

  debouncePreview = this.debounce(() => {
    this.updatePreview();
  }, 500);

  async updatePreview() {
    const content = document.getElementById('editor').value;
    const previewContent = document.getElementById('preview-content');

    if (!content.trim()) {
      previewContent.innerHTML = '<p class="preview-placeholder">Preview will appear here...</p>';
      return;
    }

    try {
      const response = await fetch('/api/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });

      const data = await response.json();

      if (response.ok) {
        previewContent.innerHTML = data.html;
        // Re-run Prism highlighting
        if (window.Prism) {
          Prism.highlightAllUnder(previewContent);
        }
      } else {
        previewContent.innerHTML = '<p class="preview-placeholder">Preview error</p>';
      }
    } catch (error) {
      console.error('Preview error:', error);
      previewContent.innerHTML = '<p class="preview-placeholder">Preview unavailable</p>';
    }
  }

  applyFormatting(action) {
    const editor = document.getElementById('editor');
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selectedText = editor.value.substring(start, end);
    let replacement;

    switch (action) {
      case 'bold':
        replacement = `**${selectedText || 'bold text'}**`;
        break;
      case 'italic':
        replacement = `*${selectedText || 'italic text'}*`;
        break;
      case 'heading':
        replacement = `# ${selectedText || 'Heading'}`;
        break;
      case 'wikilink':
        replacement = `[[${selectedText || 'Page Name'}]]`;
        break;
      case 'link':
        replacement = `[${selectedText || 'link text'}](url)`;
        break;
      case 'list':
        replacement = `- ${selectedText || 'list item'}`;
        break;
      default:
        return;
    }

    editor.value = editor.value.substring(0, start) + replacement + editor.value.substring(end);
    editor.focus();
    editor.setSelectionRange(start, start + replacement.length);
    this.markUnsaved();
  }

  // Git Operations
  async syncWithGit() {
    this.showLoading(true);

    try {
      const response = await fetch('/api/sync', { method: 'POST' });
      const data = await response.json();

      if (response.ok) {
        await this.loadFiles();
        this.showToast('Synced with repository successfully!', 'success');
      } else {
        this.showToast(data.error || 'Sync failed', 'error');
      }
    } catch (error) {
      console.error('Sync error:', error);
      this.showToast('Failed to sync with repository', 'error');
    } finally {
      this.showLoading(false);
    }
  }

  async publishChanges() {
    // Check if there are unsaved changes first
    if (this.unsavedChanges) {
      const shouldSave = confirm('You have unsaved changes. Save them before publishing?');
      if (shouldSave) {
        await this.saveCurrentFile();
      } else {
        return; // User cancelled
      }
    }

    this.showLoading(true);

    try {
      // Step 1: Sync to get latest changes first
      this.showToast('Step 1/2: Getting latest changes...', 'info');
      let response = await fetch('/api/sync', { method: 'POST' });
      let data = await response.json();

      if (!response.ok) {
        this.showToast(`Sync failed: ${data.error}`, 'error');
        return;
      }

      // Step 2: Publish all changes
      this.showToast('Step 2/2: Publishing your changes...', 'info');
      response = await fetch('/api/publish', { method: 'POST' });
      data = await response.json();

      if (response.ok) {
        await this.loadFiles();
        
        // Handle different response types
        if (data.note && data.recommendation) {
          // Individual file saves are working
          this.showToast(data.message || 'Changes are already syncing via individual saves', 'info');
          this.showToast(data.recommendation, 'info');
          this.showToast(data.tip || 'Continue using Save button on individual files', 'success');
        } else {
          // Traditional bulk publish worked
          const fileCount = data.filesChanged || 0;
          const message = fileCount > 0 
            ? `🎉 Published ${fileCount} file(s) successfully! Your work is now live.`
            : '🎉 All changes published successfully! Your work is now live.';
          this.showToast(message, 'success');
        }
        
        // Wait for operations to complete, then check status
        this.showToast('Updating status...', 'info');
        setTimeout(() => {
          this.checkPublishStatus();
        }, 2000);
        
      } else {
        this.showToast(data.error || 'Publish failed', 'error');
      }
    } catch (error) {
      console.error('Publish error:', error);
      this.showToast('Failed to publish changes', 'error');
    } finally {
      this.showLoading(false);
    }
  }

  async checkPublishStatus() {
    try {
      // Add cache-busting parameter to ensure fresh data
      console.log('Checking publish status...');
      const response = await fetch(`/api/git-status?t=${Date.now()}`);
      if (response.ok) {
        const data = await response.json();
        const statusElement = document.getElementById('publish-status');
        const publishBtn = document.getElementById('publish-btn');
        
        console.log('Git status response:', data); // Debug logging
        
        if (data.hasChanges) {
          const statusText = `● ${data.changedFiles} file(s) ready to publish`;
          console.log('Status: Has changes -', statusText);
          statusElement.textContent = statusText;
          statusElement.classList.remove('hidden', 'published');
          publishBtn.classList.add('btn-warning');
          publishBtn.classList.remove('btn-success');
          
          // Populate the dropdown with pending files
          this.updatePendingFilesDropdown(data.files);
        } else {
          console.log('Status: No changes - all published');
          statusElement.textContent = '✓ All changes published';
          statusElement.classList.remove('hidden');
          statusElement.classList.add('published');
          publishBtn.classList.remove('btn-warning');
          publishBtn.classList.add('btn-success');
          
          // Clear the dropdown
          this.updatePendingFilesDropdown([]);
        }
      } else {
        console.error('Status check failed:', response.status);
      }
    } catch (error) {
      console.error('Failed to check publish status:', error);
    }
  }

  updatePendingFilesDropdown(files) {
    const dropdown = document.getElementById('publish-status-dropdown');
    const filesList = document.getElementById('pending-files-list');
    
    // Clear existing files
    filesList.innerHTML = '';
    
    if (files.length === 0) {
      dropdown.classList.add('hidden');
      return;
    }
    
    // Add each file to the dropdown
    files.forEach(file => {
      const li = document.createElement('li');
      
      // Determine file status icon and type
      let statusIcon = '●';
      let statusClass = 'file-status-modified';
      let statusText = 'Modified';
      
      if (file.status.includes('?')) {
        statusIcon = '+';
        statusClass = 'file-status-new';
        statusText = 'New file';
      } else if (file.status.includes('M')) {
        statusIcon = '●';
        statusClass = 'file-status-modified';
        statusText = 'Modified';
      } else if (file.status.includes('D')) {
        statusIcon = '−';
        statusClass = 'file-status-deleted';
        statusText = 'Deleted';
      }
      
      // Split path for better display
      const pathParts = file.path.split('/');
      const filename = pathParts.pop();
      const directory = pathParts.length > 0 ? pathParts.join('/') + '/' : '';
      
      li.innerHTML = `
        <span class="file-status-icon ${statusClass}" title="${statusText}">${statusIcon}</span>
        <span class="file-path">
          <span class="file-path-dir">${directory}</span>${filename}
        </span>
      `;
      
      filesList.appendChild(li);
    });
  }

  // Status Polling Functions
  startStatusPolling() {
    // Clear any existing interval
    if (this.statusPollingInterval) {
      clearInterval(this.statusPollingInterval);
    }
    
    // Check status every 30 seconds to catch external changes
    this.statusPollingInterval = setInterval(() => {
      this.checkPublishStatus();
    }, 30000);
    
    console.log('Started periodic status polling (every 30 seconds)');
  }
  
  stopStatusPolling() {
    if (this.statusPollingInterval) {
      clearInterval(this.statusPollingInterval);
      this.statusPollingInterval = null;
      console.log('Stopped periodic status polling');
    }
  }

  // Live Preview Functions
  openLivePreview() {
    if (!this.currentFile) {
      this.showToast('Please select a file first', 'warning');
      return;
    }

    // Open the live GitHub Pages site for the current file
    const filename = this.currentFile.filename.replace('.md', '');
    const githubPagesUrl = 'https://chaosmotic-systems.github.io/chaosmotic-systems-wiki/' + filename;
    
    // Open in new tab
    window.open(githubPagesUrl, '_blank');
    
    this.showToast('Opening live site... (Changes appear within 2-3 minutes of saving)', 'success');
  }

  // Utility Functions
  markUnsaved() {
    this.unsavedChanges = true;
    this.updateSaveButton();
  }

  updateSaveButton() {
    const saveBtn = document.getElementById('save-btn');
    if (this.unsavedChanges) {
      saveBtn.textContent = '💾 Save*';
      saveBtn.classList.add('btn-warning');
    } else {
      saveBtn.textContent = '💾 Save';
      saveBtn.classList.remove('btn-warning');
    }
  }

  updateStats() {
    document.getElementById('total-files').textContent = this.files.length;
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    // Auto-remove after delay (longer for info messages)
    const delay = type === 'info' ? 3000 : 5000;
    setTimeout(() => {
      toast.remove();
    }, delay);
  }

  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
}

// Global functions for HTML onclick handlers
function closeModal(modalId) {
  document.getElementById(modalId).classList.add('hidden');
}

// Initialize the application
const app = new WikiEditor();