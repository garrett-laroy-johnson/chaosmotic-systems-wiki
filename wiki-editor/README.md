# Chaosmotic Systems Wiki Editor

A collaborative web-based editor for your Quartz wiki that eliminates the need for students to use git command line tools.

## Features

✨ **Student-Friendly Interface**
- Clean, intuitive web editor
- Live markdown preview
- No command line required
- Automatic git operations
- **Obsidian-style wiki links** - `[[Page Name]]` automatically creates new pages!

🔐 **User Management**
- Simple login system
- Role-based access (admin/student)
- Session management

📝 **Rich Editor**
- Markdown syntax highlighting
- Live preview mode
- Formatting toolbar
- Auto-save indication

🔄 **Git Integration**
- Automatic commits with user attribution
- Background sync operations
- Conflict handling
- File history tracking

## Quick Start

### 1. Install Dependencies

```bash
cd wiki-editor
npm install
```

### 2. Setup Users

Run the setup script to create user accounts:

```bash
npm run setup
```

This will create:
- An admin account (default: admin/admin123)
- Student accounts as needed
- A `users.json` file with encrypted passwords

### 3. Start the Server

```bash
npm start
```

The wiki editor will be available at `http://localhost:3000`

### 4. Development Mode (Auto-restart)

```bash
npm run dev
```

## Deployment Options

### Option 1: Simple Server Deployment

1. **Requirements:**
   - Node.js 16+ installed
   - Git configured on the server
   - Your wiki repository cloned

2. **Deploy:**
   ```bash
   # Clone your wiki repository
   git clone https://github.com/your-org/your-wiki.git
   cd your-wiki/wiki-editor
   
   # Install dependencies
   npm install
   
   # Setup users
   npm run setup
   
   # Start with PM2 (recommended for production)
   npm install -g pm2
   pm2 start server.js --name "wiki-editor"
   pm2 startup
   pm2 save
   ```

3. **Configure Environment:**
   ```bash
   # Set production session secret
   export SESSION_SECRET="your-random-secret-key"
   
   # Set port (optional, defaults to 3000)
   export PORT=3000
   ```

### Option 2: Docker Deployment

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000
CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t wiki-editor .
docker run -p 3000:3000 -v $(pwd)/../content:/app/../content wiki-editor
```

### Option 3: Cloud Deployment (Heroku, Railway, etc.)

1. Add a `Procfile`:
   ```
   web: npm start
   ```

2. Set environment variables in your platform's dashboard:
   - `SESSION_SECRET`: A random secret key
   - `PORT`: Usually auto-configured

3. Deploy according to your platform's instructions

## Configuration

### Environment Variables

- `PORT`: Server port (default: 3000)
- `SESSION_SECRET`: Secret key for sessions (important for production!)
- `NODE_ENV`: Set to 'production' for production deployment

### User Management

Users are stored in `users.json`. To add new students:

1. **Via setup script** (recommended):
   ```bash
   npm run setup
   ```

2. **Manual editing**:
   ```json
   [
     {
       "username": "student1",
       "password": "$2a$10$...",
       "displayName": "Student One",
       "role": "student"
     }
   ]
   ```
   Note: Passwords must be bcrypt hashed.

### Git Configuration

The editor automatically handles git operations. Ensure:
- The server has git configured with appropriate credentials
- The user running the server has write access to the repository
- Git remote is properly configured (origin/v4 branch)

## Security Considerations

1. **Change default admin password** immediately after setup
2. **Set SESSION_SECRET** environment variable in production
3. **Use HTTPS** in production (configure reverse proxy)
4. **Regular backups** of users.json and git repository
5. **Monitor git repository** for any issues

## Troubleshooting

### Common Issues

**"Git operation failed"**
- Check git credentials on server
- Ensure write permissions to repository
- Verify internet connection for git operations

**"Authentication required"**
- Sessions may have expired
- Check SESSION_SECRET is consistent
- Clear browser cookies and try again

**"Failed to load files"**
- Check content directory exists and is readable
- Verify file permissions
- Check server logs for detailed errors

### Logs

Server logs will show detailed error information:
```bash
# If using PM2
pm2 logs wiki-editor

# If running manually
npm start
```

## Student Instructions

Once deployed, give your students these simple instructions:

1. **Go to the wiki editor**: `http://your-server:3000`
2. **Log in** with their provided username and password
3. **Create or edit articles** using the web interface
4. **Save their work** - it automatically commits to git
5. **No command line needed!**

## Integration with Quartz

The editor works seamlessly with your existing Quartz setup:

1. **Content files** are saved directly to your `content/` directory
2. **Git commits** are made automatically with proper attribution
3. **Quartz auto-updates** when files are saved through the web editor
4. **Students see changes** in both the editor preview AND the live Quartz site

### Running Both Systems Together

**Option 1: Automatic startup (Recommended)**
```bash
# Windows
start-both.bat

# Mac/Linux
chmod +x start-both.sh
./start-both.sh
```

**Option 2: Manual startup**
```bash
# Terminal 1: Start Quartz
npx quartz build --serve

# Terminal 2: Start Wiki Editor
cd wiki-editor
npm start
```

**The complete workflow:**
- **Port 3000**: Students edit in the web interface
- **Port 8080**: Live Quartz site with automatic updates
- **When students save**: Changes appear instantly in Quartz!

### Obsidian-Style Wiki Links

The editor automatically creates new pages when students link to them:

1. **Student types**: `Check out [[My New Article]] for more info`
2. **Student saves** the article
3. **System automatically creates** `my-new-article.md` with basic template
4. **Both files are committed** to git with proper attribution
5. **Links work immediately** in both the editor and Quartz!

**Supported link formats:**
- `[[Page Name]]` - Creates and links to "page-name.md"
- `[[Page Name|Display Text]]` - Creates "page-name.md" but shows "Display Text"

### Live Preview Integration

Students can:
1. **Edit** in the web editor with markdown preview
2. **Create wiki links** that automatically generate new pages
3. **Save** their work (auto-commits to git)
4. **Click "Live Site"** to see their article in the actual Quartz wiki
5. **Share the Quartz URL** with classmates to see the final result

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review server logs for detailed error messages
3. Ensure all dependencies are properly installed
4. Verify git and file permissions are correct

---

**Happy collaborative writing! ✨**