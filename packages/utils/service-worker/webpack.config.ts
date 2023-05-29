import path from 'path';
import { Configuration } from 'webpack';
import TerserPlugin from 'terser-webpack-plugin';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

const config: Configuration = {
  context: path.resolve(__dirname, 'src'),
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  devtool: 'source-map',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
  },
  module: {
    rules: [
      {
        type: 'javascript/esm',
        test: /\.tsx?$/,
        exclude: [path.resolve(__dirname, 'webpack.config.ts'), /node_modules/],
        use: ['babel-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.jsx', '.cjs', '.mjs', '.ts', '.tsx'],
  },
  resolveLoader: {
    extensions: ['.cjs', '.js'],
  },
  plugins: [],
  stats: {
    modulesSpace: 0,
  },
  optimization: {
    usedExports: true,
    minimize: true,
    minimizer: [
      new TerserPlugin({
        extractComments: false,
        terserOptions: {
          output: {
            comments: false,
          },
        },
      }),
    ],
    concatenateModules: true,
    innerGraph: true,
    sideEffects: true,
    splitChunks: {
      chunks: 'all',
      minSize: 20000,
      minRemainingSize: 0,
      minChunks: 1,
      maxAsyncRequests: 30,
      maxInitialRequests: 30,
      enforceSizeThreshold: 50000,
      cacheGroups: {
        defaultVendors: false,
        default: false,
      },
    },
    runtimeChunk: false,
  },
};

const entries: Configuration[] = [
  {
    ...config,
    entry: { sw: ['./index'] },
    target: 'webworker',
  },
];

export default entries;
