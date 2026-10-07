const dns = require('node:dns');

const servers = process.env.MONGODB_DNS_SERVERS
  ?.split(',')
  .map((value) => value.trim())
  .filter(Boolean);

if (servers?.length) dns.setServers(servers);
