　　　.   　　˚　✭　 　　*　　 　　✦　　　.　　.　　　✦　˚ 　　　　 ˚　.˚　　　　　✭　.　　. 　 ˚　.　c h a o s m o t i c 　　　.   　　˚　✭　 　　*　　 　　✦　　　.　　.　　　✦　˚ 　　　　 ˚　.˚　　　　　✭　.　　. 　 ˚　.　s y s t e m s 　　　.   　　˚　✭　 　　*　　 　　✦　　　.　　.　　　✦　˚ 　　　　 ˚　.˚　　　　　✭　.　　. 　 ˚　.　

Chaosmotic Systems: Culture, Cosmology, Computation is an MFA-level seminar taught by Grace Grace Grace. It was taught for the first time at the School of the Art Institute of Chicago in the Art Technology / Sound Practices department during Fall 2024 semester. The course materials are public and can be accessed here.

This repository serves as an entry point for the course's collaborative wiki project. Students will contribute (5) 500-word articles about concepts, authors,

## Installation
### Obsidian
Obsidian is where you will add to the Wiki on your own machine. Changes made on your own machine in Obsidian will not be automatically sync'd to the website (more on that soon). Download [here](https://obsidian.md/).

### Node.js and Git
You will need to download and install node.js, npm, and git. Note the steps are different for MacOS or Windows.

#### Windows 
Windows users are able to just download and run the installers. Lucky you. 

1. Follow instructions here [node.js](https://nodejs.org/en).
2. Follow instructions here [Git For Windows](https://gitforwindows.org/).
3. Follow instructions here [GitHub CLI](https://cli.github.com/).

#### MacOS Users

You will need to install via Terminal.

1. Open the application Terminal.
2. Run this command to install Homebrew: `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`
3. Run these commands to install node and npm `brew install node; brew install npm`. This may take some time.
4. Run this command to install git: `brew install git`.
5. Run this command to install GitHub command line interface: `brew install gh`.

### Final Installation Steps

Open your favorite application (if you haven't already): Terminal on Mac OS; Command Prompt or Powershell ([run as Administrator](https://www.google.com/search?q=run+powershell+as+admin&sourceid=chrome&ie=UTF-8)) on Windows.

#### Authenticate GitHub

1. Run the following command and follow the instructions to authenticate GitHub Commandline: `gh auth login`. At this point you will need to login to your Github account in the terminal, so have your username and password handy.
2. Close the terminal.
3. Open a new one before proceeding.

#### Clone the Repository and Build the Quartz Website
1. Clone the repository to your computer with this command: `git clone https://github.com/garrett-laroy-johnson/chaosmotic-systems-wiki`
2. Run the command: `cd chaosmotic-systems-wiki`
3. Run the command: `npm i`. This will install all the requisate files to build out the site from our Obsidian files.
4. Run the command `npx quartz sync`. This will synchonize the materials on your local machine with the version on GitHub which is shared by the class. 
4. When complete, run `npx quartz build --serve`. This starts a server on your machine that shows you how the website will look based on the code on your computer.
5. Open your browser and navigate to [http://localhost:8080]([url](http://localhost:8080)) to see a preview of the site that reflects your local changes.

You're good to go on the terminal setup side.

#### Add the Repository to the Obsidian as a Vault

Open Obsidian and click "open folder as vault". Find your `chaosmotic-systems-wiki` folder (probably `users/yourusername`, click into it, and select `content`.

Cool! You're done. You are set up to edit. Open Obsidian, make changes, and see them reflected on the Quartz webpage. Follow the instructions below to make your changes public.

## Editing Workflow
Already installed and stepped away? Made some changes are ready to make them public? Here's how to get back into your flow. **Important: Always pull updates before editing and push your changes when done.**

### Before Editing
1. As a matter of habit, every time you open Obsidian, you should also open terminal.
2. Enter `cd chaosmotic-systems-wiki`. 
3. **Get the latest changes from your classmates:** Run `git pull origin v4` 
4. **Start the preview server:** Run `npx quartz build --serve`
5. Open your browser and navigate to [http://localhost:8080](http://localhost:8080) to see a preview of the site that reflects your local changes.

Go back to Obsidian and add your content. You will see the work previewed as a local server in the browser.

### Publishing Your Changes
When you're ready to share your work with the class:

1. **Stop the local server:** In your terminal window, type `Ctrl + C` to stop the local webserver.
2. **Check what you've changed:** Run `git status` to see your modified files
3. **Add your changes:** Run `git add .` to stage all your changes
4. **Commit with a message:** Run `git commit -m "Add article about [describe your topic]"` (replace with your actual topic)
5. **Push to share:** Run `git push origin v4`

Your changes should now be live! You can verify by checking the GitHub page and looking at the `content` directory.

## Troubleshooting Common Issues

### Permission Errors
If you get an error when pushing, it may be because:
- You haven't logged into your GitHub account: Make sure you completed `gh auth login`
- You don't have collaborator privileges: Communicate your GitHub username to the course TA who will add you as a collaborator (you'll need to accept the email invitation)

### Merge Conflicts
If you see a message about "merge conflicts" when pulling:
1. **Don't panic!** This happens when you and a classmate edited the same file
2. Open the conflicted file in Obsidian or a text editor
3. Look for sections marked with `<<<<<<<`, `=======`, and `>>>>>>>`
4. Decide which version to keep (yours, theirs, or a combination)
5. Remove the conflict markers and save the file
6. Run `git add .` then `git commit -m "Resolve merge conflict"`
7. Continue with `git push origin v4`

### "Your branch is behind" Messages
If git says your branch is behind:
1. Run `git pull origin v4` to get the latest changes
2. If there are no conflicts, proceed normally
3. If there are conflicts, follow the merge conflict steps above

### Emergency Reset
If things get really messed up and you want to start fresh:
1. **Backup your new content files first!** Copy them somewhere safe
2. Run `git reset --hard origin/v4` to reset to the latest version
3. Copy your backed-up files back into the content folder
4. Follow the normal workflow to add and commit them 
