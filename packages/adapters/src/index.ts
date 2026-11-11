/**
 * The extension's adapters, retailer registry and journey reducer, re-exported
 * in place for the web app and server. Nothing is moved: the extension keeps
 * owning this code and its tests.
 */
export * from '../../../apps/extension/src/adapters/index';
export * from '../../../apps/extension/src/retailers';
export * from '../../../apps/extension/src/store/journey';
export { dismissControlFor } from '../../../apps/extension/src/adapters/cues';
