import factory from './PluginFilesystemClient.js';

const pluginFactory = factory(globalThis.fetch, globalThis.FormData);

export default pluginFactory;
