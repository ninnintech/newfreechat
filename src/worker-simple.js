// Simple test worker
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

    // Test endpoint
    if (url.pathname === '/test') {
      return new Response('Worker is working!', {
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
      });
    }

    // Root path - serve index.html from KV
    if (url.pathname === '/' || url.pathname === '/index.html') {
      try {
        const fileContent = await env.CHAT_KV.get('static:/index.html');
        if (fileContent) {
          return new Response(fileContent, {
            headers: {
              ...corsHeaders,
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'public, max-age=3600'
            }
          });
        }
      } catch (error) {
        console.error('Error serving index.html:', error);
      }
    }

    // Return 404 for other paths
    return new Response('File not found', {
      status: 404,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/plain'
      }
    });
  }
};
