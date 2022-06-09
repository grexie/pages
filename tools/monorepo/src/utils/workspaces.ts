import { sync as globSync } from 'glob';
import { dirname } from 'path';
import { readFileSync } from 'fs';

export const getWorkspaces = () =>
  globSync('packages/*/package.json').map(filename => {
    const json = JSON.parse(readFileSync(filename).toString());
    return {
      workspace: json.name,
      location: dirname(filename),
    };
  });
