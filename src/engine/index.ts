import { RegistryEngine } from './RegistryEngine';

/** 全局蓝图图书馆单例。引擎初始化时自动从 localStorage 加载。 */
export const blueprintLibrary = new RegistryEngine();

export { RegistryEngine };
