export interface Env {
  CHOOSER_DB_V1: D1Database;
  // CHOOSER_DB_V2: D1Database;  // Add when v2 is ready
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers for all responses
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Route to version-specific handlers
      if (path.startsWith('/api/v1/')) {
        return handleV1(request, env.CHOOSER_DB_V1, corsHeaders);
      }

      // Future version
      // if (path.startsWith('/api/v2/')) {
      //   return handleV2(request, env.CHOOSER_DB_V2, corsHeaders);
      // }

      return new Response('Not found', { status: 404, headers: corsHeaders });
    } catch (error) {
      return new Response(`Error: ${error.message}`, {
        status: 500,
        headers: corsHeaders
      });
    }
  }
};

async function handleV1(
  request: Request,
  db: D1Database,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/v1', '');

  // Placeholder endpoints - will implement later
  if (path === '/health') {
    return new Response(JSON.stringify({ status: 'ok', version: 'v1' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ error: 'Endpoint not implemented' }), {
    status: 404,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
