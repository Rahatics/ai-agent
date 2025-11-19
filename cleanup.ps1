# Cleanup Script for AI Agent
# Removes browser session data to reduce project size

Write-Host "Cleaning up browser session data..."

# Remove browser session directory
Remove-Item -Recurse -Force server\browser_session -ErrorAction SilentlyContinue

# Recreate the directory
New-Item -ItemType Directory -Path server\browser_session -ErrorAction SilentlyContinue

Write-Host "Cleanup complete! Browser session data removed."
Write-Host "Note: You'll need to re-authenticate with Google when you next run the agent."