const fakePrototype = Array.prototype
const arrMethods = ['push', 'pop', 'unshift', 'shift', 'splice', 'sort', 'reverse']
arrMethods.forEach(method => {
    const originMethods = fakePrototype[method]
    def(arrMethods, method, function mutator(...args) {
        let inserted    // 新增的元素
        const ob = this.__ob__
        const result = originMethods.apply(this, args)
        switch (method) {
            case 'push':
            case 'unshift':
                inserted = args
                break;
            case 'splice':
                inserted = args.slice(2)
            default:
                break;
        }
        if (inserted) {
            observe(inserted)
        }
        // 触发依赖更新
        ob.dep.notify()
        return result
    })
})

/**
 * 尝试创建Observer实例并返回
 * @param {*} value 需要添加侦测的数据
 */
function observe(value) {
    if (typeof value !== 'object') {
        return
    }
    let ob
    if (typeof value['__ob__'] !== 'undefined') {
        ob = value['__ob__']
    } else {
        ob = new Observer(value)
    }
    return ob
}

/**
 * 侦测数据
 * @param {*} data 目标对象
 * @param {*} key 添加侦测的属性
 * @param {*} value 
 */
function defineReactive(data, key, value) {
    // 递归子属性
    let childOb = observe(value)
    let dep = new Dep()
    Object.defineProperty(data, key, {
        get() {
            // 对象在getter中收集依赖
            dep.depend()
            if (childOb) {
                childOb.dep.depend()
            }
            return value
        },
        set(newValue) {
            if (value === newValue) {
                return
            }
            value = newValue
            // 对象在setter中触发依赖
            dep.notify()
        }
    })
}

/**
 * 工具函数，主要用于添加__ob__，值为Observer实例
 * @param {*} data 
 * @param {*} key 
 * @param {*} value 
 * @param {*} enumerable 
 */
function def(data, key, value, enumerable = false) {
    Object.defineProperty(data, key, {
        enumerable: !!enumerable,
        configurable: true,
        writable: true,
        value
    })
}

/**
 * Dep类 管理依赖
 */
class Dep {
    constructor() {
        this.subList = []
    }
    depend() {
        if (window.target) {
            this.addObserver(window.target)
        }
    }
    addObserver(observer) {
        this.subList.push(observer)
    }
    removeObserver(observer) {
        this.remove(this.subList, observer)
    }
    notify() {
        this.subList.forEach(sub => {
            sub.update()
        })
    }
    remove(arr, observer) {
        if (this.subList.length) {
            const index = this.subList.indexOf(observer)
            if (index > -1) {
                return this.subList.splice(index, 1)
            }
        }
    }
}

/**
 * 将数据转为响应式数据(getter/setter)
 */
class Observer {
    constructor(value) {
        this.value = value
        this.dep = new Dep()    // 数组侦测在Observer实例上存储依赖，拦截器中触发依赖
        def(value, '__ob__', this)
        if (!Array.isArray(value)) {
            this.walk(value)
            this.observeArr(value)
        } else {
            Object.setPrototypeOf(value, fakePrototype)
            this.observeArr(value)
        }
    }

    observeArr(value) {
        value.forEach(item => {
            observe(item)
        })
    }

    // 遍历对象属性添加响应式
    walk(value) {
        const keys = Object.keys(value)
        for (let i = 0; i < keys.length; i++) {
            defineReactive(value, keys[i], value[keys[i]])
        }
    }
}