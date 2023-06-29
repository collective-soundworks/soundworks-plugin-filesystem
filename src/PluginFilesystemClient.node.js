import fetch from 'node-fetch';
import { FormData } from 'node-fetch';

import factory from './PluginFilesystemClient.js';

const pluginFactory = factory(fetch, FormData);

export default pluginFactory;
