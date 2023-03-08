import factory from './plugin-filesystem.js';

const pluginFactory = factory(globalThis.fetch, globalThis.FormData);

export default pluginFactory;
