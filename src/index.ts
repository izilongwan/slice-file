import { http } from './extend';

;((doc) => {

  interface CommonObject {
    [key: string]: any
  }

  const $ = doc.querySelector.bind(doc)

  const oDoms = {
    file: $('.file-input'),
    fileImg: $('.file-img'),
  }

  const CHUNK_SIZE = 1024 * 10

  const init = () => {
    bindEvent()
  }

  function bindEvent() {
    oDoms.file?.addEventListener('change', onFileChange)
    oDoms.fileImg?.addEventListener('load', onImageLoad)
  }

  function onImageLoad(e: Event) {
    URL.revokeObjectURL((<HTMLImageElement>e.target).src)
  }

  function onFileChange(e: Event) {
    const files = (<HTMLInputElement>e?.target)?.files
    const file = files?.[0]

    if (!file) {
      return
    }

    appendBlobImage(file)
    // appendBase64Image(file)
    file.size < CHUNK_SIZE
      ? commonUploadFile(file)
      : sliceUploadFile(file)
  }

  // blob
  function appendBlobImage(file: File) {
    const url = URL.createObjectURL(file)

    ;(<HTMLImageElement>oDoms.fileImg).src = url
  }

  // base64
  function appendBase64Image(file: File) {
    const fr = new FileReader()

    fr.readAsDataURL(file)
    fr.onload = (e) => {
      const url = <string>e.target?.result

      ;(<HTMLImageElement>oDoms.fileImg).src = url
    }
  }

  async function getFileHash(file: Blob[]) {
    return new Promise((resolve, reject) => {
      const worker = new Worker('/getFileHash.ts')

      worker.postMessage(file)
      worker.onmessage = (e) => {
        const { hash, percent } = e.data
        hash && resolve(hash)
      }
    })
  }

  function getSliceChunks(file: File, size:number, chunkSize: number) {
    let start = 0
    let end = chunkSize > size ? size : chunkSize

    const chunks = []

    while (start < end) {
      const blob = file.slice(start, end)

      start += chunkSize
      end = start + chunkSize
      end = end > size ? size : end
      chunks.push(blob)
    }

    return chunks
  }

  async function commonUploadFile(file: File) {
    const {name, size} = file
    const bf = new File([file], name)
    const fd = new FormData()

    const sliceChunks = getSliceChunks(file, size, CHUNK_SIZE)
    const hash = (await getFileHash(sliceChunks)) as string

    const fdData = {
      file: bf,
      size: String(size),
      hash,
    }

    appendFormData(fd, fdData)

    uploadFile(fd)
  }

  function appendFormData(formData: FormData, obj: CommonObject) {
    Object.keys(obj).forEach(key => {
      formData.append(key, obj[key])
    })
  }

  async function sliceUploadFile(file: File) {
    const { size, name } = file
    const ret = []
    const total = String(Math.ceil(size / CHUNK_SIZE))
    let start = 0
    let end = CHUNK_SIZE > size ? size : CHUNK_SIZE
    let count = 0

    const sliceChunks = getSliceChunks(file, size, CHUNK_SIZE)
    const hash = (await getFileHash(sliceChunks)) as string
    // console.log('🚀 ~ hash', hash)

    while (start < size) {
      const blob = file.slice(start, end)
      const bf = new File([blob], name)
      const fd = new FormData()

      const fdData = {
        file: bf,
        index: String(count++),
        total,
        hash,
        size,
      }

      appendFormData(fd, fdData)

      ret.push(fd)
      sliceChunks.push(blob)
      start += CHUNK_SIZE
      end = start + CHUNK_SIZE
      end = end > size ? size : end
    }

    const [, ext] = file.type.split('/')
    const data = {
      hash,
      chunk_size: CHUNK_SIZE,
      size,
      ext,
      total,
    }

    await multipleUploadFile(ret)
    await merge(JSON.stringify(data))
  }

  function multipleUploadFile(arr: FormData[]) {
    return Promise.all(arr.map(data => uploadFile(data)))
  }

  function uploadFile(data: any) {
    return http({
      url: 'http://localhost:3001/api/upload',
      data,
    })
      .then((ret: any) => {
        console.log(ret);
      })
  }

  function merge(data: any) {
    return http({
      url: 'http://localhost:3001/api/merge',
      headers: {
        'Content-Type': 'application/json',
      },
      data: data,
    }).then(ret => console.log(ret)
    )
  }

  init()

})(document);

export default {

}
