export { Fragment } from 'react/jsx-runtime';
import { jsx as jsxOrig, jsxs as jsxsOrig } from 'react/jsx-runtime';
import { translateNode } from './runtime-translate';

export const jsx = (type: any, props: any, key?: any) => jsxOrig(type, translateNode(type, props), key);
export const jsxs = (type: any, props: any, key?: any) => jsxsOrig(type, translateNode(type, props), key);
