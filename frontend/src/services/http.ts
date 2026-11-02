// The app's HTTP client: the slice of axios's API the services use (get, post,
// patch, delete; params; JSON or FormData bodies; request and response
// interceptors; defaults.headers.common; errors carrying response.status and
// response.data), on React Native's fetch, which runs on the same XHR
// networking axios did. axios was ~67 KB of the JS bundle for this.

export type RequestConfig = {
  /** Query string values; undefined and null are left out. */
  params?: Record<string, unknown>
  headers?: Record<string, string>
  /** Send this session token instead of the current one (see api.ts). */
  sessionToken?: string
}

export type ResolvedRequest = RequestConfig & {
  method: 'get' | 'post' | 'patch' | 'delete'
  url: string
  data?: unknown
  headers: Record<string, string>
}

export type HttpResponse<T = any> = {
  data: T
  status: number
  headers: Headers
  config: ResolvedRequest
}

/** A non-2xx answer (`response` set) or no answer at all (`response` undefined). */
export class HttpError extends Error {
  readonly response?: { status: number; data: any; headers: Headers }
  readonly config: ResolvedRequest

  constructor(message: string, config: ResolvedRequest, response?: HttpResponse) {
    super(message)
    this.name = 'HttpError'
    this.config = config
    this.response = response ? { status: response.status, data: response.data, headers: response.headers } : undefined
  }
}

type RequestInterceptor = (config: ResolvedRequest) => ResolvedRequest | Promise<ResolvedRequest>
type Fulfilled = (response: HttpResponse) => HttpResponse | Promise<HttpResponse>
type Rejected = (error: any) => any

export function buildQuery(params: Record<string, unknown> | undefined): string {
  if (!params) return ''
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    search.append(key, String(value))
  }
  const query = search.toString()
  return query ? `?${query}` : ''
}

function isFormData(value: unknown): value is FormData {
  return typeof FormData !== 'undefined' && value instanceof FormData
}

export function createHttpClient({ baseURL, headers = {} }: { baseURL: string; headers?: Record<string, string> }) {
  const defaults = { headers: { common: {} as Record<string, string> } }
  const requestInterceptors: RequestInterceptor[] = []
  const responseInterceptors: { fulfilled?: Fulfilled; rejected?: Rejected }[] = []

  async function send(config: ResolvedRequest): Promise<HttpResponse> {
    const requestHeaders: Record<string, string> = { Accept: 'application/json, text/plain, */*', ...config.headers }
    let body: BodyInit | undefined
    if (isFormData(config.data)) {
      // fetch sets the multipart Content-Type with its boundary.
      body = config.data
    } else if (config.data !== undefined) {
      body = JSON.stringify(config.data)
      requestHeaders['Content-Type'] = 'application/json'
    }

    let res: Response
    try {
      res = await fetch(`${baseURL}${config.url}${buildQuery(config.params)}`, {
        method: config.method.toUpperCase(),
        headers: requestHeaders,
        body,
      })
    } catch {
      throw new HttpError('Network Error', config)
    }

    const text = await res.text()
    let data: any = text
    if (text && (res.headers.get('content-type') ?? '').includes('application/json')) {
      try {
        data = JSON.parse(text)
      } catch {
        // Left as text.
      }
    }
    const response: HttpResponse = { data, status: res.status, headers: res.headers, config }
    if (res.status < 200 || res.status >= 300) {
      throw new HttpError(`Request failed with status code ${res.status}`, config, response)
    }
    return response
  }

  async function request(method: ResolvedRequest['method'], url: string, data: unknown, config: RequestConfig = {}) {
    let resolved: ResolvedRequest = {
      ...config,
      method,
      url,
      data,
      headers: { ...headers, ...defaults.headers.common, ...config.headers },
    }
    // Like axios: the interceptor added last runs first.
    for (const intercept of [...requestInterceptors].reverse()) resolved = await intercept(resolved)
    let promise: Promise<HttpResponse> = send(resolved)
    for (const { fulfilled, rejected } of responseInterceptors) promise = promise.then(fulfilled, rejected)
    return promise
  }

  return {
    defaults,
    interceptors: {
      request: { use: (intercept: RequestInterceptor) => void requestInterceptors.push(intercept) },
      response: { use: (fulfilled?: Fulfilled, rejected?: Rejected) => void responseInterceptors.push({ fulfilled, rejected }) },
    },
    get: <T = any>(url: string, config?: RequestConfig) => request('get', url, undefined, config) as Promise<HttpResponse<T>>,
    delete: <T = any>(url: string, config?: RequestConfig) => request('delete', url, undefined, config) as Promise<HttpResponse<T>>,
    post: <T = any>(url: string, data?: unknown, config?: RequestConfig) => request('post', url, data, config) as Promise<HttpResponse<T>>,
    patch: <T = any>(url: string, data?: unknown, config?: RequestConfig) => request('patch', url, data, config) as Promise<HttpResponse<T>>,
  }
}

export type HttpClient = ReturnType<typeof createHttpClient>
