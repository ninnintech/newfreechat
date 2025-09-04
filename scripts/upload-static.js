#!/usr/bin/env node

// Script to upload static files and character prompts to Cloudflare KV
// Usage: node scripts/upload-static.js

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PUBLIC_DIR = path.join(__dirname, '../public');

// Files to upload to KV
const staticFiles = [
  'index.html',
  'chat.html',
  'terms.html',
  'privacy.html',
  'test-typing.html',
  'css/style.css',
  'js/app.js',
  'images/character-a.jpg',
  'images/character-b.jpg',
  'images/character-c.jpg'
];

function uploadFile(filePath, isPreview = false) {
  const fullPath = path.join(PUBLIC_DIR, filePath);

  if (!fs.existsSync(fullPath)) {
    console.log(`File not found: ${filePath}`);
    return;
  }

  const kvKey = `static:/${filePath}`;
  const previewFlag = isPreview ? '--preview' : '--preview false';
  const envText = isPreview ? '(preview)' : '(production)';

  try {
    console.log(`Uploading ${filePath} to KV ${envText} as ${kvKey}...`);
    execSync(`npx wrangler kv key put "${kvKey}" --path "${fullPath}" --binding CHAT_KV ${previewFlag}`, {
      stdio: 'inherit'
    });
    console.log(`✓ Uploaded ${filePath} ${envText}`);
  } catch (error) {
    console.error(`✗ Failed to upload ${filePath} ${envText}:`, error.message);
  }
}

function uploadCharacterPrompts(isPreview = false) {
  // Load prompts from external file (not tracked in git)
  const promptsPath = path.join(__dirname, '../prompts/characters.json');

  if (!fs.existsSync(promptsPath)) {
    console.error('❌ Prompts file not found:', promptsPath);
    console.log('📝 Please create prompts/characters.json with your character prompts');
    console.log('📝 Example structure:');
    console.log(JSON.stringify({
      'character:A': 'Character A prompt...',
      'character:B': 'Character B prompt...',
      'character:C': 'Character C prompt...',
      'global_prompt': 'Global system prompt...'
    }, null, 2));
    return;
  }

  let prompts;
  try {
    const promptsContent = fs.readFileSync(promptsPath, 'utf8');
    prompts = JSON.parse(promptsContent);
  } catch (error) {
    console.error('❌ Failed to load prompts file:', error.message);
    return;
  }

  const previewFlag = isPreview ? '--preview' : '--preview false';
  const envText = isPreview ? '(preview)' : '(production)';

  Object.entries(prompts).forEach(([key, value]) => {
    try {
      console.log(`Setting prompt ${envText}: ${key}...`);
      execSync(`npx wrangler kv key put "${key}" "${value}" --binding CHAT_KV ${previewFlag}`, {
        stdio: 'inherit'
      });
      console.log(`✓ Set ${key} ${envText}`);
    } catch (error) {
      console.error(`✗ Failed to set ${key} ${envText}:`, error.message);
    }
  });
}

function main() {
  console.log('Uploading static files to Cloudflare KV...\n');

  // Upload to production KV
  console.log('📦 Uploading to PRODUCTION KV...');
  staticFiles.forEach(file => uploadFile(file, false));

  console.log('\n📦 Uploading to PREVIEW KV (for development)...');
  staticFiles.forEach(file => uploadFile(file, true));

  console.log('\nSetting up character prompts...\n');

  // Upload character prompts to both environments
  console.log('📝 Setting up prompts in PRODUCTION KV...');
  uploadCharacterPrompts(false);

  console.log('\n📝 Setting up prompts in PREVIEW KV...');
  uploadCharacterPrompts(true);

  console.log('\n⚠️  Don\'t forget to set your Venice AI API key for both environments:');
  console.log('Production: npx wrangler kv key put "venice_api_key" "your-api-key-here" --binding CHAT_KV --preview false');
  console.log('Preview: npx wrangler kv key put "venice_api_key" "your-api-key-here" --binding CHAT_KV --preview');

  console.log('\nDone! 🎉');
}

if (require.main === module) {
  main();
}
