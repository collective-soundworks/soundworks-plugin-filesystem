// `node tests/manual-test.js`
// - simple test server to test manual interactions with the file system
// - watch the `tests/manual/` directory

import { Server } from '@soundworks/core/server.js';
import filesystemPlugin from '../src/PluginFilesystemServer.js';

import config from './config.js';

function logTree(tree, depth) {
  let prefix = new Array(2 * depth).join(' ');
  prefix += tree.type === 'directory' ? '+' : '-';

  console.log(`${prefix} ${tree.name}`);

  if (tree.children) {
    tree.children.forEach(tree => logTree(tree, depth + 1));
  }
}

function logEvents(events) {
  if (updates.events === null) {
    console.log('> no events');
  }

  events.forEach(event => {
    if (event.node && event.node.path) {
      console.log(`> ${event.type}: ${event.node.path}`);
    } else {
      // this should not be seen anymore
      console.log('????? weird event', event);
    }
  });
}

const server = new Server(config);
server.pluginManager.register('filesystem', filesystemPlugin, {
  dirname: 'tests/manual',
});

await server.start();
const filesystem = await server.pluginManager.get('filesystem');

console.log('++');
console.log(`++ watching into "tests/manual" directory`);
console.log('++');

filesystem.onUpdate(updates => {
  console.log('');

  logTree(updates.tree, 0);
  logEvents(updates.events);
}, true);
