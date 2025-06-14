#!/usr/bin/env node

// Script to securely set up API keys and secrets
// Usage: node scripts/setup-secrets.js

const { execSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function setupAPIKey() {
  console.log('🔐 Setting up Venice AI API Key securely...\n');
  
  const apiKey = await question('Enter your Venice AI API key: ');
  
  if (!apiKey || apiKey.trim().length === 0) {
    console.log('❌ No API key provided. Exiting...');
    rl.close();
    return;
  }

  try {
    // Set for production
    console.log('📝 Setting API key for PRODUCTION environment...');
    execSync(`npx wrangler kv key put "venice_api_key" "${apiKey.trim()}" --binding CHAT_KV --preview false`, {
      stdio: 'inherit'
    });
    console.log('✅ Production API key set successfully');

    // Set for preview
    console.log('📝 Setting API key for PREVIEW environment...');
    execSync(`npx wrangler kv key put "venice_api_key" "${apiKey.trim()}" --binding CHAT_KV --preview`, {
      stdio: 'inherit'
    });
    console.log('✅ Preview API key set successfully');

    console.log('\n🎉 API key setup completed!');
    console.log('🔒 Your API key is now securely stored in Cloudflare KV');
    console.log('⚠️  Make sure to never commit API keys to version control');

  } catch (error) {
    console.error('❌ Failed to set API key:', error.message);
  }

  rl.close();
}

async function main() {
  console.log('🔐 Secure Setup Script for AI Chat Service\n');
  console.log('This script will help you securely configure your API keys.');
  console.log('Your API key will be stored in Cloudflare KV and never exposed in code.\n');

  await setupAPIKey();
}

if (require.main === module) {
  main();
}
