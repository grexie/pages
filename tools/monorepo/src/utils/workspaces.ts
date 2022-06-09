import { execSync } from 'child_process';
import glob from 'glob';
import path from 'path';
import fs from 'fs';

export const getWorkspaces = () =>
  glob.sync('packages/*/package.json').map(filename => {
    const json = JSON.parse(fs.readFileSync(filename).toString());
    return {
      workspace: json.name,
      location: path.dirname(filename),
    };
  });
