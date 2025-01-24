import ClientPluginFilesystem from './ClientPluginFilesystem.js';

ClientPluginFilesystem.fetch = globalThis.fetch;
ClientPluginFilesystem.FormData = globalThis.FormData;

export default ClientPluginFilesystem;
