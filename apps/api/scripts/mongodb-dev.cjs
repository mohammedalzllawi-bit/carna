const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { MongoClient } = require('mongodb');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const port = 27018;
const replicaSetName = 'libya-auctions-rs';
const databaseName = 'libya_auctions';
const dataPath = path.resolve(__dirname, '../../../.data/mongodb');
const databaseUrl = `mongodb://127.0.0.1:${port}/${databaseName}?replicaSet=${replicaSetName}`;

function isPortOpen() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(1_000);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
  });
}

async function canPingMongo() {
  const client = new MongoClient(databaseUrl, { serverSelectionTimeoutMS: 2_000 });

  try {
    await client.db('admin').command({ ping: 1 });
    return true;
  } catch {
    return false;
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function main() {
  if (await isPortOpen()) {
    if (await canPingMongo()) {
      console.log(`MongoDB development replica set is already running: ${databaseUrl}`);
      return;
    }

    throw new Error(
      `Port ${port} is already in use, but the process did not respond as the expected MongoDB replica set.`,
    );
  }

  fs.mkdirSync(dataPath, { recursive: true });

  const replicaSet = await MongoMemoryReplSet.create({
    instanceOpts: [
      { port, dbPath: dataPath, storageEngine: 'wiredTiger', launchTimeout: 60_000 },
    ],
    replSet: {
      count: 1,
      name: replicaSetName,
      storageEngine: 'wiredTiger',
    },
  });

  const stop = async () => {
    await replicaSet.stop({ doCleanup: false });
    process.exit(0);
  };

  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  console.log(`MongoDB development replica set is ready: ${replicaSet.getUri(databaseName)}`);
  console.log(`Persistent data directory: ${dataPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
