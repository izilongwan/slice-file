;(<any>self).importScripts('/spark.min.js')

interface SliceProps {
  file: Blob[]
  spark: any
  numConfig: {
    count: number
    percent: number
    size: number
  }
}

function onMessage(e: any) {
  const file = e.data
  const size = file.length

  const spark = new (<any>self).SparkMD5.ArrayBuffer()

  loadSlice({
    spark,
    file,
    numConfig: {
      count: 0,
      percent: 0,
      size,
    }
  })
}

function loadSlice(params: SliceProps) {
  const { file, numConfig, spark } = params
  const { count, size } = numConfig
  const fr = new FileReader()

  fr.readAsArrayBuffer(file[count])
  fr.onload = (e: any) => {
    spark.append(e.target.result)

    numConfig.percent += (1 / size)

    if (count >= size - 1) {
      self.postMessage({
        percent: 1,
        hash: spark.end(),
      })
      self.close()
      return
    }

    numConfig.count++
    self.postMessage({
      percent: numConfig.percent,
      hash: '',
    })
    loadSlice(params)
  }
}

self.onmessage = onMessage;
