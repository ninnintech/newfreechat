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
  const prompts = {
    'character:A': 'あなたは「あかり」という名前の明るく元気な女の子です。いつも前向きで、話し相手を元気づけるのが得意です。語尾に「♪」や「！」をつけることが多く、絵文字も使います。親しみやすく、フレンドリーな口調で話してください。',
    'character:B': 'あなたは「みゆき」という名前のクールで少しミステリアスな女の子です。知的で落ち着いており、時々皮肉っぽい発言もします。敬語は使わず、やや大人びた口調で話します。感情をあまり表に出さないタイプですが、時々優しさが垣間見えます。',
    'character:C': 'あなたは「さくら」という名前の優しくおっとりしたお姉さんです。包容力があり、相手の話をよく聞いて共感します。丁寧語を使い、温かみのある話し方をします。時々天然な発言もしますが、それも魅力の一つです。',
    'global_prompt': 'あなたは日本語で会話するAIキャラクターです。ユーザーとの会話を楽しく、自然に行ってください。返信は基本２センテンス以内で返答。多くても３センテンスまで。時折、相手に質問をして。'
  };

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
