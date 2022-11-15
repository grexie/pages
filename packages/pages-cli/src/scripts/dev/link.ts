import { execSync } from 'child_process';
import { packages } from '../../utils/packages';

export default () => {
  execSync(`yarn link ${packages.join(' ')}`, { stdio: 'inherit' });
};
