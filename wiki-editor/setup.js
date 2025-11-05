const bcrypt = require('bcryptjs');
const fs = require('fs').promises;
const path = require('path');
const { createInterface } = require('readline');

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function setupUsers() {
  console.log('\n🌟 Chaosmotic Systems Wiki Editor Setup');
  console.log('=====================================\n');

  const users = [];

  // Create admin user
  console.log('Setting up administrator account:');
  const adminUsername = await question('Admin username (default: admin): ') || 'admin';
  const adminPassword = await question('Admin password (default: admin123): ') || 'admin123';
  const adminName = await question('Admin display name (default: Administrator): ') || 'Administrator';

  const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);
  users.push({
    username: adminUsername,
    password: hashedAdminPassword,
    displayName: adminName,
    role: 'admin'
  });

  console.log('\n📚 Adding student accounts:');
  console.log('You can add students now or later by editing users.json\n');

  let addMore = true;
  while (addMore) {
    const addStudent = await question('Add a student account? (y/n): ');
    if (addStudent.toLowerCase() !== 'y') {
      addMore = false;
      continue;
    }

    const studentUsername = await question('Student username: ');
    if (!studentUsername) {
      console.log('Username cannot be empty!');
      continue;
    }

    // Check for duplicate username
    if (users.some(u => u.username === studentUsername)) {
      console.log('Username already exists!');
      continue;
    }

    const studentPassword = await question('Student password: ');
    if (!studentPassword) {
      console.log('Password cannot be empty!');
      continue;
    }

    const studentName = await question(`Display name (default: ${studentUsername}): `) || studentUsername;

    const hashedStudentPassword = await bcrypt.hash(studentPassword, 10);
    users.push({
      username: studentUsername,
      password: hashedStudentPassword,
      displayName: studentName,
      role: 'student'
    });

    console.log(`✅ Added student: ${studentName}\n`);
  }

  // Save users to file
  try {
    await fs.writeFile(
      path.join(__dirname, 'users.json'),
      JSON.stringify(users, null, 2),
      'utf8'
    );
    console.log(`\n✅ Created ${users.length} user accounts in users.json`);
  } catch (error) {
    console.error('❌ Failed to save users:', error.message);
    process.exit(1);
  }

  console.log('\n🚀 Setup complete! You can now start the server with:');
  console.log('   npm start\n');
  console.log('📝 To add more students later, edit users.json and restart the server.\n');

  rl.close();
}

async function main() {
  try {
    // Check if users.json already exists
    try {
      await fs.access(path.join(__dirname, 'users.json'));
      const overwrite = await question('users.json already exists. Overwrite? (y/n): ');
      if (overwrite.toLowerCase() !== 'y') {
        console.log('Setup cancelled.');
        rl.close();
        return;
      }
    } catch (error) {
      // File doesn't exist, continue with setup
    }

    await setupUsers();
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    rl.close();
    process.exit(1);
  }
}

main();