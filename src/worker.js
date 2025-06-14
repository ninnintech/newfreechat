// Cloudflare Worker for AI Character Chat Service

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
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
  // Default to index.html for root path
  if (pathname === '/') {
    pathname = '/index.html';
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

  try {
    let fileContent;

    if (isImage) {
      // For images, get as arrayBuffer to preserve binary data
      fileContent = await env.CHAT_KV.get(fileKey, 'arrayBuffer');
      console.log(`Image ${fileKey}: ${fileContent ? 'found' : 'not found'}, size: ${fileContent ? fileContent.byteLength : 0}`);
    } else {
      // For text files, get as text
      fileContent = await env.CHAT_KV.get(fileKey);
      console.log(`Text file ${fileKey}: ${fileContent ? 'found' : 'not found'}, length: ${fileContent ? fileContent.length : 0}`);
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

  // Return 404 for missing files
  return new Response('File not found', {
    status: 404,
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/plain'
    }
  });
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
