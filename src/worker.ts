import { Router } from 'itty-router'

interface Env {
  ASSETS: any
  ANALYTICS?: any
}

const router = Router()

// API 路由
router.get('/ajax/*', handleAjaxProxy)
router.get('/rpc/*', handleAjaxProxy)
router.get('/*.php', handleAjaxProxy)
router.get('/api/illust/random', handleRandom)
router.get('/api/user', handleUser)
router.get('/~*', handleImage)
router.get('/-*', handleImage)

// 静态资源和 SPA fallback
router.all('*', handleAssets)

async function handleAjaxProxy(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname
  
  // 构建目标 URL
  let targetUrl = `https://pixiv.net${path}${url.search}`
  
  // 保留查询参数
  const headers = new Headers(request.headers)
  
  // 添加必要的 headers
  headers.set('Referer', 'https://pixiv.net/')
  headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
  
  // 移除 Host header，让 fetch 自动设置
  headers.delete('Host')
  
  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: request.method !== 'GET' ? request.body : undefined,
    })
    
    // 复制响应并添加 CORS headers
    const newResponse = new Response(response.body, response)
    newResponse.headers.set('Access-Control-Allow-Origin', '*')
    newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    
    return newResponse
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Proxy error', message: String(error) }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

async function handleImage(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname
  
  // 图片代理到 pixiv
  const targetUrl = `https://i.pximg.net${path}${url.search}`
  
  const headers = new Headers(request.headers)
  headers.set('Referer', 'https://pixiv.net/')
  headers.delete('Host')
  
  try {
    return await fetch(targetUrl, {
      method: 'GET',
      headers,
    })
  } catch (error) {
    return new Response('Image not found', { status: 404 })
  }
}

async function handleRandom(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const params = new URLSearchParams(url.search)
  
  // 转发到 /ajax/illust/discovery
  const targetUrl = `https://pixiv.net/ajax/illust/discovery?${params.toString()}`
  
  const headers = new Headers(request.headers)
  headers.set('Referer', 'https://pixiv.net/')
  headers.delete('Host')
  
  try {
    const response = await fetch(targetUrl, { headers })
    const newResponse = new Response(response.body, response)
    newResponse.headers.set('Access-Control-Allow-Origin', '*')
    return newResponse
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Random fetch failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

async function handleUser(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const token = url.searchParams.get('token') || 
                request.headers.get('Authorization')?.replace('Bearer ', '') ||
                request.headers.get('Cookie')?.split('PHPSESSID=')[1]?.split(';')[0]
  
  if (!token) {
    return new Response(JSON.stringify({ error: 'No token provided' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  
  // 获取用户信息
  const targetUrl = 'https://pixiv.net/'
  const headers = new Headers()
  headers.set('Cookie', `PHPSESSID=${token}`)
  headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
  
  try {
    const response = await fetch(targetUrl, { headers })
    const html = await response.text()
    
    // 提取 global-data
    const match = html.match(/<meta name="global-data" content="([^"]+)"/)
    if (match) {
      const decoded = JSON.parse(decodeURIComponent(match[1]))
      return new Response(JSON.stringify(decoded.user), {
        headers: { 'Content-Type': 'application/json' },
      })
    }
    
    return new Response(JSON.stringify({ error: 'Could not extract user data' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

async function handleAssets(request: Request, env: Env): Promise<Response> {
  // 尝试从 Workers Site 获取资源
  const response = await env.ASSETS.fetch(request)
  
  // 如果是 404，返回 index.html（SPA fallback）
  if (response.status === 404) {
    return env.ASSETS.fetch(new Request(new URL('/index.html', request.url)))
  }
  
  return response
}

// OPTIONS 请求处理
router.options('*', () => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
})

export default {
  fetch: router.handle,
}
