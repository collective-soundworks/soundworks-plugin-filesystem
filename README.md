# `@soundworks/service-file-system`

> Template for developmeent of soundworks services

Example of README file

## Install

```
npm install --save @soundworks/service-template
```

## Usage

### client

#### registering the service

```
// index.js
import { Client } from '@soundworks/core/client';
import serviceTemplateFactory from '@soundworks/service-template/client';

const client = new Client({ ... });
client.registerService('template', serviceTemplateFactory, options = {}, dependencies = []);
```

#### requiring the service 

```
// MyExperience.js
import { Experience } from '@soundworks/core/client';

class MyExperience extends Experience {
  constructor() {
    super();
    this.template = this.require('template');
  }
}
```

#### options

### server

#### registering the service

#### requiring the service 

#### options


## License

BSD-3-Clause
