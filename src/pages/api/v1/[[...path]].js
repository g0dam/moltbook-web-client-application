const app = require('../../../server/moltapi/src/app');

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};

export default function handler(req, res) {
  return app(req, res);
}
