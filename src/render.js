import { EMPTY_OBJ } from './constants';
import { commitRoot, diff } from './diff/index';
import { createElement, Fragment } from './create-element';
import options from './options';
import { slice } from './util';

/**
 *
  将 Preact 虚拟节点渲染到 DOM 元素中
 * Render a Preact virtual node into a DOM element
 * @param {import('./internal').ComponentChild} vnode The virtual node to render
 * @param {import('./internal').PreactElement} parentDom The DOM element to
 * render into
 * @param {import('./internal').PreactElement | object} [replaceNode] Optional: Attempt to re-use an
 * existing DOM tree rooted at `replaceNode`
 */
export function render(vnode, parentDom, replaceNode) {
		/** Attach a hook that is invoked before render, mainly to check the arguments. */
	if (options._root) options._root(vnode, parentDom);

	// We abuse the `replaceNode` parameter in `hydrate()` to signal if we are in
	// hydration mode or not by passing the `hydrate` function instead of a DOM
	// element..
	// 我们滥用 `hydrate()` 中的 `replaceNode` 参数来指示我们是否在
  // 水合模式与否通过传递 `hydrate` 函数而不是 DOM
  // 元素..
	let isHydrating = typeof replaceNode === 'function';

	// To be able to support calling `render()` multiple times on the same
	// DOM node, we need to obtain a reference to the previous tree. We do
	// this by assigning a new `_children` property to DOM nodes which points
	// to the last rendered tree. By default this property is not present, which
	// means that we are mounting a new tree for the first time.
	// 为了能够支持在同一个上多次调用 `render()`
  // DOM 节点，我们需要获取对前一棵树的引用。我们的确是
 // 通过为指向的 DOM 节点分配一个新的 `_children` 属性
 // 到最后渲染的树。默认情况下，此属性不存在，这
 // 表示我们是第一次挂载一棵新树。
	let oldVNode = isHydrating
		? null
		: (replaceNode && replaceNode._children) || parentDom._children;

	vnode = (
		(!isHydrating && replaceNode) ||
		parentDom
	)._children = createElement(Fragment, null, [vnode]);

	// List of effects that need to be called after diffing.
	let commitQueue = []; // components list
	diff(
		parentDom,
		// Determine the new vnode tree and store it on the DOM element on
		// our custom `_children` property.
		vnode,
		oldVNode || EMPTY_OBJ,
		EMPTY_OBJ,
		parentDom.ownerSVGElement !== undefined,// issvg
		!isHydrating && replaceNode // excessDomChildren
			? [replaceNode]
			: oldVNode
			? null
			: parentDom.firstChild
			? slice.call(parentDom.childNodes)
			: null,
		commitQueue,
		!isHydrating && replaceNode
			? replaceNode
			: oldVNode
			? oldVNode._dom
			: parentDom.firstChild,
		isHydrating
	);

	// Flush all queued effects
	commitRoot(commitQueue, vnode);
}

/**
 * 使用 Preact 虚拟节点中的数据更新现有 DOM 元素
 * Update an existing DOM element with data from a Preact virtual node
 * @param {import('./internal').ComponentChild} vnode The virtual node to render
 * @param {import('./internal').PreactElement} parentDom The DOM element to
 * update
 */
export function hydrate(vnode, parentDom) {
	render(vnode, parentDom, hydrate);
}
