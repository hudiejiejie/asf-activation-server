#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BACKUP_ROOT = process.env.BACKUP_ROOT || path.join(__dirname, 'data', 'backups');
const DRY_RUN = process.argv.includes('--dry-run');

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function safeReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.warn('[warn] read json failed:', filePath, error.message);
    return null;
  }
}

function getBackupHash(backupDir, meta) {
  if (meta?.archiveHash) return meta.archiveHash;
  const archivePath = path.join(backupDir, 'archive.bin');
  if (!fs.existsSync(archivePath)) return null;
  return sha256File(archivePath);
}

if (!fs.existsSync(BACKUP_ROOT)) {
  console.log('[info] backup root not found:', BACKUP_ROOT);
  process.exit(0);
}

let totalMachines = 0;
let totalGroups = 0;
let totalDeleted = 0;

for (const machineId of fs.readdirSync(BACKUP_ROOT)) {
  const machineDir = path.join(BACKUP_ROOT, machineId);
  if (!fs.statSync(machineDir).isDirectory()) continue;
  totalMachines++;

  const backups = fs.readdirSync(machineDir)
    .map(name => ({ name, dir: path.join(machineDir, name) }))
    .filter(item => fs.existsSync(item.dir) && fs.statSync(item.dir).isDirectory())
    .sort((a, b) => String(b.name).localeCompare(String(a.name))); // newest first

  const seen = new Map();
  for (const item of backups) {
    const meta = safeReadJson(path.join(item.dir, 'meta.json'));
    const hash = getBackupHash(item.dir, meta);
    const signature = meta?.contentSignature || null;
    const key = hash ? `hash:${hash}` : (signature ? `sig:${signature}` : null);

    if (!key) continue;

    if (!seen.has(key)) {
      seen.set(key, item);
      continue;
    }

    totalGroups++;
    if (DRY_RUN) {
      console.log(`[dry-run] duplicate => machine=${machineId} keep=${seen.get(key).name} delete=${item.name} by=${key}`);
      totalDeleted++;
      continue;
    }

    fs.rmSync(item.dir, { recursive: true, force: true });
    console.log(`[delete] machine=${machineId} keep=${seen.get(key).name} delete=${item.name} by=${key}`);
    totalDeleted++;
  }
}

console.log('----------------------------------------');
console.log(`[summary] machines=${totalMachines}`);
console.log(`[summary] duplicate-groups=${totalGroups}`);
console.log(`[summary] deleted=${totalDeleted}`);
console.log(`[summary] mode=${DRY_RUN ? 'dry-run' : 'apply'}`);
