/**
 * Find the closest error boundary to a thrown error and call it
 * @param {object} error The thrown value
 * @param {import('../internal').VNode} vnode The vnode that threw
 * the error that was caught (except for unmounting when this parameter
 * is the highest parent that was being unmounted)
 * @param {import('../internal').VNode} [oldVNode]
 * @param {import('../internal').ErrorInfo} [errorInfo]
 */
export function _catchError(error, vnode, oldVNode, errorInfo) {
	/** @type {import('../internal').Component} */
	let component, ctor, handled;

	for (; (vnode = vnode._parent); ) {
		// _processingException判断这个组件是否处理异常中
		if ((component = vnode._component) && !component._processingException) {
			try {
				ctor = component.constructor;

				if (ctor && ctor.getDerivedStateFromError != null) {
					component.setState(ctor.getDerivedStateFromError(error));
					handled = component._dirty;
				}

				if (component.componentDidCatch != null) {
					component.componentDidCatch(error, errorInfo || {});
					handled = component._dirty;
				}
		   	// 	这是一个错误边界。将其标记为已退出，以及是否处于中间水合作用状态
				// This is an error boundary. Mark it as having bailed out, and whether it was mid-hydration.
				if (handled) {
				// 	而在component._pendingError = component却设置了_pendingError来标记这个组件是在处理异常中
					return (component._pendingError = component);
					// 为什么需要两个变量 我还不是很了解
				}
			} catch (e) {
				error = e;
			}
		}
	}

	throw error;
}
