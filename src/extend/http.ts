interface HttpConfig {
  url: string
  headers?: {}
  method?: string
  data: any
}

export function http(params: HttpConfig) {
  const { url, headers = {}, data, method = 'POST' } = params

  return fetch(url, {
    headers,
    method,
    body: data,
  })
    .then(json => json.json())
    .catch(err => err)
}
