import fetch from 'node-fetch';
import { FormData } from 'node-fetch';

import factory from './plugin-filesystem.js';

const pluginFactory = factory(fetch, FormData);

export default pluginFactory;
