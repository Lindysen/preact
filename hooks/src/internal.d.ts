import {
	Component as PreactComponent,
	PreactContext
} from '../../src/internal';
import { Reducer } from '.';

export { PreactContext };

/**
 * The type of arguments passed to a Hook function. While this type is not
 * strictly necessary, they are given a type name to make it easier to read
 * the following types and trace the flow of data.
 */
export type HookArgs = any;

/**
 * The return type of a Hook function. While this type is not
 * strictly necessary, they are given a type name to make it easier to read
 * the following types and trace the flow of data.
 */
export type HookReturnValue = any;

/** The public function a user invokes to use a Hook */
export type Hook = (...args: HookArgs[]) => HookReturnValue;

// Hook tracking

export interface ComponentHooks {
	/** The list of hooks a component uses */
	_list: HookState[];
	/** List of Effects to be invoked after the next frame is rendered */
	_pendingEffects: EffectHookState[];
}

export interface Component extends PreactComponent<any, any> {
	__hooks?: ComponentHooks;
}

export type HookState =
	| EffectHookState
	| MemoHookState
	| ReducerHookState
	| ContextHookState
	| ErrorBoundaryHookState;

export type Effect = () => void | Cleanup;
export type Cleanup = () => void;

export interface EffectHookState {
	 // effect hook的回调函数
	_value?: Effect;
	// 依赖项
	_args?: any[];
	// effect hook的清理函数，_value的返回值
	_cleanup?: Cleanup | void;
}

export interface MemoHookState {
	 // useMemo的返回值
	_value?: any;
	// 前一个的依赖数组
	_args?: any[];
	// usememo 传入的callback
	_factory?: () => any;
}

export interface ReducerHookState {
	_value?: any;
	_component?: Component;
	_reducer?: Reducer<any, any>;
}

export interface ContextHookState {
	/** Whether this hooks as subscribed to updates yet */
	_value?: boolean;
	_context?: PreactContext;
}

export interface ErrorBoundaryHookState {
	_value?: (error: any) => void;
}
