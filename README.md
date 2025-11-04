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

Open your favorite application (if you haven't already): Terminal on Mac OS; Command Prompt or Powershell ([run as Administrator](https://electro-smith.com/products/daisy-seed)) on Windows.

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
Already installed and stepped away? Made some changes are ready to make them public? Here's how to get back into your flow. Changes will appear on the public website only ager your successfully run `npx quartz sync`. Sync before you make changes. Sync after you make changes.

### Before Editing
1. As a matter of habit, everytime you open Obsidian, you should also open terminal.
2. Enter `cd chaosmotic-systems-wiki`. 
3. Run the command `npx quartz sync`. This will synchonize the materials on your local machine with the version on GitHub which is shared by the class. **Sync before you make changes. Sync after you make changes.** 
4. When complete, run `npx quartz build --serve`.
5. Open your browser and navigate to [http://localhost:8080]([url](http://localhost:8080)) to see a preview of the site that reflects your local changes.

Go back to Obsidian and add your content. You will see the work previewed as a local server in the browser.

### Uploading
Upload often. This will take your changes and synchronize them to the remote server attached to the public domain. 

1. Now that we've made some changes we want to make public, return to your terminal window. Type `ctrl + c` to stop the local webserver.
2. Run `npx quartz sync`. Your changes should soon be live. You can double check that this was successful by going to the GitHub page and looking at the `content` directory. Your files should be present there.

Note: If you get an error, it may be because you have not logged into your GitHub account and gotten privleges. You will need to login to your account in the Termainl, and also need to have communicated your GitHub ID to the course TA who will add you as a collaborator on the repository (you will need to confirm this in an email). 
