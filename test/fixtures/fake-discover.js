module.exports = async function fakeDiscover() {
  return [
    { name: 'hdisplay-1', url: 'http://localhost:3000', host: 'localhost', port: 3000 },
    { name: 'hdisplay-2', url: 'http://localhost:3001', host: 'localhost', port: 3001 },
  ];
};
