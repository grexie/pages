import chalk from 'chalk';

export default async (...args: string[]) => {
  console.info(chalk.cyan('pages create'));
  console.info(args);
};
