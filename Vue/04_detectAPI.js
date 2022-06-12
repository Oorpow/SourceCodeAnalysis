/**
 * 获取深层次对象的属性值
 * @param {*} expOrFn 仅接受以.为分割的访问路径
 * @returns 包含属性值的函数
 */
function parsePath(expOrFn) {
    let regex = /[^\w.$]/
    if (regex.test(expOrFn)) {
        return
    }
    const segements = expOrFn.split('.')
    return function(obj) {
        for (let i = 0; i < segements.length; i++) {
            obj = obj[segements[i]]
        }
        return obj
    }    
}

let uid = 0
class Dep {
    constructor() {
        this.id = uid++
        this.subs = []
    }
    // 依赖收集(收集的都是watcher)
    depend() {
        if (window.target) {
            window.target.addDep(this)
        }
    }
    // 依赖移除
    removeSub(sub) {
        const index = this.subs.indexOf(sub)
        if (index > -1) {
            return this.subs.splice(index, 1)
        }
    }
}

const seenObjects = new Set()
function traverse(val) {
    _traverse(val, seenObjects)
    seenObjects.clear()
}

function _traverse(val, seen) {
    const isA = Array.isArray(val)
    if ((!isA && typeof isA !== 'object') || Object.isFrozen(val)) {
        return
    }
    if (val.__ob__) {
        const depId = val.__ob__.dep.id
        if (seen.has(depId)) {
            return
        }
        seen.add(depId)
    }
    if (isA) {
        i = val.length
        while (i--) {
            _traverse(val[i], seen)
        }
    } else {
        keys = Object.keys(val)
        i = keys.length
        while (i--) {
            // val[keys[i]]会触发getter收集依赖
            _traverse(val[keys[i]], seen)
        }
    }
}


class Watcher {
    constructor(vm, expOrFn, cb, options) {
        this.vm = vm
        this.deps = []
        this.depIds = new Set()
        // 默认关闭deep选项
        if (options) {
            this.deep = !!options.deep
        } else {
            this.deep = false
        }
        // expOrFn可能是个函数
        if (typeof expOrFn === 'function') {
            this.getter = expOrFn
        } else {
            this.getter = parsePath(expOrFn)
        }
        this.cb = cb
        this.value = this.get()
    }
    addDep(dep) {
        const id = dep.id
        if (!this.depIds.has(id)) {
            this.depIds.add(id)
            this.deps.push(dep)
            dep.addSub(this)
        }
    }
    get() {
        window.target = this
        let value = this.getter(this.vm, this.vm)
        // 开启了深度监听
        if (this.deep) {
            traverse(value)
        }
        window.target = undefined
        return value
    }
    update() {
        // 获取新值与旧值
        let oldValue = this.value
        this.value = this.get()
        this.cb.call(this.vm, this.value, oldValue)
    }
    // 将自己从所有依赖项的依赖列表中移除
    teardown() {
        for (let i = 0, len = this.deps.length; i < len; i++) {
            this.deps[i].removeSub(this)
        }
    }
}


/**
 * 
 * @param {*} expOrFn 观察的数据，string | func
 * @param {*} cb function(newVal, oldVal)
 * @param {*} options 配置项(deep / immediate)
 * @returns 取消观察数据的函数
 */
Vue.prototype.$watch = function (expOrFn, cb, options) {
    const vm = this
    options = options || {}
    let watcher = new Watcher(vm, expOrFn, cb, options)
    // 立即执行
    if (options.immediate) {
        cb.call(vm, watcher.value)
    }
    return function unwatchFn() {
        watcher.teardown()
    }
}