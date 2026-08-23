export { Fragment } from 'react/jsx-dev-runtime';
import { jsxDEV as jsxDEVOrig } from 'react/jsx-dev-runtime';
import { translateNode } from './runtime-translate';

export const jsxDEV = (type: any, props: any, key: any, isStaticChildren: boolean, source: any, self: any) =>
  jsxDEVOrig(type, translateNode(type, props), key, isStaticChildren, source, self);
