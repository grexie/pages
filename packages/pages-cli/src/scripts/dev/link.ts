import { execSync } from 'child_process';
import { packages } from '../../utils/packages.js';

export default () => {
  execSync(`yarn link ${packages.join(' ')}`, { stdio: 'inherit' });
};
