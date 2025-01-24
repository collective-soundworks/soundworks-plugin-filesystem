import fetch from 'node-fetch';
import { FormData } from 'node-fetch';

import ClientPluginFilesystem from './ClientPluginFilesystem.js';

ClientPluginFilesystem.fetch = fetch;
ClientPluginFilesystem.FormData = FormData;

export default ClientPluginFilesystem;
