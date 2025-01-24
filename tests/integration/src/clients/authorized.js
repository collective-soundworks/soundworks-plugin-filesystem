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

  // result is not checked but will crash the test if something fails
  // const file = await filesystem.readFile('authorized-browser-read.txt');
  // console.log(file);

  try {
    // this is one is sent through sockets
    await filesystem.writeFile('authorized-browser-writeFile-1.txt', 'authorized-browser-writeFile-1');
    console.log(`ClientPluginFilesystem writeFile-1 done`);
  } catch (err) {
    console.log(err.message);
  }

  try {
    // this is one is sent through HTTP POST
    await filesystem.writeFile('authorized-browser-writeFile-2.txt', new Blob(['authorized-browser-writeFile-2']));
    console.log(`ClientPluginFilesystem writeFile-2 done`);
  } catch (err) {
    console.log(err.message);
  }

  try {
    await filesystem.rename('authorized-browser-rename.txt', 'authorized-browser-renamed.txt');
    console.log(`ClientPluginFilesystem rename done`);
  } catch (err) {
    console.log(err.message);
  }

  try {
    await filesystem.mkdir('authorized-browser-mkdir');
    console.log(`ClientPluginFilesystem mkdir done`);
  } catch (err) {
    console.log(err.message);
  }

  try {
    await filesystem.rm('authorized-browser-rm.txt');
    console.log(`ClientPluginFilesystem rm done`);
  } catch (err) {
    console.log(err.message);
  }
}

// The launcher allows to launch multiple clients in the same browser window
// e.g. `http://127.0.0.1:8000?emulate=10` to run 10 clients side-by-side
launcher.execute(main, {
  numClients: parseInt(new URLSearchParams(window.location.search).get('emulate')) || 1,
});
