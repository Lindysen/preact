import { assign } from './util';
import { diff, commitRoot } from './diff/index';
import options from './options';
import { Fragment } from './create-element';

/**
 * Base Component class. Provides `setState()` and `forceUpdate()`, which
 * trigger rendering
 * @param {object} props The initial component props
 * @param {object} context The initial context from parent components'
 * getChildContext
 */
 // 基础组件类。提供 `setState()` 和 `forceUpdate()`， 触发渲染
export function Component(props, context) {
	this.props = props;
	this.context = context;
}

/**
 * Update component state and schedule a re-render.
 * 更新组件state 调度 re-render
 * @this {import('./internal').Component}
 * @param {object | ((s: object, p: object) => object)} update A hash of state
 * properties to update with new values or a function that given the current
 * state and props returns a new partial state
 * @param {() => void} [callback] A function to be called once component state is
 * updated
 */
Component.prototype.setState = function(update, callback) {
	// only clone state when copying to nextState the first time.
	let s;
	if (this._nextState != null && this._nextState !== this.state) {
		s = this._nextState;
	} else {
		s = this._nextState = assign({}, this.state);
	}

	if (typeof update == 'function') {
		// Some libraries like `immer` mark the current state as readonly,
		// preventing us from mutating it, so we need to clone it. See #2716
		update = update(assign({}, s), this.props);
	}

	if (update) {
		// 这就是把处理后的state 放到nextState
		assign(s, update);
	}

	// Skip update if updater function returned null
	if (update == null) return;

	if (this._vnode) {
		if (callback) this._renderCallbacks.push(callback);
		// 把当前组件加入待渲染队列并渲染
		enqueueRender(this);
	}
};

/**
 * Immediately perform a synchronous re-render of the component
 * @this {import('./internal').Component}
 * @param {() => void} [callback] A function to be called after component is
 * re-rendered
 */
Component.prototype.forceUpdate = function(callback) {
	if (this._vnode) {
		// Set render mode so that we can differentiate where the render request
		// is coming from. We need this because forceUpdate should never call
		// shouldComponentUpdate
		 // 设置渲染模式，以便我们可以区分渲染请求的位置
    // 来自。我们需要这个，因为 forceUpdate 永远不应该调用
    // 应该组件更新
		this._force = true;
		if (callback) this._renderCallbacks.push(callback);
		// 设置_force来标记是强制渲染，然后加入渲染队列并渲染。如果_force为真，则在diff渲染中不会触发组件的某些生命周期。
		enqueueRender(this);
	}
};

/**
 * Accepts `props` and `state`, and returns a new Virtual DOM tree to build.
 * Virtual DOM is generally constructed via [JSX](http://jasonformat.com/wtf-is-jsx).
 * @param {object} props Props (eg: JSX attributes) received from parent
 * element/component
 * @param {object} state The component's current state
 * @param {object} context Context object, as returned by the nearest
 * ancestor's `getChildContext()`
 * @returns {import('./index').ComponentChildren | void}
 */
Component.prototype.render = Fragment;

/**
 * @param {import('./internal').VNode} vnode
 * @param {number | null} [childIndex]
 */
export function getDomSibling(vnode, childIndex) {
	if (childIndex == null) {
		// 从 vnode 的兄弟节点继续搜索
		// Use childIndex==null as a signal to resume the search from the vnode's sibling
		return vnode._parent
			? getDomSibling(vnode._parent, vnode._parent._children.indexOf(vnode) + 1)
			: null;
	}

	let sibling;
	for (; childIndex < vnode._children.length; childIndex++) {
		sibling = vnode._children[childIndex];

		if (sibling != null && sibling._dom != null) {
			// Since updateParentDomPointers keeps _dom pointer correct,
			// we can rely on _dom to tell us if this subtree contains a
			// rendered DOM node, and what the first rendered DOM node is
			return sibling._dom;
		}
	}
	// 如果我们到达这里，我们还没有在这个 vnode 的子节点中找到一个 DOM 节点。
	// 我们必须从这个 vnode 的兄弟节点（在它的父 _children 数组中）恢复
	// 如果我们不通过 DOM 搜索，只爬上去搜索父节点
	// VNode（意味着我们到达了开始的原始 vnode 的 DOM 父级）
	// 搜索）

	// If we get here, we have not found a DOM node in this vnode's children.
	// We must resume from this vnode's sibling (in it's parent _children array)
	// Only climb up and search the parent if we aren't searching through a DOM
	// VNode (meaning we reached the DOM parent of the original vnode that began
	// the search)
	// 这个情况下 childIndex 为 null
	return typeof vnode.type == 'function' ? getDomSibling(vnode) : null;
}

/**
 * Trigger in-place re-rendering of a component.
 * @param {import('./internal').Component} component The component to rerender
 */
// 渲染组件
function renderComponent(component) {
	let vnode = component._vnode,
		oldDom = vnode._dom,
		parentDom = component._parentDom;

	if (parentDom) {
		let commitQueue = [];
		const oldVNode = assign({}, vnode);
		oldVNode._original = vnode._original + 1;
    //比较渲染
		diff(
			parentDom,
			vnode,
			oldVNode,
			component._globalContext,
			parentDom.ownerSVGElement !== undefined,
			vnode._hydrating != null ? [oldDom] : null, // excessDomChildren
			commitQueue,
			oldDom == null ? getDomSibling(vnode) : oldDom, // oldDom
			vnode._hydrating
		);
		 // 渲染完成时执行did生命周期和setState回调
		commitRoot(commitQueue, vnode);
		// 如果newDom与oldDom不一致，则调用updateParentDomPointers
		if (vnode._dom != oldDom) {
			updateParentDomPointers(vnode);
		}
	}
}

/**
 * @param {import('./internal').VNode} vnode
 */
function updateParentDomPointers(vnode) {
	if ((vnode = vnode._parent) != null && vnode._component != null) {
		vnode._dom = vnode._component.base = null;
		for (let i = 0; i < vnode._children.length; i++) {
			let child = vnode._children[i];
			if (child != null && child._dom != null) {
				vnode._dom = vnode._component.base = child._dom;
				break;
			}
		}

		return updateParentDomPointers(vnode);
	}
}

/**
 * The render queue
 * @type {Array<import('./internal').Component>}
 */
// 待渲染组件队列
let rerenderQueue = [];

/**
 * Asynchronously schedule a callback
 * @type {(cb: () => void) => void}
 */
//异步调度器。如果支持Promise则会用Promise，否则用setTimeout
/* istanbul ignore next */
// Note the following line isn't tree-shaken by rollup cuz of rollup/rollup#2566
const defer = //等同于 Promise.resolve().then。
	typeof Promise == 'function'
		? Promise.prototype.then.bind(Promise.resolve())
		: setTimeout;

/*
 * The value of `Component.debounce` must asynchronously invoke the passed in callback. It is
 * important that contributors to Preact can consistently reason about what calls to `setState`, etc.
 * do, and when their effects will be applied. See the links below for some further reading on designing
 * asynchronous APIs.
 * * [Designing APIs for Asynchrony](https://blog.izs.me/2013/08/designing-apis-for-asynchrony)
 * * [Callbacks synchronous and asynchronous](https://blog.ometer.com/2011/07/24/callbacks-synchronous-and-asynchronous/)
 */

let prevDebounce;

/** 将组件的重新渲染排入队列
 * Enqueue a rerender of a component
 * @param {import('./internal').Component} c The component to rerender
 */
export function enqueueRender(c) {
	  // 如果_dirty为false则设为true
   // 然后把组件加入队列中
   // 自加加rerenderCount并且如果为0则触发渲染

	if (
		(!c._dirty &&
			(c._dirty = true) &&
			rerenderQueue.push(c) &&
			!process._rerenderCount++) ||  // process._rerenderCount 为 0  才会为true ,>0 的值为 false
		prevDebounce !== options.debounceRendering
	) {
		prevDebounce = options.debounceRendering;
		//执行process
		(prevDebounce || defer)(process);
	}
}
// 通过重新渲染所有排队的组件来刷新渲染队列
// 遍历队列渲染组件
/** Flush the render queue by rerendering all queued components */
function process() {
	let queue;
	while ((process._rerenderCount = rerenderQueue.length)) {
		//按深度排序，最顶级的组件的最先执行
		queue = rerenderQueue.sort((a, b) => a._vnode._depth - b._vnode._depth);
		rerenderQueue = [];
	  // 暂时不要更新 `renderCount`。保持其值非零以防止不必要的
    // process() 在 `queue` 仍然被消耗时被调度调用。
		// Don't update `renderCount` yet. Keep its value non-zero to prevent unnecessary
		// process() calls from getting scheduled while `queue` is still being consumed.
		queue.some(c => {
			 //如果组件需要渲染则渲染它
			if (c._dirty) renderComponent(c);
		});
	}
}
process._rerenderCount = 0;
