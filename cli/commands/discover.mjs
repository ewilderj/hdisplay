import chalk from 'chalk';
import BonjourPkg from 'bonjour-service';

const Bonjour = (BonjourPkg && (BonjourPkg.default || BonjourPkg.Bonjour)) || BonjourPkg;

export default async function discover(timeoutMs = 2000) {
  return new Promise((resolve) => {
    let bonjour;
    try {
      bonjour = new Bonjour();
    } catch (e) {
      console.error(chalk.red('Error:'), e.message);
      return resolve([]);
    }
    const found = [];
    const browser = bonjour.find({ type: 'hdisplay' }, (service) => {
      const host = service.host || service.fqdn;
      const addr =
        (service.referer && service.referer.address) || (service.addresses && service.addresses[0]);
      const url = `http://${addr || host}:${service.port}`;
      found.push({ name: service.name, host, url, port: service.port, txt: service.txt });
      console.log(chalk.green('Found:'), service.name, chalk.cyan(url));
    });
    setTimeout(() => {
      try {
        browser.stop();
        bonjour.destroy();
      } catch {}
      resolve(found);
    }, timeoutMs);
  });
}
