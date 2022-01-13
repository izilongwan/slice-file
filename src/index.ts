import { http } from './extend';

;((doc) => {
  const $ = doc.querySelector.bind(doc)

  const oDoms = {
    file: $('.file-input'),
    fileImg: $('.file-img'),
  }

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
    sliceFile(file)
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

  function sliceFile(file: File, chunkSize = 1024) {
    const { size, name } = file
    const ret = []
    const totalIndex = Math.ceil(size / chunkSize)
    let start = 0
    let end = chunkSize > size ? size : chunkSize
    let count = 0
    const hash = String(Date.now())

    while (start < size) {
      const blob = file.slice(start, end, 'image')
      const bf = new File([blob], name)
      const fd = new FormData()

      fd.append('file', bf, bf.name)
      fd.append('index', String(count++))
      fd.append('total', String(totalIndex))
      fd.append('hash', hash)

      ret.push(fd)
      start += chunkSize
      end = start + chunkSize
      end = end > size ? size : end
    }

    console.log(ret);
    const [, ext] = file.type.split('/')
    const data = {
      filename: hash,
      size: chunkSize,
      ext,
    }

    upload(ret, data)
  }

  function upload(arr: FormData[], params: any) {
    return Promise.all(arr.map(data => http({
      url: 'http://localhost:3001/api/upload',
      data,
    })))
      .then((ret: any[]) => {
        console.log(ret);

        merge(JSON.stringify(params))
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
