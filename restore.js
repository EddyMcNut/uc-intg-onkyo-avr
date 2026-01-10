#!/usr/bin/env node
// restore.js - Restore config.json from a backup for Integration Manager compatibility
const fs = require('fs');
const path = require('path');

const configDir = process.env.UC_CONFIG_HOME || process.cwd();
const configPath = path.join(configDir, 'config.json');
const backupDir = path.join(configDir, 'backups');

function getLatestBackup() {
  if (!fs.existsSync(backupDir)) return null;
  const files = fs.readdirSync(backupDir)
    .filter(f => f.startsWith('config-backup-') && f.endsWith('.json'))
    .sort();
  return files.length > 0 ? path.join(backupDir, files[files.length - 1]) : null;
}

const backupFile = process.argv[2] || getLatestBackup();
if (!backupFile || !fs.existsSync(backupFile)) {
  console.error('No backup file found to restore.');
  process.exit(1);
}
fs.copyFileSync(backupFile, configPath);
console.log(`Restored config from: ${backupFile}`);