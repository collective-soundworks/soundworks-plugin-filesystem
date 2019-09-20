import '@babel/polyfill';
import 'source-map-support/register'; // enable sourcemaps in node

import path from 'path';
import fs from 'fs';
import JSON5 from 'json5';

import { Client } from '@soundworks/core/client';
import serviceFileSystemFactory from '@soundworks/service-file-system/client';
import ThingExperience from './ThingExperience';

// ----------------------------------------------------
// CONFIG STUFF ---------------------------------------
// ----------------------------------------------------

function exitHandler(msg) {
  console.log('-------------------------', msg);
  // pd.clear();

  console.log('------------------------- TERM');
  process.kill(process.pid, 'SIGKILL');
}


function getConfig(configName) {
  let envConfig = null;
  // parse env config
  try {
    const envConfigPath = path.join('config', 'env', `${ENV}.json`);
    envConfig = JSON5.parse(fs.readFileSync(envConfigPath, 'utf-8'));

    if (process.env.PORT) {
      envConfig.port = process.env.PORT;
    }
  } catch(err) {
    console.log(`Invalid "${ENV}" env config file`);
    process.exit(1);
  }

  return { env: envConfig };
}

const ENV = process.env.ENV || 'default';
const config = getConfig(ENV);

// ----------------------------------------------------
// APP ------------------------------------------------
// ----------------------------------------------------


(async function launch() {
  try {
    console.log(config);
    const client = new Client();

    // register service
    client.registerService('file-system', serviceFileSystemFactory, {}, []);

    await client.init({ clientType: 'thing', ...config });

    console.log('inited');
    const thing = new ThingExperience(client, config);

    await client.start();
    console.log('started');
    thing.start();


    client.socket.addListener('close', () => exitHandler('socket disconnected'));
  } catch(err) {
    console.error(err);
  }
})();

process.on('exit', () => exitHandler('none'));
process.on('uncaughtException', (err) => exitHandler(err));
process.on('unhandledRejection', (err) => exitHandler(err));
