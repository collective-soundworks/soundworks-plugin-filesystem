# `@soundworks/plugin-filesystem`

> [`soundworks`](https://github.com/collective-soundworks/soundworks) plugin
> to parse and watch directories and distribute their contents to all clients
> in real-time.

## Table of Contents

<!-- toc -->

- [Installation](#installation)
- [Example](#example)
- [Usage](#usage)
  * [Server installation](#server-installation)
    + [Registering the plugin](#registering-the-plugin)
    + [Requiring the plugin](#requiring-the-plugin)
  * [Client installation](#client-installation)
    + [Registering the plugin](#registering-the-plugin-1)
    + [Requiring the plugin](#requiring-the-plugin-1)
  * [Getting current values and subscribing to changes](#getting-current-values-and-subscribing-to-changes)
  * [File tree format](#file-tree-format)
  * [Routing and `publicDirectory` option](#routing-and-publicdirectory-option)
  * [Watching a directory outside the project](#watching-a-directory-outside-the-project)
- [Credits](#credits)
- [License](#license)

<!-- tocstop -->

## Installation

```sh
npm install @soundworks/plugin-filesystem --save
```

## Example

A working example can be found in the [https://github.com/collective-soundworks/soundworks-examples](https://github.com/collective-soundworks/soundworks-examples) repository.

## Usage

### Server installation

#### Registering the plugin

```js
// index.js
import { Server } from '@soundworks/core/server';
import pluginFilesystemFactory from '@soundworks/plugin-filesystem/server';

const server = new Server();
server.pluginManager.register('filesystem', pluginFilesystemFactory, {
  directories: [{
    // key at which the file tree will be accessible
    name: 'my-name',
    // path to the watched directory, can be relative to process.cwd()
    // or absolute, in all cases file paths in the tree will be normalized
    // to be relative to `process.cwd()`
    path: 'path/to/directory',
    // if defined, add an `url` to each tree node, that defines the
    // route at which the files will be publicly accessible.
    publicDirectory: '',
  }],
}, []);
```

#### Requiring the plugin

```js
// MyExperience.js
import { AbstractExperience } from '@soundworks/core/server';

class MyExperience extends AbstractExperience {
  constructor(server, clientType) {
    super(server, clientType);
    // require plugin in the experience
    this.filesystem = this.require('filesystem');
  }
}
```

### Client installation

#### Registering the plugin

```js
// index.js
import { Client } from '@soundworks/core/client';
import pluginFilesystemFactory from '@soundworks/plugin-filesystem/client';

const client = new Client();
client.pluginManager.register('filesystem', pluginFilesystemFactory, {}, []);
```

#### Requiring the plugin

```js
// MyExperience.js
import { Experience } from '@soundworks/core/client';

class MyExperience extends Experience {
  constructor(client) {
    super(client);
    // require plugin in the experience
    this.filesystem = this.require('filesystem');
  }
}
```

### Getting current values and subscribing to changes

The following API is the same on the client as well as the server side:

```js
// get the current values of all registered directories
const trees = this.filesystem.getValues();

for (let name in trees) {
  const tree = trees[name];
  console.log(name, tree);
}

// or get a single tree
const tree = this.filesystem.get(name);

// be notified when a change occurs in a watched filesystem
this.filesystem.subscribe(updates => {
  for (let name in updates) {
    const tree = updates[name];
    console.log(name, tree);
  }
});
```

### File tree format

The plugin is built on top of the [node-directory-tree](https://github.com/mihneadb/node-directory-tree) library and therefore follows the format described [here](https://github.com/mihneadb/node-directory-tree#result). The only addition to the format is the addition of a `url` field on each node to simplify the access of the resources for the clients.

### Routing and `publicDirectory` option

The `publicDirectory` option allows to create an valid `url` from the filesystem paths. It can be use in conjunction with `server.router.use` to open specific routes for static assets.

For example, let's consider a case where you watch the directory `/misc/audio` but want to publicly access the audio files through `http://my.domain/audio/*.wav`. You can do the following:

```js
// server/index.js
server.router.use('audio', serveStatic('misc/audio'));

server.pluginManager.register('filesystem', pluginFilesystemFactory, {
  // default to `.data/scripts`
  directories: [{
      name: 'audio-files',
      path: 'misc/audio,
      publicDirectory: 'audio',
  }]
}, []);
```

Note that if `publicDirectory` is not defined in the configuration object, the `url` field won't be added to the nodes of the tree.

### Watching a directory outside the project

The plugin and `url` strategy described above should even work with directories located at arbitrary locations in your file system.

## Credits

The code has been initiated in the framework of the WAVE and CoSiMa research projects, funded by the French National Research Agency (ANR).

## License

BSD-3-Clause
