#!/usr/bin/env node
/**
 * GitHub OAuth Setup Helper
 * Run this script to configure your GitHub OAuth credentials
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function setupOAuth() {
  console.log('🔧 GitHub OAuth Setup for Chaosmotic Systems Wiki\n');
  
  console.log('You\'ll need to create a GitHub OAuth App first:');
  console.log('1. Go to: https://github.com/settings/developers');
  console.log('2. Click "New OAuth App"');
  console.log('3. Use these settings:');
  console.log('   - Application name: Chaosmotic Systems Wiki Editor');
  console.log('   - Homepage URL: http://localhost:3000');
  console.log('   - Authorization callback URL: http://localhost:3000/auth/github/callback');
  console.log('4. Click "Register application"\n');
  
  const clientId = await question('Enter your GitHub Client ID: ');
  const clientSecret = await question('Enter your GitHub Client Secret: ');
  
  // Generate a random session secret
  const sessionSecret = require('crypto').randomBytes(32).toString('hex');
  
  const envContent = `# GitHub OAuth Configuration
GITHUB_CLIENT_ID=${clientId}
GITHUB_CLIENT_SECRET=${clientSecret}

# Session Configuration
SESSION_SECRET=${sessionSecret}

# Repository Configuration
GITHUB_REPO_OWNER=Chaosmotic-Systems
GITHUB_REPO_NAME=chaosmotic-systems-wiki

# Application Configuration
NODE_ENV=development
PORT=3000`;

  fs.writeFileSync(path.join(__dirname, '.env'), envContent);
  
  console.log('\n✅ OAuth configuration saved to .env file');
  console.log('🚀 You can now start the server with: npm start');
  console.log('\n📝 Users can now log in with:');
  console.log('   - GitHub OAuth (recommended)');
  console.log('   - Local username/password (existing users)');
  
  rl.close();
}

setupOAuth().catch(console.error);