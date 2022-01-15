type IFnArr = Function[]

export function M(fnArr: IFnArr = []) {
  const init = () => {
    const iter = getGenerator(fnArr)

    doNext(iter)
  }

  function * getGenerator(fnArr: IFnArr) {
    for (const iterator of fnArr) {
      yield iterator
    }
  }

  function doNext(iter: Iterator<Function>) {
    const { value, done } = iter.next()

    if (!done) {
      value?.(() => doNext(iter))
    }
  }

  init()
}
