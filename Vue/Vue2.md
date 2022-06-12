# 2. 变化侦测
## 2.1 Object变化侦测
- Object.defineProperty
- Proxy

## 2.2 依赖

### 2.2.1 依赖是谁
> 在通知用到数据的地方时，这些用到数据的地方很杂(template/watch...)，因此需要一个集中处理复杂情况的类即watcher

### 2.2.2 依赖收集

#### 收集谁?
> 收集watcher 

#### 怎么收集?
> getter中收集依赖存到Dep中，setter中触发依赖

#### watcher类
> 数据变化时通知watcher，watcher再通知其它地方

原理
- 将watcher实例设置到window.target
- 再访问某一个属性，从而将自己主动添加到该属性的依赖列表中

```js
// vm.$watch(obj/func, function(newVal, oldVal) {})
class Watcher {
    constructor(target, expOrFn, cb) {
        this.target = target
        this.cb = cb
        // 得到一个函数
        this.getter = parsePath(expOrFn)
        this.value = this.get()
    }
    get() {
        // 将自己主动添加到target.a.b.c的Dep中
        window.target = this
        let value = this.getter.call(this.target, this.target)
        window.target = undefined
        return value
    }
    update() {
        const oldValue = this.value
        this.value = this.get()
        this.cb.call(this.target, this.value, oldValue)
    }
}

function parsePath(path) {
    const reg = /[^\w.$]/
    if (reg.test(path)) {
        return
    }
    const segments = path.split('.')
    return function(obj) {
        for (let i = 0; i < segments.length; i++) {
            obj = obj[segments[i]]
        }
        return obj
    }
}
```

# 3. Array变化侦测

## 3.1 如何追踪变化
> Object的变化是靠setter追踪，数组则需要通过拦截器覆盖Array.prototype从而获得变化追踪的能力

缺点:
- 只能拦截原型上的方法
- 无法拦截数组特有语法，如length = 0的操作就无法拦截

## 3.2 依赖收集
> Array在getter中收集依赖存放到Observer实例上，拦截器中触发依赖

### 3.2.1 依赖存放在哪里?
- 将依赖存在Observer实例上，getter、拦截器都可以直接访问到

### 3.2.2 __ob__属性
作用:
- 值是当前Observer实例
- 表示该数据是响应式的
- 对象可以通过`value.__ob__`获取到Observer实例，若是数组拦截器可以通过`this.__ob__`获取

## 3.3 侦测数组元素的变化

### 3.3.1 如何实现侦测所有数据子集的变化?

- 对数组每个子项添加侦测

### 3.3.2 ***侦测新增元素的变化
原理:
- 找出能够新增元素的数组方法(push, unshift, splice)
- 通过参数列表收集新增的元素
- 给新增的元素添加响应式

## 3.4 数据侦测完整实现

```js
// 数组拦截器
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
        // 为新增元素添加响应式
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
```


# 4. 变化侦测相关API

## 4.1 $watch

### 4.1.1 基本使用
- `let unwatch = vm.$watch(object | func, function(newVal, oldVal), options?): func`
- options包含了deep、immediate

### 4.1.2 内部原理及实现

```js
// 新增
let uId = 0

// 管理依赖，收集的依赖均为watcher
class Dep {
    constuctor() {
        this.id = uId++
        this.subs = []
    }
    depend() {
        // 记录数据变化时，需要通知哪些watcher
        if (window.target) {
            window.target.addDep(this)
        }
    }
    removeSub(sub) {
        const index = this.subs.indexOf(sub)
        if (index > -1) {
            return this.subs.splice(index, 1)
        }
    }
}

let seenObjects = new Set()
function traverse(val) {
    _traverse(val, seenObjects)
    seenObject.clear()
}

function _traverse(val, seen) {
    const isA = Array.isArray(val)
    if ((!isA && typeof isA !== 'object') || Object.isFrozen(val)) {
        return
    }
    if (val.__ob__) {
        // 防止依赖重复
        const id = val.__ob__.dep.id
        if (seen.has(id)) {
            return
        }
        seen.add(id)
    }
    if (isA) {
        // 循环数组子项递归
        i = val.length
        while(i--) {
            _traverse(val[i], seen)
        }
    } else {
        // 循环对象所有属性，执行读取操作触发依赖收集逻辑，再递归子值
        keys = Object.key(val)
        i = keys.length
        while(i--) {
            // val[keys[i]]触发getter
            _traverse(val[keys[i]], seen)
        }
    }
}

class Watcher {
    constructor(vm, expOrFn, cb, options) {
        this.vm = vm
        this.deps = []
        this.depIds = new Set()
        if (options) {
            this.deep = !!options.deep
        } else {
            this.deep = false
        }
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
        /*
            Watcher读取数据时会触发收集依赖的逻辑，若不加以判断
            每次依赖更新Watcher都会去读取最新的数据，并触发收集依赖的逻辑，造成dep依赖重复
            因此，若已经订阅过某个dep，则不需要重复订阅，防止依赖重复，修正后仅第一次getter会触发依赖收集
        */
        if (!this.depIds.has(id)) {
            this.depIds.add(id)
            this.deps.push(dep)
            dep.addSub(this)
        }
    }
    get() {
        window.target = this
        let value = this.getter.call(this.vm, this.vm)
        // 一定要在window.target被清空前收集依赖
        if (this.deep) {
            traverse(value)
        } 
        window.target = undefined
        return value
    }
    update() {
        let oldValue = this.value
        this.value = this.get()
        this.cb.call(this.vm, this.value, oldValue)
    }
    teardown() {
        // 将自己从所有依赖项的Dep列表中移除
        for (let i = 0; i < this.deps.length; i++) {
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
Vue.prototype.$watch = function(expOrFn, cb, options) {
    const vm = this
    options = options || {}
    const watcher = new Watcher(vm, expOrFn, cb, options)
    if (options.immediate) {
        this.cb.call(vm, watcher.value)
    }
    return function unwatchFn() {
        // 将watcher实例从正被观察的状态的依赖中移除
        watcher.teardown()
    }
}
```