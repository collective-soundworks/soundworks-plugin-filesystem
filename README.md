# soundworks | plugin filesystem

[![npm version](https://badge.fury.io/js/@soundworks%2Fplugin-filesystem.svg)](https://badge.fury.io/js/@soundworks%2Fplugin-filesystem)

[`soundworks`](https://soundworks.dev) plugin to watch directories and update their contents from any node.

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
  * [Uploading and deleting file from a client](#uploading-and-deleting-file-from-a-client)
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

## Usage

### Server

```js
// index.js
import { Server } from '@soundworks/core/server';
import pluginFilesystemFactory from '@soundworks/plugin-filesystem/server';

const server = new Server();
server.pluginManager.register('filesystem', pluginFilesystemFactory, {
  // path to the watched directory, can be relative to process.cwd()
  // or absolute, in all cases file paths in the tree will be normalized
  // to be relative to `process.cwd()`
  dirname: 'path/to/directory',
  // if defined, add an `url` to each tree node, that defines the
  // route at which the files are publicly accessible.
  publicPath: '',
});

await server.start();

const filesystem = await servre.pluginManager.get('filesystem');
await filesystem.writeFile('my-file.txt', 'Hello Server');
```

### Client

#### Registering the plugin

```js
// index.js
import { Client } from '@soundworks/core/client';
import pluginFilesystemFactory from '@soundworks/plugin-filesystem/client';

const client = new Client();
client.pluginManager.register('filesystem', pluginFilesystemFactory, {}, []);

await client.start();

const filesystem = await client.pluginManager.get('filesystem');
await filesystem.writeFile('my-file.txt', 'Hello Client');
```

## Notes

### Reading files

For now, the filesystem plugin does not provide any way to read files due to the impossibility to have consistent file representation between node and the browser, and to the large type of files that would require different handling or processing (e.g. image, sound, text).

According to your specific needs you can rely on other plugins (e.g. audio-buffer-loader) or on the state manager (e.g. for text files) to read and share the files.

### Security

Being able to write and delete files from any connected client poses evident security questions, moreover if your application aims at running online. To prevent such issues, all sensible operations (i.e. other than listing the files) of the  plugin are blocked if the `env.type` config option passed to the soundworks server is set to `production`. 

In such case, only trusted clients that authentified by a login and password will be able to perform these operations.

See the `config/env-**.js` files to configure your application (@todo - tutorial).

## API

<!-- api -->

## Credits

[https://soundworks.dev/credits.html](https://soundworks.dev/credits.html)

## License

[BSD-3-Clause](./LICENSE)
