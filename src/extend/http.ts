interface HttpConfig {
  url: string
  headers?: {
    [key: string]: string
  }
  method?: string
  data: any
  xhrArr?: XMLHttpRequest[],
  onprogress?: (e: ProgressEvent<EventTarget>) => any
}

export async function http2(params: HttpConfig) {
  const { url, headers = {}, data, method = 'POST' } = params

  try {
    const ret = await fetch(url, {
      headers,
      method,
      body: data,
    }).then(json => json.json())

    return [null, ret]

  } catch (error) {
    return [true, error]
  }
}

export async function http(params: HttpConfig): Promise<any> {
  return new Promise((resolve, reject) => {
    try {
      const { url, headers = {}, data, xhrArr = [], method = 'POST', onprogress } = params
      const xhr = new XMLHttpRequest()

      onprogress && (xhr.upload.onprogress = onprogress.bind(window))

      xhr.open(method, url)
      Object.keys(headers).forEach(k => xhr.setRequestHeader(k, headers[k]))
      xhr.send(data)

      xhr.onload = (e) => {
        const { response } = e.target as any

        const idx = xhrArr?.findIndex(o => o === xhr)

        xhrArr?.splice(idx, 1)

        resolve([false, JSON.parse(response)])
      }

      xhrArr?.push(xhr)

    } catch (error) {
      reject([true, error])
    }
  })
}
