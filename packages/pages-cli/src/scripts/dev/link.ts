import { execSync } from 'child_process';
import packages from '../../utils/packages.json' assert { type: 'json' };

export default () => {
  execSync(
    `yarn link ${packages.map(({ workspace }) => workspace).join(' ')}`,
    { stdio: 'inherit' }
  );
};
