import { createPublicGateway } from '../start-unified-runtime.mjs';

const apiPort = Number(process.env.API_PORT || 5001);
const nextPort = Number(process.env.NEXT_INTERNAL_PORT || 5002);
const publicPort = Number(process.env.PORT || 5000);
const server = createPublicGateway({ apiPort, nextPort });

server.listen(publicPort, '127.0.0.1', () => {
  process.stdout.write(`Hotfix exact-host gateway listening on http://127.0.0.1:${publicPort}\n`);
});

function stop() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
