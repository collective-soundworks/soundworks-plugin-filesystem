import '@soundworks/helpers/polyfills.js';
import { Client } from '@soundworks/core/client.js';
import { loadConfig, launcher } from '@soundworks/helpers/browser.js';

import ClientPluginFilesystem from '../../../../src/ClientPluginFilesystem.browser.js';

// - General documentation: https://soundworks.dev/
// - API documentation:     https://soundworks.dev/api
// - Issue Tracker:         https://github.com/collective-soundworks/soundworks/issues
// - Wizard & Tools:        `npx soundworks`

async function main($container) {
  const config = loadConfig();
  const client = new Client(config);

  // Eventually register plugins
  client.pluginManager.register('filesystem', ClientPluginFilesystem);

  // cf. https://soundworks.dev/tools/helpers.html#browserlauncher
  launcher.register(client, { initScreensContainer: $container });

  await client.start();

  const filesystem = await client.pluginManager.get('filesystem');

  try {
    await filesystem.writeFile('unauthorized-browser-writeFile-1.txt', 'unauthorized-browser-writeFile-1');
  } catch (err) {
    console.log(err.message);
  }

  try {
    await filesystem.writeFile('unauthorized-browser-writeFile-2.txt', new Blob(['unauthorized-browser-writeFile-2']));
  } catch (err) {
    console.log(err.message);
  }

  try {
    await filesystem.rename('unauthorized-browser-rename.txt', 'unauthorized-browser-renamed.txt');
  } catch (err) {
    console.log(err.message);
  }

  try {
    await filesystem.mkdir('unauthorized-browser-mkdir');
  } catch (err) {
    console.log(err.message);
  }

  try {
    await filesystem.rm('unauthorized-browser-rm.txt');
  } catch (err) {
    console.log(err.message);
  }
}

// The launcher allows to launch multiple clients in the same browser window
// e.g. `http://127.0.0.1:8000?emulate=10` to run 10 clients side-by-side
launcher.execute(main, {
  numClients: parseInt(new URLSearchParams(window.location.search).get('emulate')) || 1,
});
