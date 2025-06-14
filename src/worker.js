// Cloudflare Worker for AI Character Chat Service

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    console.log(`[DEBUG] Request received: ${request.method} ${url.pathname}`);

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      console.log(`[DEBUG] CORS preflight request`);
      return new Response(null, { headers: corsHeaders });
    }

    // Test endpoint
    if (url.pathname === '/test') {
      console.log(`[DEBUG] Test endpoint accessed`);
      return new Response('Worker is working!', {
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
      });
    }

    // API routes
    if (url.pathname === '/api/chat') {
      return handleChatRequest(request, env, corsHeaders);
    }

    if (url.pathname === '/api/remaining') {
      return handleRemainingRequest(request, env, corsHeaders);
    }

    // Test image endpoint
    if (url.pathname === '/test-image') {
      return handleTestImage(corsHeaders);
    }

    // Debug KV store
    if (url.pathname === '/debug-kv') {
      return handleDebugKV(env, corsHeaders);
    }

    // Static file serving
    return handleStaticFiles(url.pathname, env, corsHeaders);
  }
};

// Handle chat API requests
async function handleChatRequest(request, env, corsHeaders) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405, 
      headers: corsHeaders 
    });
  }

  try {
    const { characterId, userMessage, fingerprint } = await request.json();

    // Validate input
    if (!characterId || !userMessage || !fingerprint) {
      return new Response(JSON.stringify({ 
        error: 'Missing required fields' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check usage limit
    const usageCheck = await checkUsageLimit(fingerprint, env);
    if (!usageCheck.allowed) {
      return new Response(JSON.stringify({ 
        error: 'Daily limit exceeded',
        message: '本日のチャットは終了しました。また明日お話しましょうね！'
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get character prompt and API key from KV
    const characterPrompt = await env.CHAT_KV.get(`character:${characterId}`);
    const globalPrompt = await env.CHAT_KV.get('global_prompt');
    const apiKey = await env.CHAT_KV.get('venice_api_key');

    if (!characterPrompt || !apiKey) {
      return new Response(JSON.stringify({ 
        error: 'Configuration error' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get conversation history
    const historyKey = `history:${fingerprint}:${characterId}`;
    const historyData = await env.CHAT_KV.get(historyKey);
    let history = historyData ? JSON.parse(historyData) : [];

    // Prepare messages for Venice AI
    const messages = [
      { role: 'system', content: globalPrompt || '' },
      { role: 'system', content: characterPrompt },
      ...history,
      { role: 'user', content: userMessage }
    ];

    // Call Venice AI API
    const aiResponse = await callVeniceAI(messages, apiKey);
    
    if (!aiResponse.success) {
      return new Response(JSON.stringify({ 
        error: 'AI service error' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Update conversation history (keep last 5 exchanges = 10 messages)
    history.push(
      { role: 'user', content: userMessage },
      { role: 'assistant', content: aiResponse.message }
    );
    
    // Keep only last 10 messages (5 exchanges)
    if (history.length > 10) {
      history = history.slice(-10);
    }

    // Save updated history
    await env.CHAT_KV.put(historyKey, JSON.stringify(history), {
      expirationTtl: 86400 // 24 hours
    });

    // Increment usage count
    await incrementUsageCount(fingerprint, env);

    return new Response(JSON.stringify({
      message: aiResponse.message,
      remainingChats: Math.max(0, 20 - usageCheck.count - 1)
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Chat request error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// Handle remaining chats request
async function handleRemainingRequest(request, env, corsHeaders) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: corsHeaders
    });
  }

  try {
    const { fingerprint } = await request.json();

    if (!fingerprint) {
      return new Response(JSON.stringify({
        error: 'Missing fingerprint'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check usage limit
    const usageCheck = await checkUsageLimit(fingerprint, env);

    return new Response(JSON.stringify({
      remainingChats: Math.max(0, 20 - usageCheck.count)
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Remaining request error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// Check daily usage limit
async function checkUsageLimit(fingerprint, env) {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const usageKey = `usage:${fingerprint}:${today}`;
  
  const currentUsage = await env.CHAT_KV.get(usageKey);
  const count = currentUsage ? parseInt(currentUsage) : 0;
  
  return {
    allowed: count < 20,
    count: count
  };
}

// Increment usage count
async function incrementUsageCount(fingerprint, env) {
  const today = new Date().toISOString().split('T')[0];
  const usageKey = `usage:${fingerprint}:${today}`;
  
  const currentUsage = await env.CHAT_KV.get(usageKey);
  const count = currentUsage ? parseInt(currentUsage) + 1 : 1;
  
  await env.CHAT_KV.put(usageKey, count.toString(), {
    expirationTtl: 86400 // 24 hours
  });
}

// Call Venice AI API
async function callVeniceAI(messages, apiKey) {
  try {
    const response = await fetch('https://api.venice.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'venice-uncensored',
        messages: messages,
        max_tokens: 500,
        temperature: 0.8
      })
    });

    if (!response.ok) {
      console.error('Venice AI API error:', response.status, await response.text());
      return { success: false };
    }

    const data = await response.json();
    return {
      success: true,
      message: data.choices[0].message.content
    };
  } catch (error) {
    console.error('Venice AI call error:', error);
    return { success: false };
  }
}

// Handle static file serving
async function handleStaticFiles(pathname, env, corsHeaders) {
  console.log(`[DEBUG] handleStaticFiles called with pathname: ${pathname}`);

  // Default to index.html for root path
  if (pathname === '/') {
    pathname = '/index.html';
    console.log(`[DEBUG] Root path detected, changed to: ${pathname}`);
  }

  // Map file extensions to content types
  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml'
  };

  const extension = pathname.substring(pathname.lastIndexOf('.'));
  const contentType = contentTypes[extension] || 'text/plain';
  const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.svg'].includes(extension);

  // Try to get static file content from KV store
  const fileKey = `static:${pathname}`;
  console.log(`[DEBUG] Attempting to get file with key: ${fileKey}`);

  try {
    let fileContent;

    if (isImage) {
      // For images, get as arrayBuffer to preserve binary data
      fileContent = await env.CHAT_KV.get(fileKey, 'arrayBuffer');
      console.log(`[DEBUG] Image file ${fileKey}: ${fileContent ? 'FOUND' : 'NOT FOUND'}`);
    } else {
      // For text files, get as text
      fileContent = await env.CHAT_KV.get(fileKey, 'text');
      console.log(`[DEBUG] Text file ${fileKey}: ${fileContent ? 'FOUND' : 'NOT FOUND'}`);
      if (fileContent) {
        console.log(`[DEBUG] File content length: ${fileContent.length}`);
        console.log(`[DEBUG] File content preview: ${fileContent.substring(0, 100)}...`);
      }
    }

    if (fileContent) {
      return new Response(fileContent, {
        headers: {
          ...corsHeaders,
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=3600'
        }
      });
    }
  } catch (error) {
    console.error('Error serving file:', pathname, error);
  }

  // Return 404 for missing files (フォールバック無効化)
  return new Response('File not found', {
    status: 404,
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/plain'
    }
  });

  // Fallback for index.html if not found in KV (無効化)
  if (false && pathname === '/index.html') {
    console.log('[DEBUG] Serving fallback index.html');
    const fallbackHTML = `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AIキャラクターチャット</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; color: white; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        header { text-align: center; margin-bottom: 40px; }
        header h1 { font-size: 2.5rem; margin-bottom: 10px; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); }
        header p { font-size: 1.2rem; opacity: 0.9; }
        .character-selection { display: flex; justify-content: center; gap: 30px; margin: 40px 0; flex-wrap: wrap; }
        .character-card { background: rgba(255,255,255,0.1); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.2); padding: 25px; border-radius: 20px; cursor: pointer; transition: all 0.3s ease; text-align: center; min-width: 250px; }
        .character-card:hover { transform: translateY(-10px); background: rgba(255,255,255,0.2); box-shadow: 0 20px 40px rgba(0,0,0,0.2); }
        .character-image { width: 100%; max-width: 200px; height: 180px; border-radius: 15px; object-fit: cover; object-position: center top; margin: 0 auto 15px auto; border: 3px solid rgba(255,255,255,0.3); display: block; background: rgba(255,255,255,0.1); }
        .character-info h3 { font-size: 1.5rem; margin: 15px 0 8px 0; color: #fff; }
        .character-info p { font-size: 1rem; opacity: 0.8; line-height: 1.4; }
        .ad-container { margin: 30px 0; text-align: center; }
        .ad-top-pc { display: block; }
        .ad-top-mobile { display: none; }
        .footer-links { display: flex; justify-content: center; gap: 20px; margin: 20px 0; }
        .footer-links a { color: rgba(255,255,255,0.8); text-decoration: none; transition: color 0.3s; }
        .footer-links a:hover { color: white; }
        footer { text-align: center; margin-top: 50px; padding-top: 30px; border-top: 1px solid rgba(255,255,255,0.2); }
        footer p { opacity: 0.7; font-size: 0.9rem; }
        @media (max-width: 768px) {
            .container { padding: 15px; }
            header h1 { font-size: 2rem; }
            .character-selection { gap: 20px; }
            .character-card { min-width: 200px; padding: 20px; }
            .character-image { max-width: 150px; height: 140px; }
            .ad-top-pc { display: none; }
            .ad-top-mobile { display: block; }
        }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/@fingerprintjs/fingerprintjs@4/dist/fp.min.js"></script>
</head>
<body>
    <div class="container">
        <header>
            <h1>AIキャラクターチャット</h1>
            <p>お気に入りのキャラクターを選んでチャットを楽しもう！</p>
        </header>
        <main>
            <!-- PC用広告（キャラクターの上） -->
            <div class="ad-container ad-top-pc">
                <ins class="dmm-widget-placement" data-id="6a9d758775dcf0e0b17bca5ba4d9d6c5" style="background:transparent"></ins>
                <script src="https://widget-view.dmm.co.jp/js/placement.js" class="dmm-widget-scripts" data-id="6a9d758775dcf0e0b17bca5ba4d9d6c5"></script>
            </div>

            <!-- スマホ用広告（キャラクターの上） -->
            <div class="ad-container ad-top-mobile">
                <ins class="dmm-widget-placement" data-id="ef127a09baa827dfd54c7414bd6536d9" style="background:transparent"></ins>
                <script src="https://widget-view.dmm.co.jp/js/placement.js" class="dmm-widget-scripts" data-id="ef127a09baa827dfd54c7414bd6536d9"></script>
            </div>

            <div class="character-selection">
                <div class="character-card" data-character="A">
                    <img src="/images/character-a.jpg" alt="あかり" class="character-image" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjE4MCIgdmlld0JveD0iMCAwIDIwMCAxODAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMTgwIiBmaWxsPSIjRkY2QkI2Ii8+Cjx0ZXh0IHg9IjEwMCIgeT0iOTAiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIyNCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj7jgYLjgYvjgorjgYQ8L3RleHQ+Cjwvc3ZnPg=='">
                    <div class="character-info">
                        <h3>あかり</h3>
                        <p>オープンなギャル</p>
                    </div>
                </div>
                <div class="character-card" data-character="B">
                    <img src="/images/character-b.jpg" alt="みゆき" class="character-image" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjE4MCIgdmlld0JveD0iMCAwIDIwMCAxODAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMTgwIiBmaWxsPSIjNjY3RUVBIi8+Cjx0ZXh0IHg9IjEwMCIgeT0iOTAiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIyNCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj7jgb/jgobjgY3jgYQ8L3RleHQ+Cjwvc3ZnPg=='">
                    <div class="character-info">
                        <h3>みゆき</h3>
                        <p>恥ずかしがり屋の学級委員長</p>
                    </div>
                </div>
                <div class="character-card" data-character="C">
                    <img src="/images/character-c.jpg" alt="さくら" class="character-image" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjE4MCIgdmlld0JveD0iMCAwIDIwMCAxODAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMTgwIiBmaWxsPSIjRkY5QkM1Ii8+Cjx0ZXh0IHg9IjEwMCIgeT0iOTAiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIyNCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj7jgZXjgY/jgonjgYQ8L3RleHQ+Cjwvc3ZnPg=='">
                    <div class="character-info">
                        <h3>さくら</h3>
                        <p>優しくおっとりした叔母</p>
                    </div>
                </div>
            </div>

            <!-- 広告エリア（キャラクターの下） -->
            <div class="ad-container">
                <ins class="dmm-widget-placement" data-id="1969b2fbda6520b5080f385af94fb47d" style="background:transparent"></ins>
                <script src="https://widget-view.dmm.co.jp/js/placement.js" class="dmm-widget-scripts" data-id="1969b2fbda6520b5080f385af94fb47d"></script>
            </div>
        </main>
        <footer>
            <div class="footer-links">
                <a href="/terms.html">利用規約</a>
                <a href="/privacy.html">プライバシーポリシー</a>
            </div>
            <p>&copy; 2024 AIキャラクターチャット. All rights reserved.</p>
        </footer>
    </div>
    <script>
        document.addEventListener('DOMContentLoaded', function() {
            const characterCards = document.querySelectorAll('.character-card');
            characterCards.forEach(card => {
                card.addEventListener('click', function() {
                    const characterId = this.dataset.character;
                    window.location.href = '/chat.html?character=' + characterId;
                });
            });
        });
    </script>
</body>
</html>`;

    return new Response(fallbackHTML, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300'
      }
    });
  }







  // Return 404 for missing files
  return new Response('File not found', {
    status: 404,
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/plain'
    }
  });
}

// Debug KV store handler
async function handleDebugKV(env, corsHeaders) {
  try {
    console.log('[DEBUG] Testing KV store access...');

    // Test basic KV access
    const testKey = 'debug-test';
    await env.CHAT_KV.put(testKey, 'test-value');
    const testValue = await env.CHAT_KV.get(testKey);

    // Try to get the index.html file
    const indexContent = await env.CHAT_KV.get('static:/index.html', 'text');

    // Try to get image
    const imageContent = await env.CHAT_KV.get('static:/images/character-a.jpg', 'arrayBuffer');

    // List all keys with prefix
    const staticKeys = await env.CHAT_KV.list({ prefix: 'static:' });
    const allKeys = await env.CHAT_KV.list();

    const debugInfo = {
      kvAccess: testValue === 'test-value' ? 'SUCCESS' : 'FAILED',
      indexHtmlFound: indexContent ? 'YES' : 'NO',
      indexHtmlLength: indexContent ? indexContent.length : 0,
      imageFound: imageContent ? 'YES' : 'NO',
      imageSize: imageContent ? imageContent.byteLength : 0,
      staticKeysCount: staticKeys.keys.length,
      staticKeys: staticKeys.keys.map(k => k.name),
      totalKeys: allKeys.keys.length,
      allKeys: allKeys.keys.map(k => k.name)
    };

    return new Response(JSON.stringify(debugInfo, null, 2), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
}

// Test image handler
function handleTestImage(corsHeaders) {
  // 1x1 pixel red JPEG image in base64
  const testImageBase64 = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/8A8A';

  const imageBuffer = Uint8Array.from(atob(testImageBase64), c => c.charCodeAt(0));

  return new Response(imageBuffer, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}
