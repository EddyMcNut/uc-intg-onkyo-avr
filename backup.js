#!/usr/bin/env node
// backup.js - Backup config.json for Integration Manager compatibility
const fs = require('fs');
const path = require('path');

const configDir = process.env.UC_CONFIG_HOME || process.cwd();
const configPath = path.join(configDir, 'config.json');
const backupDir = path.join(configDir, 'backups');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(backupDir, `config-backup-${timestamp}.json`);

if (!fs.existsSync(configPath)) {
  console.error('No config.json found to backup.');
  process.exit(1);
}
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir);
}
fs.copyFileSync(configPath, backupPath);
console.log(`Backup created: ${backupPath}`);