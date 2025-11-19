# AI Coding Agent (No-API)

A VS Code extension that turns the web version of Gemini into an autonomous coding agent using Playwright.

## Architecture

* **Server (`server/app.py`):** Controls a headless Chrome browser via Playwright to interact with Gemini web interface. Handles prompt injection and response scraping.
* **Extension (`extension/src/extension.ts`):** Handles file system operations (Read/Write) and terminal execution inside VS Code.
* **Communication:** Uses Socket.io for real-time bidirectional communication between VS Code and the Python backend.

## Setup

1.  **Install Python Dependencies:**
    bash
    pip install flask flask-socketio playwright
    playwright install chromium
    
2.  **Run Server:**
    bash
    python server/app.py
    
3.  **Launch Extension:**
    Press `F5` in VS Code to launch the extension host.
4.  **Login:**
    In the opened Chrome window, log in to your Google account once. The session will be saved in `server/browser_session`.

## Features

* 📂 **File System Access:** Can read and write files in your open project.
* 💻 **Terminal Access:** Can execute shell commands.
* 🧠 **Smart Context:** Automatically scans file structure to understand the project.
* 💰 **Free:** Uses the free web tier of Gemini, no API keys required.