import { execSync } from 'child_process';
import packages from '../../utils/packages.json' assert { type: 'json' };

export default () => {
  execSync(
    `yarn unlink ${packages.map(({ workspace }) => workspace).join(' ')}`,
    { stdio: 'inherit' }
  );
  execSync(`yarn install --force`, { stdio: 'inherit' });
};
