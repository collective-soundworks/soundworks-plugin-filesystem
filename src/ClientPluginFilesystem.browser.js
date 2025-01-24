import ClientPluginFilesystem from './ClientPluginFilesystem.js';

// Leads to "Illegal invocation", we need to check dynamically
// ClientPluginFilesystem.fetch = globalThis.fetch;
// Weirdly this is not an issue with FormData
ClientPluginFilesystem.FormData = globalThis.FormData;

export default ClientPluginFilesystem;
