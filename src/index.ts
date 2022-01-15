import { http } from './extend';
import './style/index.scss';

((doc) => {

  interface CommonObject {
    [key: string]: any
  }

  const $ = doc.querySelector.bind(doc)

  const oDoms = {
    file: $('.file-input'),
    fileImg: $('.file-img'),
    fileProgressWrap: $('.file-progress-wrap'),
  }

  const xhrArrs: XMLHttpRequest[][] = []
  let progressIdx = -1

  const CLASS_NAME = 'file-progress-wrap_cell'
  const CHUNK_SIZE = 1024 * 10


  const init = () => {
    bindEvent()
  }

  function bindEvent() {
    oDoms.file?.addEventListener('change', onFileChange)
    oDoms.fileImg?.addEventListener('load', onImageLoad)
    oDoms.fileProgressWrap?.addEventListener('click', onProgressClick)
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

  function onProgressClick(e: Event) {
    const { target, currentTarget } = e
    const { dataset } = target as HTMLElement
    const { field } = dataset
    console.log('🚀 ~ dataset', xhrArrs)

    if (target === currentTarget) {
      return
    }

    const index = Number(findTargetIndex(target as HTMLElement)!)

    switch (field) {
      case '0': //
        break

      case '1': //
        break

      case '2': //cancel
        xhrArrs[index]?.forEach(xhr => xhr.abort())
        xhrArrs[index].length = 0
        break

      default:
        break
    }
  }

  function findTargetIndex(target: HTMLElement) {
    let node = target

    while (node) {
      const { index } = node.dataset

      if (index) {
        return index
      }

      node = node.parentNode as HTMLElement
    }
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
    const { name, size } = file
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

    let oCell: HTMLElement | null = null

    const [err, ret] = await uploadFile(fd, (e) => {
      oCell = initProgressBar(oDoms.fileProgressWrap!, file)!
      onProgress(e, oCell)
    })

    if (err) {
      return
    }

    const { code, data } = ret

    if (code === 0) {
      oCell && createFileUrl(oCell, data.url)
    }
  }

  function appendFormData(formData: FormData, obj: CommonObject) {
    Object.keys(obj).forEach(key => {
      formData.append(key, obj[key])
    })
  }

  function getSliceBlobChunks ({ file, size, total, hash }: { file: File, size: number, total: string, hash: string }) {
    let start = 0
    let end = CHUNK_SIZE > size ? size : CHUNK_SIZE
    let count = 0
    const fdChunks = []

    while (start < size) {
      const blob = file.slice(start, end)
      const bf = new File([blob], file.name)
      const fd = new FormData()

      const fdData = {
        file: bf,
        index: String(count++),
        total,
        hash,
        size,
      }

      appendFormData(fd, fdData)

      fdChunks.push(fd)
      start += CHUNK_SIZE
      end = start + CHUNK_SIZE
      end = end > size ? size : end
    }

    return fdChunks
  }

  async function sliceUploadFile(file: File) {
    const { size } = file
    const total = String(Math.ceil(size / CHUNK_SIZE))

    const sliceChunks = getSliceChunks(file, size, CHUNK_SIZE)
    const hash = (await getFileHash(sliceChunks)) as string
    // console.log('🚀 ~ hash', hash)

    const [, ext] = file.type.split('/')
    const data = {
      hash,
      chunk_size: CHUNK_SIZE,
      size,
      ext,
      total,
    }

    const [err0, ret] = await checkFileState({ hash, ext })

    if (err0) {
      return
    }

    const { code, data: data0 } = ret

    if (code !== 0) {
      return
    }

    const { is_exist, url, chunks } = data0
    const oCell = initProgressBar(oDoms.fileProgressWrap!, file)

    if (is_exist) {
      updateProgressBar(oCell, 1)
      createFileUrl(oCell, url)
      return
    }

    const totalChunks = getSliceBlobChunks({ file, size, total, hash })

    const fdChunks = totalChunks.filter((ch, idx) => !chunks.includes(String(idx)))

    if (fdChunks.length) {
      const ret = await multipleUploadFile(fdChunks, oCell)

      if (!ret) {
        return
      }
    }

    const [err3, ret3] = await merge(data)

    if (err3) {
      return
    }

    if (ret3.code === 0) {
      const { data: { url } } = ret3

      updateProgressBar(oCell, 1)
      createFileUrl(oCell, url)
    }
  }

  function multipleUploadFile(arr: FormData[], oCell: HTMLElement) {
    return Promise.all(arr.map((data) => uploadFile(data, (e) => {}, arr.length, oCell)))
      .then(arr => {
        return arr.every(([err, ret]) => !err && ret.code === 0)
      })
  }

  function checkFileState(data: CommonObject) {
    return http({
      url: 'http://localhost:3001/api/check_file_state',
      headers: {
        'Content-Type': 'application/json',
      },
      data: JSON.stringify(data),
    })
  }

  function uploadFile(data: any, onprogress: (e: ProgressEvent<EventTarget>) => any, total = 0, oCell?: HTMLElement) {
    const xhrArr = xhrArrs[progressIdx]
      ? xhrArrs[progressIdx]
      : xhrArrs[progressIdx] = []

    return http({
      url: 'http://localhost:3001/api/upload',
      data,
      onprogress,
      xhrArr,
    })
    .then(ret => {
      // console.log('🚀 ~ ret', ret)

      if (oCell && total) {
        const dataNumAttr = 'data-number'
        const strNum = oCell.getAttribute(dataNumAttr) ?? '0'
        const num1 = parseFloat(strNum) || 0
        const num2 = num1 + 1 / total
        // console.log('🚀 ~', num1, num2, total)
        updateProgressBar(oCell, num2)
        oCell.setAttribute(dataNumAttr, String(num2 > 1 ? 1 : num2))
      }

      return ret
    })
  }

  function merge(data: CommonObject): Promise<any> {
    return http({
      url: 'http://localhost:3001/api/merge',
      headers: {
        'Content-Type': 'application/json',
      },
      data: JSON.stringify(data),
    }).then(ret => {
      console.log(ret)
      return ret
    })
  }

  function onProgress(e: ProgressEvent<EventTarget>, oCell: HTMLElement) {
    const { total, loaded } = e
    // console.log(loaded / total);

    updateProgressBar(oCell, loaded / total)
  }

  function createProgressBars(file: File, percent: number) {
    const oFrag = new DocumentFragment()
    const oCell = doc.createElement('div')
    const oBar = doc.createElement('div')
    const oInnerBar = doc.createElement('div')
    const oName = doc.createElement('div')
    const oPercent = doc.createElement('span')
    const oBtnWrap = doc.createElement('div')
    const oBtn = doc.createElement('button')

    const { name } = file

    oCell.setAttribute('data-index', String(++progressIdx))
    oCell.className = CLASS_NAME
    oBar.className = `${ CLASS_NAME }_bar`
    oInnerBar.className = `${ oBar.className }_inner`
    oName.className = `${ CLASS_NAME }_name`
    oName.textContent = name
    oPercent.className = `${ CLASS_NAME }_percent`
    oPercent.textContent = `${ percent }%`
    oBtnWrap.className = `${ CLASS_NAME }_btn-wrap`
    oBtn.textContent = '取消'
    oBtn.setAttribute('data-field', '2')

    oBar.append(oInnerBar)
    oBtnWrap.append(oBtn)
    ;[oName, oBar, oPercent, oBtnWrap].forEach(oItem => oCell.append(oItem))
    oFrag.append(oCell)

    return { oFrag, oCell }
  }

  function updateProgressBar(oCell: HTMLElement, num: number) {
    const oPercent = oCell.querySelector(`.${ CLASS_NAME }_percent`)!
    const oBar: HTMLElement = oCell.querySelector(`.${ CLASS_NAME }_bar_inner`)!
    const num1 = (num * 100).toFixed(2)
    const percent = `${ num1 }%`

    oPercent.textContent = percent
    oBar.style.width = percent
  }

  function createFileUrl(oCell: HTMLElement, url: string) {
    const oLink = doc.createElement('a')
    const oUrl = doc.createElement('div')
    const oName = oCell.querySelector(`.${ CLASS_NAME }_name`)!
    const oBar = oCell.querySelector(`.${ CLASS_NAME }_bar`)!

    oLink.href = `//${ url }`
    oLink.textContent = 'OPEN'
    oLink.className = `${ CLASS_NAME }_link`
    oLink.target = '_blank'
    oLink.referrerPolicy = 'no-referrer'
    oUrl.textContent = url
    oUrl.className = `${ CLASS_NAME }_url`

    oName.append(oLink)
    oCell.insertBefore(oUrl, oBar)

    return oLink
  }

  function initProgressBar(dom: Element, file: File, percent = 0) {
    const {oFrag, oCell} = createProgressBars(file, percent)

    dom.appendChild(oFrag)

    return oCell
  }

  init()

})(document);
