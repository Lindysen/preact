import { options } from 'preact';

/** @type {number} */
let currentIndex;// 用于记录当前函数组件正在使用的 hook 的顺序

// 用于记录当前渲染对应的组件。
/** @type {import('./internal').Component} */
let currentComponent;

/** @type {import('./internal').Component} */
let previousComponent;

/** @type {number} */
let currentHook = 0;

/** @type {Array<import('./internal').Component>} */
let afterPaintEffects = [];

let oldBeforeDiff = options._diff;
let oldBeforeRender = options._render;
let oldAfterDiff = options.diffed;
let oldCommit = options._commit;
let oldBeforeUnmount = options.unmount;

const RAF_TIMEOUT = 100;
let prevRaf;

// Attach a hook that is invoked before a vnode is diffed.
options._diff = vnode => {
	currentComponent = null;
	if (oldBeforeDiff) oldBeforeDiff(vnode);
};

// Attach a hook that is invoked before a vnode has rendered.
options._render = vnode => {
	if (oldBeforeRender) oldBeforeRender(vnode);
// 	进行每次 render 的初始化操作。包括执行/清理上次未处理完的 effect、初始化 hook 下标为 0、取得当前 render 的组件实例。
	currentComponent = vnode._component;
	currentIndex = 0;
	// 在每一次render过程中是从0 开始的 ，每执行一次useXX 后加一 每个hook 在多次render中对于记录前一次的执行状态正是通过
	// currentComponent._hoos

	const hooks = currentComponent.__hooks;
	if (hooks) {
		if (previousComponent === currentComponent) { // update 阶段
			hooks._pendingEffects = [];
			currentComponent._renderCallbacks = [];
			hooks._list.forEach(hookItem => {
				if (hookItem._args) hookItem._args = undefined;
			});
		} else { // mount 阶段
			// 执行清理操作
			hooks._pendingEffects.forEach(invokeCleanup);
			// 执行 effect
			hooks._pendingEffects.forEach(invokeEffect);
			hooks._pendingEffects = [];
		}
	}
	previousComponent = currentComponent;
};

options.diffed = vnode => {
	if (oldAfterDiff) oldAfterDiff(vnode);

	const c = vnode._component;
	// 下面会提到useEffect就是进入_pendingEffects队列
	if (c && c.__hooks && c.__hooks._pendingEffects.length) {
		// afterPaint 表示本次帧绘制完，下一帧开始前执行
		afterPaint(afterPaintEffects.push(c));
		// 将含有_pendingEffects的组件推进全局的afterPaintEffects队列中
	}
	currentComponent = null;
	previousComponent = null;
};

options._commit = (vnode, commitQueue) => {
	commitQueue.some(component => {
		try {
			// 执行上次的_renderCallbacks的清理函数
			component._renderCallbacks.forEach(invokeCleanup);
			// _renderCallbacks有可能是setState的第二个参数这种的、或者生命周期、或者forceUpdate的回调。
      // 通过_value判断是hook的回调则在此出执行
			// 其他的 就放到外面执行
			component._renderCallbacks = component._renderCallbacks.filter(cb =>
				cb._value ? invokeEffect(cb) : true
			);
		} catch (e) {
			commitQueue.some(c => {
				if (c._renderCallbacks) c._renderCallbacks = [];
			});
			commitQueue = [];
			options._catchError(e, component._vnode);
		}
	});

	if (oldCommit) oldCommit(vnode, commitQueue);
};

options.unmount = vnode => {
	if (oldBeforeUnmount) oldBeforeUnmount(vnode);

	const c = vnode._component;
	if (c && c.__hooks) {
		let hasErrored;
		// _cleanup 是 effect 类hook的清理函数，也就是我们每个effect的callback 的返回值函数
		c.__hooks._list.forEach(s => {
			try {
				invokeCleanup(s);
			} catch (e) {
				hasErrored = e;
			}
		});
		if (hasErrored) options._catchError(hasErrored, c._vnode);
	}
};

/**
 * Get a hook's state from the currentComponent
 * @param {number} index The index of the hook to get
 * @param {number} type The index of the hook to get
 * @returns {any}
 */
// 这个函数是在组件每次执行useXxx的时候，首先执行这一步获取 hook 的状态的（以useEffect为例子）。
// 所有的hook都是使用这个函数先获取自身 hook 状态
function getHookState(index, type) {
	if (options._hook) {
		// 附加一个在查询钩子状态之前调用的钩子。
		options._hook(currentComponent, index, currentHook || type);
	}
	currentHook = 0; // 我理解这个变量的是存在为了 弥补 type 不传的情况 去区分

	// Largely inspired by:
	// * https://github.com/michael-klein/funcy.js/blob/f6be73468e6ec46b0ff5aa3cc4c9baf72a29025a/src/hooks/core_hooks.mjs
	// * https://github.com/michael-klein/funcy.js/blob/650beaa58c43c33a74820a3c98b3c7079cf2e333/src/renderer.mjs
	// Other implementations to look at:
	// * https://codesandbox.io/s/mnox05qp8
	// hook最终是挂在组件的__hooks属性上的，因此，每次渲染的时候只要去读取函数组件本身的属性就能获取上次渲染的状态了，就能实现了函数组件的状态。
	const hooks =
		currentComponent.__hooks ||
		(currentComponent.__hooks = {
			// 每个组件的hook存储
			_list: [],
			// useLayoutEffect useEffect 等
			_pendingEffects: []
		});
  // 初始化的时候，创建一个空的hook
	if (index >= hooks._list.length) {
		hooks._list.push({});
	}
	return hooks._list[index];
}

/**
 * @param {import('./index').StateUpdater<any>} [initialState]
 */
export function useState(initialState) {
	currentHook = 1;
	return useReducer(invokeOrReturn, initialState);
}

/**
 * @param {import('./index').Reducer<any, any>} reducer
 * @param {import('./index').StateUpdater<any>} initialState
 * @param {(initialState: any) => void} [init]
 * @returns {[ any, (state: any) => void ]}
 */
export function useReducer(reducer, initialState, init) {
	/** @type {import('./internal').ReducerHookState} */
	const hookState = getHookState(currentIndex++, 2);
	hookState._reducer = reducer;
	if (!hookState._component) {
		// 初始化过程
    // 因为后面需要用到setState更新，所以需要记录component的引用
		hookState._value = [
			!init ? invokeOrReturn(undefined, initialState) : init(initialState),

			action => {
				// reducer函数计算出下次的state的值
				const nextValue = hookState._reducer(hookState._value[0], action);
				if (hookState._value[0] !== nextValue) {
					hookState._value = [nextValue, hookState._value[1]];
					// setState开始进行下一轮更新
					// 调用组件的setState方法进行组件的diff和相应更新操作
				// (这里是preact和react不太一样的一个地方，preact 的函数组件在内部和 class 组件一样使用 component 实现的)。
					hookState._component.setState({});
				}
			}
		];

		hookState._component = currentComponent;
	}
// 返回当前的state
	return hookState._value;
}

/**
 * @param {import('./internal').Effect} callback
 * @param {any[]} args
 */
// useEffect 的 callback 执行是在本次渲染结束之后，下次渲染之前执行。
export function useEffect(callback, args) {
	/** @type {import('./internal').EffectHookState} */
	const state = getHookState(currentIndex++, 3);
	if (!options._skipEffects && argsChanged(state._args, args)) {
		state._value = callback;
		state._args = args;
		// _pendingEffects则是本次重绘之后，下次重绘之前执行
		currentComponent.__hooks._pendingEffects.push(state);
	}
}

/**
 * @param {import('./internal').Effect} callback
 * @param {any[]} args
 */
// useLayoutEffect则是在本次会在浏览器 layout 之后，painting 之前执行，是同步的。
export function useLayoutEffect(callback, args) {
	/** @type {import('./internal').EffectHookState} */
	const state = getHookState(currentIndex++, 4);
	if (!options._skipEffects && argsChanged(state._args, args)) {
		state._value = callback;
		state._args = args;

		//_renderCallbacks 是在_commit 钩子中执行
		// renderCallback 就是render后的回调
		currentComponent._renderCallbacks.push(state);
	}
}

export function useRef(initialValue) {
	currentHook = 5;
	// 初始化的时候创建一个{ current: initialValue } 不依赖任何数据，需要手动赋值修改
	return useMemo(() => ({ current: initialValue }), []);
}

/**
 * @param {object} ref
 * @param {() => object} createHandle
 * @param {any[]} args
 */
export function useImperativeHandle(ref, createHandle, args) {
	currentHook = 6;
	useLayoutEffect(
		() => {
			if (typeof ref == 'function') {
				ref(createHandle());
				return () => ref(null);
			} else if (ref) {
				ref.current = createHandle();
				return () => (ref.current = null);
			}
		},
		args == null ? args : args.concat(ref)
	);
}

/**
 * @param {() => any} factory
 * @param {any[]} args
 */
export function useMemo(factory, args) {
	/** @type {import('./internal').MemoHookState} */
	const state = getHookState(currentIndex++, 7);
	 // 判断依赖项是否改变， 只是普通的===比较，如果依赖的引用类型并且改变引用类型的上的属性 将不会执行callback
	if (argsChanged(state._args, args)) {
    // 改变后执行callback的函数返回值
		state._value = factory();
		//存储本次依赖的数据值
		state._args = args;
		state._factory = factory;
	}

	return state._value;
}

/**
 * @param {() => void} callback
 * @param {any[]} args
 */
export function useCallback(callback, args) {
	currentHook = 8;
	// 直接返回这个callback 而不是执行
	return useMemo(() => callback, args);
}

/**
 * @param {import('./internal').PreactContext} context
 */
export function useContext(context) {
	// 每个`preact`组件的context属性都保存着当前全局context的Provider引用，不同的context都有一个唯一id
  // 获取当前组件 所属的Context Provider
	const provider = currentComponent.context[context._id];
	// We could skip this call here, but than we'd not call
	// `options._hook`. We need to do that in order to make
	// the devtools aware of this hook.
	/** @type {import('./internal').ContextHookState} */
	const state = getHookState(currentIndex++, 9);
	// The devtools needs access to the context object to
	// be able to pull of the default value when no provider
	// is present in the tree.
	state._context = context;
	if (!provider) return context._defaultValue;
	 // 初始化的时候将当前 组件订阅 Provider的value变化
  // 当Provider的value变化时，重新渲染当前组件
	// This is probably not safe to convert to "!"
	if (state._value == null) {
		state._value = true;
		provider.sub(currentComponent);
	}
	return provider.props.value;
}

/**
 * Display a custom label for a custom hook for the devtools panel
 * @type {<T>(value: T, cb?: (value: T) => string | number) => void}
 */
export function useDebugValue(value, formatter) {
	if (options.useDebugValue) {
		options.useDebugValue(formatter ? formatter(value) : value);
	}
}

/**
 * @param {(error: any) => void} cb
 */
export function useErrorBoundary(cb) {
	/** @type {import('./internal').ErrorBoundaryHookState} */
	const state = getHookState(currentIndex++, 10);
	const errState = useState();
	state._value = cb;
	if (!currentComponent.componentDidCatch) {
		currentComponent.componentDidCatch = err => {
			if (state._value) state._value(err);
			errState[1](err);
		};
	}
	return [
		errState[0],
		() => {
			errState[1](undefined);
		}
	];
}

/**
 * After paint effects consumer.
 */
function flushAfterPaintEffects() {
	let component;
	/**
 * 绘制之后执行回调
 * 执行队列内所有组件的上一次的`_pendingEffects`的清理函数和执行本次的`_pendingEffects`。
 */
	while ((component = afterPaintEffects.shift())) {
		if (!component._parentDom) continue;
		try {
			// 清理上一次的_pendingEffects
			component.__hooks._pendingEffects.forEach(invokeCleanup);
			// 执行当前_pendingEffects
			component.__hooks._pendingEffects.forEach(invokeEffect);
			component.__hooks._pendingEffects = [];
		} catch (e) {
			component.__hooks._pendingEffects = [];
			options._catchError(e, component._vnode);
		}
	}
}

let HAS_RAF = typeof requestAnimationFrame == 'function';

/**
 * Schedule a callback to be invoked after the browser has a chance to paint a new frame.
 * Do this by combining requestAnimationFrame (rAF) + setTimeout to invoke a callback after
 * the next browser frame.
 *
 * Also, schedule a timeout in parallel to the the rAF to ensure the callback is invoked
 * even if RAF doesn't fire (for example if the browser tab is not visible)
 *
 * @param {() => void} callback
 */
function afterNextFrame(callback) {
	const done = () => {
		clearTimeout(timeout);
		if (HAS_RAF) cancelAnimationFrame(raf);
		setTimeout(callback);
	};
	// 如果在100ms内 当前帧 requestAnimationFrame 没有结束（例如窗口不可见的情况下）
	// 则直接执行flushAfterPaintEffects
	const timeout = setTimeout(done, RAF_TIMEOUT);

	let raf;
	if (HAS_RAF) {
		raf = requestAnimationFrame(done);
	}
}

// Note: if someone used options.debounceRendering = requestAnimationFrame,
// then effects will ALWAYS run on the NEXT frame instead of the current one, incurring a ~16ms delay.
// Perhaps this is not such a big deal.
/**
 * Schedule afterPaintEffects flush after the browser paints
 * @param {number} newQueueLength
 */
 // preact的diff是同步的，是宏任务。
 // newQueueLength === 1 保证了afterPaint内的afterNextFrame(flushAfterPaintEffects)只执行一遍。
// 因为会调用n次宏任务的afterPaint结束后，才会执行flushAfterPaintEffects一次将所有含有pendingEffect的组件进行回调进行

function afterPaint(newQueueLength) {
	if (newQueueLength === 1 || prevRaf !== options.requestAnimationFrame) {
		prevRaf = options.requestAnimationFrame;
		// 执行下一帧结束后，清空 useEffect的回调
		(prevRaf || afterNextFrame)(flushAfterPaintEffects);
	}
}

/**
 * @param {import('./internal').EffectHookState} hook
 */
function invokeCleanup(hook) {
	// A hook cleanup can introduce a call to render which creates a new root, this will call options.vnode
	// and move the currentComponent away.
	const comp = currentComponent;
	let cleanup = hook._cleanup;
	// 执行清理函数
	if (typeof cleanup == 'function') {
		hook._cleanup = undefined;
		cleanup();
	}
	currentComponent = comp;
}

/**
 * Invoke a Hook's effect
 * @param {import('./internal').EffectHookState} hook
 */
function invokeEffect(hook) {
	// 一个钩子调用可以引入一个创建新根的渲染调用，这将调用 options.vnode, 并将 currentComponent 移开。
	// A hook call can introduce a call to render which creates a new root, this will call options.vnode
	// and move the currentComponent away.
	const comp = currentComponent;
	hook._cleanup = hook._value();
	currentComponent = comp;
}

/**
 * @param {any[]} oldArgs
 * @param {any[]} newArgs
 */
function argsChanged(oldArgs, newArgs) {
	return (
		!oldArgs ||
		oldArgs.length !== newArgs.length ||
		newArgs.some((arg, index) => arg !== oldArgs[index])
	);
}

function invokeOrReturn(arg, f) {
	return typeof f == 'function' ? f(arg) : f;
}
