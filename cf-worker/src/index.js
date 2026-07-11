const API_BASE = 'https://altinapi.com/api/v1';
const KV_KEY = 'latest';

// Portföyde altin.bfn.tr üzerinden aynı origin'den çağrılacaksa '*' yerine
// 'https://altin.bfn.tr' ile sınırlandırılabilir.
const ALLOWED_ORIGIN = '*';

async function fetchPrices(env) {
  const res = await fetch(`${API_BASE}/prices`, {
    headers: { 'X-API-Key': env.ALTINAPI_KEY },
  });
  if (!res.ok) {
    throw new Error(`altinapi.com isteği başarısız: ${res.status}`);
  }
  const body = await res.json();
  const bySymbol = Object.fromEntries(body.data.map((item) => [item.symbol, item]));
  const gram24 = bySymbol.ALTIN;
  const gram22 = bySymbol.AYAR22;
  if (!gram24 || !gram22) {
    throw new Error('Beklenen semboller (ALTIN / AYAR22) yanıtta bulunamadı');
  }
  return {
    gram24: { bid: gram24.bid, ask: gram24.ask },
    gram22: { bid: gram22.bid, ask: gram22.ask },
    sourceUpdatedAt: gram24.timestamp,
    fetchedAt: new Date().toISOString(),
  };
}

async function refreshCache(env) {
  const payload = await fetchPrices(env);
  await env.PRICES.put(KV_KEY, JSON.stringify(payload));
  return payload;
}

function withCors(response) {
  response.headers.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  return response;
}

export default {
  // Günde bir kez cron tarafından tetiklenir; dış API'ye tek istek burada atılır.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(refreshCache(env));
  },

  // Client'lar sadece bunu çağırır; dış API'ye asla doğrudan gitmez.
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return withCors(new Response(null, { status: 204 }));
    }
    if (request.method !== 'GET') {
      return withCors(new Response('Method Not Allowed', { status: 405 }));
    }

    let cached = await env.PRICES.get(KV_KEY);

    // İlk deploy sonrası cron henüz hiç çalışmadıysa KV boştur; bu durumda
    // tek seferlik canlı çekim yapıp KV'yi doldurur (self-healing).
    if (!cached) {
      try {
        cached = JSON.stringify(await refreshCache(env));
      } catch (err) {
        return withCors(
          new Response(JSON.stringify({ error: err.message }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      }
    }

    return withCors(
      new Response(cached, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300',
        },
      })
    );
  },
};
