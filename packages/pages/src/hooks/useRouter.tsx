import NextRouter, {
  withRouter,
  useRouter as useNextRouter,
} from 'next/router.js';

export const useRouter = () => useNextRouter();
export { NextRouter, withRouter };
