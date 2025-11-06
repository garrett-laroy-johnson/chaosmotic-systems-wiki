# Deployment Guide for Chaosmotic Systems Wiki

## Railway.app Deployment

### Prerequisites
- GitHub account (you have this)
- Railway.app account (free)
- Your OAuth app configured

### Step 1: Sign up for Railway
1. Go to https://railway.app
2. Sign up with your GitHub account
3. Authorize Railway to access your repositories

### Step 2: Deploy from GitHub
1. Click "New Project"
2. Select "Deploy from GitHub repo"
3. Choose "chaosmotic-systems-wiki"
4. Railway will detect your Node.js app automatically

### Step 3: Environment Variables
In Railway dashboard, add these environment variables:

```
GITHUB_CLIENT_ID=Ov23liaXGW3bYqZaEIkV
GITHUB_CLIENT_SECRET=e43d52726e0e68a5b4b54bd67c3111e0fb08742b
SESSION_SECRET=14fbfa8dbab703fb6f90a270e0a8ce9ffe1a67c5366f6b5ea173eabba19693a3
GITHUB_REPO_OWNER=Chaosmotic-Systems
GITHUB_REPO_NAME=chaosmotic-systems-wiki
ALLOWED_GITHUB_ORG=Chaosmotic-Systems
ALLOWED_GITHUB_TEAM=
NODE_ENV=production
PORT=3000
```

### Step 4: Update GitHub OAuth App
1. Go to https://github.com/settings/developers
2. Edit your OAuth app
3. Update callback URL to: https://your-app-name.railway.app/auth/github/callback

### Step 5: Deploy!
Railway will automatically build and deploy your app.

## Alternative: Render.com

Similar process but with Render:
1. Sign up at render.com
2. Connect GitHub repo
3. Set environment variables
4. Deploy

## Domain Setup (Optional)
Both Railway and Render provide free subdomains:
- Railway: `your-app.railway.app`
- Render: `your-app.onrender.com`

You can later add a custom domain if desired.