import { enqueueRender } from './component';

export let i = 0;

export function createContext(defaultValue, contextId) {
	contextId = '__cC' + i++;

	const context = {
		_id: contextId,
		_defaultValue: defaultValue,
		/** @type {import('./internal').FunctionComponent} */
		Consumer(props, contextValue) {
			// return props.children(
			// 	context[contextId] ? context[contextId].props.value : defaultValue
			// );
			return props.children(contextValue);
		},
		/** @type {import('./internal').FunctionComponent} */
		Provider(props) {
			if (!this.getChildContext) {
				let subs = [];
				let ctx = {};
				ctx[contextId] = this;

				this.getChildContext = () => ctx;

				this.shouldComponentUpdate = function(_props) {
					//当value不相等时
					if (this.props.value !== _props.value) {
						// I think the forced value propagation here was only needed when `options.debounceRendering` was being bypassed:
						// https://github.com/preactjs/preact/commit/4d339fb803bea09e9f198abf38ca1bf8ea4b7771#diff-54682ce380935a717e41b8bfc54737f6R358
						// In those cases though, even with the value corrected, we're double-rendering all nodes.
						// It might be better to just tell folks not to use force-sync mode.
						// Currently, using `useContext()` in a class component will overwrite its `this.context` value.
						// subs.some(c => {
						// 	c.context = _props.value;
						// 	enqueueRender(c);
						// });

						// subs.some(c => {
						// 	c.context[contextId] = _props.value;
						// 	enqueueRender(c);
						// });
						subs.some(enqueueRender);
					}
				};
				// 渲染消费content组件时调用
				this.sub = c => {
					// 添加到队列中，当value改变时渲染该组件
					subs.push(c);
					let old = c.componentWillUnmount;
					// 当组件卸载后从队列中删除，然后执行老的componentWillUnmount
					c.componentWillUnmount = () => {
						subs.splice(subs.indexOf(c), 1);
						if (old) old.call(c);
					};
				};
			}

			return props.children;
		}
	};

	// Devtools needs access to the context object when it
	// encounters a Provider. This is necessary to support
	// setting `displayName` on the context object instead
	// of on the component itself. See:
	// https://reactjs.org/docs/context.html#contextdisplayname
	// Consumer组件设置了静态属性contextType，渲染时会执行子节点，并把context做为参数，等同于如下类组件。
	return (context.Provider._contextRef = context.Consumer.contextType = context);
}
