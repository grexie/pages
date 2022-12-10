import chalk from 'chalk';

export default async (...args: string[]) => {
  process.stderr.write(chalk.cyan('pages create'));
  process.stderr.write(JSON.stringify(args, null, 2));
};
