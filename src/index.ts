import { http } from './extend';
import './style/index.scss';

((doc) => {

  interface ICommonObject {
    [key: string]: any
  }

  interface IUploadFile {
    data: any
    onprogress?: (e: ProgressEvent<EventTarget>) => any
    total?: number
    idx: number
    oCell?: HTMLElement
  }

  type TUploadFile = {
    file: File
    idx: number
    oOldCell?: HTMLElement
    oldHash?: string
  }

  const $ = doc.querySelector.bind(doc)

  const oDoms = {
    file: $('.file-input'),
    fileImg: $('.file-img'),
    fileProgressWrap: $('.file-progress-wrap'),
  }

  const datas = {
    files: <File[]>[],
    hashs: <string[]>[],
    btns: [
      { text: '继 续', hidden: true, },
      { text: '暂 停', hidden: true, },
      { text: '取 消', hidden: true, },
    ],
    xhrObj: <{ [key: string]: XMLHttpRequest[] }> {}
  }

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
    const files = (<HTMLInputElement>e?.target)?.files!
    const baseIdx = datas.files.length

    Object.entries(files).forEach(([idx, file]) => {
      if (!file) {
        return
      }

      // appendBlobImage(file)
      // appendBase64Image(file)
      const index = Number(idx) + baseIdx

      datas.files.push(file)

      const params = {
        file,
        idx: index,
      }

      file.size < CHUNK_SIZE
        ? commonUploadFile(params)
        : sliceUploadFile(params)
    })
  }

  function onProgressClick(e: Event) {
    const { target, currentTarget } = e
    const { dataset } = target as HTMLElement
    const { field } = dataset
    console.log('🚀 ~ dataset', datas)

    if (target === currentTarget) {
      return
    }

    // 按钮下标
    const fieldIdx = Number(field)
    // cell下标
    const cellIdx = Number(findTargetIndex(target as HTMLElement)!)
    // oCell
    const oCell = (<HTMLElement> currentTarget).querySelectorAll(`.${ CLASS_NAME }`)?.[cellIdx] as HTMLElement
    const { xhrObj, hashs, files } = datas
    const xhr = xhrObj?.[cellIdx]
    // console.log('🚀 ~ cellIdx', cellIdx, oCell)

    switch (fieldIdx) {
      case 0: // 继续
        const params = {
          file: files?.[cellIdx],
          idx: cellIdx,
          oOldCell: oCell,
          hash: hashs?.[cellIdx],
        }
        handleBtnState(oCell, [0, 1], [true, false])
        sliceUploadFile(params)
        break

      case 1: // 暂停
        handleBtnState(oCell, [0, 1], [false, true])
        xhr?.forEach(xhr => xhr?.abort())
        xhr && (xhr.length = 0)
        break

      case 2: // cancel 取消
        handleBtnState(oCell, [0, 1, 2], [false, false, true])
        xhr?.forEach(xhr => xhr?.abort())
        xhr && (xhr.length = 0)
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

  async function getFileHash(file: Blob[], oCell: HTMLElement) {
    return new Promise((resolve, reject) => {
      const worker = new Worker('/getFileHash.ts')

      worker.postMessage(file)
      worker.onmessage = (e) => getWorkerOnMessage(e, resolve, oCell)
    })
  }

  function getWorkerOnMessage(e: MessageEvent<any>, resolve: (value: unknown) => void, oCell: HTMLElement) {
    const { hash, percent } = e.data

    updateProgressBar(oCell, percent, '读取中')

    hash && resolve(hash)
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

  async function commonUploadFile(params: TUploadFile) {
    const { file, idx, oOldCell } = params
    const { name, size } = file
    const bf = new File([file], name)
    const fd = new FormData()

    const oCell = oOldCell || initProgressBar(oDoms.fileProgressWrap!, file, idx!)!
    const sliceChunks = getSliceChunks(file, size, CHUNK_SIZE)
    const hash = (await getFileHash(sliceChunks, oCell)) as string

    const { classList } = oCell.querySelector(`.${ CLASS_NAME }_bar_inner`)!

    classList?.remove('transition')
    updateProgressBar(oCell, 0)
    classList?.add('transition')

    const fdData = {
      file: bf,
      size: String(size),
      hash,
    }

    appendFormData(fd, fdData)

    handleBtnState(oCell, [0, 1, 2], [true, false, false])

    const [err, ret] = await uploadFile({
      data: fd,
      onprogress: (e) => onProgress(e, oCell),
      idx: idx!,
    })

    if (err) {
      return
    }

    const { code, data } = ret

    if (code === 0) {
      oCell && uploadFileFinish(oCell, data.url)
    }
  }

  function appendFormData(formData: FormData, obj: ICommonObject) {
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

  async function sliceUploadFile(params: TUploadFile) {
    const { file, idx, oOldCell, oldHash = '' } = params
    const { size } = file
    const total = String(Math.ceil(size / CHUNK_SIZE))

    const oCell = oOldCell || initProgressBar(oDoms.fileProgressWrap!, file, idx!)

    let hash = oldHash

    if (!hash) {
      const sliceChunks = getSliceChunks(file, size, CHUNK_SIZE)
      hash = (await getFileHash(sliceChunks, oCell)) as string

      datas.hashs.push(hash)

      const { classList } = oCell.querySelector(`.${ CLASS_NAME }_bar_inner`)!

      classList?.remove('transition')
      updateProgressBar(oCell, 0)
      classList?.add('transition')
    }
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

    if (is_exist) {
      uploadFileFinish(oCell, url)
      return
    }

    handleBtnState(oCell, [0, 1, 2], [true, false, false])

    const totalChunks = getSliceBlobChunks({ file, size, total, hash })

    const fdChunks = totalChunks.filter((ch, idx) => !chunks.includes(String(idx)))

    if (fdChunks.length) {
      const ret = await multipleUploadFile(fdChunks, idx!, oCell)

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

      uploadFileFinish(oCell, url)
    }
  }

  function multipleUploadFile(arr: FormData[], idx: number, oCell: HTMLElement) {
    return Promise.all(arr.map((data) => uploadFile({
      data,
      total: arr.length,
      idx,
      oCell
    })))
      .then(arr => {
        return arr.every(([err, ret]) => !err && ret.code === 0)
      })
  }

  function checkFileState(data: ICommonObject) {
    return http({
      url: 'http://localhost:3001/api/check_file_state',
      headers: {
        'Content-Type': 'application/json',
      },
      data: JSON.stringify(data),
    })
  }

  function uploadFile(params: IUploadFile) {
    const { data, onprogress, total = 0, idx, oCell } = params
    const { xhrObj } = datas

    const xhrArr = xhrObj[idx]
      ? xhrObj[idx]
      : xhrObj[idx] = []

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

  function merge(data: ICommonObject): Promise<any> {
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

  function createProgressBars(file: File, idx: number, percent: number) {
    const oFrag = new DocumentFragment()
    const oCell = doc.createElement('div')
    const oBar = doc.createElement('div')
    const oInnerBar = doc.createElement('div')
    const oName = doc.createElement('div')
    const oPercent = doc.createElement('span')
    const oText = doc.createElement('span')
    const oBtnWrap = doc.createElement('div')

    const { name } = file

    oCell.setAttribute('data-index', String(idx))
    oCell.className = CLASS_NAME
    oBar.className = `${ CLASS_NAME }_bar`
    oInnerBar.className = `${ oBar.className }_inner transition`
    oName.className = `${ CLASS_NAME }_name`
    oName.textContent = name
    oText.className = `${ CLASS_NAME }_text`
    oText.textContent = `读取中`
    oPercent.className = `${ CLASS_NAME }_percent`
    oPercent.textContent = `${ percent }%`
    oBtnWrap.className = `${ CLASS_NAME }_btn-wrap`

    oBar.append(oInnerBar)

    datas.btns.forEach(({ text, hidden }, idx) => {
      const oBtn = doc.createElement('button')

      oBtn.textContent = text
      oBtn.hidden = hidden
      oBtn.className = 'btn'
      oBtn.setAttribute('data-field', String(idx))
      oBtnWrap.append(oBtn)
    })

    ;[oName, oText, oBar, oPercent, oBtnWrap].forEach(oItem => oCell.append(oItem))
    oFrag.append(oCell)

    return { oFrag, oCell }
  }

  function updateProgressBar(oCell: HTMLElement, num: number, text = '上传中') {
    const oText = oCell.querySelector(`.${ CLASS_NAME }_text`)!
    const oPercent = oCell.querySelector(`.${ CLASS_NAME }_percent`)!
    const oBar: HTMLElement = oCell.querySelector(`.${ CLASS_NAME }_bar_inner`)!
    const num1 = (num * 100).toFixed(2)
    const percent = `${ num1 }%`

    oText.textContent = text
    oPercent.textContent = percent
    oBar.style.width = percent
  }

  function createFileUrl(oCell: HTMLElement, url: string) {
    const oLink = doc.createElement('a')
    const oUrl = doc.createElement('div')
    const oName = oCell.querySelector(`.${ CLASS_NAME }_name`)!
    const oText = oCell.querySelector(`.${ CLASS_NAME }_text`)!

    oLink.href = `//${ url }`
    oLink.textContent = 'OPEN'
    oLink.className = `${ CLASS_NAME }_link`
    oLink.target = '_blank'
    oLink.referrerPolicy = 'no-referrer'
    oUrl.textContent = url
    oUrl.className = `${ CLASS_NAME }_url`

    oName.append(oLink)
    oCell.insertBefore(oUrl, oText)

    return oLink
  }

  function uploadFileFinish(oCell: HTMLElement, url: string) {
    const hiddenArr = datas.btns.map((_, i) => true)

    updateProgressBar(oCell, 1, '上传完成')
    handleBtnState(oCell, hiddenArr.map((_, i) => i), hiddenArr)
    createFileUrl(oCell, url)
  }

  function handleBtnState(oCell: HTMLElement, idxArr: number[], hiddenArr: boolean[] = []) {
    const oBtns = oCell.querySelectorAll(`.btn`)! as unknown as HTMLElement[]

    idxArr.forEach(idx => oBtns[idx].hidden = hiddenArr[idx])
  }

  function initProgressBar(dom: Element, file: File, idx: number, percent = 0) {
    const {oFrag, oCell} = createProgressBars(file, idx, percent)

    dom.appendChild(oFrag)

    return oCell
  }

  init()

})(document);
