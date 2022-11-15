import { execSync } from 'child_process';
import { packages } from '../../utils/packages';

export default () => {
  execSync(`yarn unlink ${packages.join(' ')}`, { stdio: 'inherit' });
  execSync(`yarn install --force`, { stdio: 'inherit' });
};
