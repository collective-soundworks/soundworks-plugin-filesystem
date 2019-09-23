# `@soundworks/service-file-system`

> `soundworks` service providing a representation of the file system at runtime.  
> Basically a wrapper around [directory-tree](https://github.com/mihneadb/node-directory-tree) and [chokidar](https://github.com/paulmillr/chokidar)

## Install

```sh
npm install --save @soundworks/service-file-system
```

## Usage

### client

#### registering the service

```js
// index.js
import { Client } from '@soundworks/core/client';
import serviceFileSystemFactory from '@soundworks/service-file-system/client';

const client = new Client();
client.registerService('file-system', serviceFileSystemFactory, {}, []);
```

#### requiring and using the service 

```js
// MyExperience.js
import { Experience } from '@soundworks/core/client';

class MyExperience extends Experience {
  constructor() {
    super();
    this.fileSystem = this.require('file-system');
  }

  start() {
    // listening for updates
    this.fileSystem.state.subscribe(updates => {
      const fileSystemDescriprion = this.fileSystem.state.get('test-files');
      console.log(fileSystemDescriprion);
    });

    // getting current state
    const fileSystemDescriprion = this.fileSystem.state.get('test-files');
    console.log(fileSystemDescriprion);
  }
}
```

#### options

### server

#### registering the service

```js
import { Server } from '@soundworks/core/server';
import serviceFileSystemFactory from '@soundworks/service-file-system/server';

const server = new Server();

server.registerService('file-system', serviceFileSystemFactory, {
  directories: [{
    name: 'test-files',
    path: path.join('public', 'test'),
    publicDirectory: 'public',
    watch: true,
  }],
});
```

#### requiring the service 

```js
import { Experience } from '@soundworks/core/server';

class PlayerExperience extends Experience {
  constructor(server, clientTypes, options = {}) {
    super(server, clientTypes);

    this.fileSystem = this.require('file-system');
  }
}
```

#### options

@param {Array} [directories=[]] - List of directory configuration to be listed and optionally watched, the
  - `directory.name` - user defined named, allowing to retrieve the structure
  - `directory.path` - path of the directory in the file system
  - `directory.publicDirectory` - path to the http public directory, thats allows to create url from filenames.
  - `directory.watch` - defines if the directory should be watched and trigger updates on file change.

## License

BSD-3-Clause
