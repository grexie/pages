import path from 'path';
import webpack from 'webpack';
import { Source } from '../api';
import { MockBuilder } from './MockBuilder';

const createFixtures = (builder: MockBuilder) => {
  builder.addConfig('.pages.yml', {
    metadata: {
      layout: ['./layout'],
    },
  });
  builder
    .addSource(
      'layout.jsx',
      `<><Head><title>{title} | Test Site</title></Head><h1>{title}</h1>{children}</>`,
      {
        layout: null,
      }
    )
    .code('const { title } = useMetadata();')
    .decorate('withOnce')
    .import('@grexie/pages', 'withOnce')
    .import('@grexie/pages', 'Head')
    .import('@grexie/pages', 'useMetadata')
    .write();
  builder
    .addSource('test1.jsx', `<>Test1<Test2/></>`, { title: 'Test 1' })
    .importDefault('./test2', 'Test2')
    .write();
  builder.addSource('test2.jsx', `<>Test2</>`, { title: 'Test 2' }).write();
  builder
    .addSource('test3.jsx', `<>Test3</>`, { title: 'Test 3', layout: null })
    .write();
};

describe('ModuleContext', () => {
  let builder: MockBuilder;

  beforeEach(async () => {
    builder = new MockBuilder();
  });

  describe('build cache', () => {
    beforeEach(async () => {
      createFixtures(builder);
    });

    it('should enumerate all sources', async () => {
      const sources = await builder.registry.list();
      const configs = await builder.registry.listConfig();
      const serializeSource = (source: Source) => {
        const { path, slug } = source;
        return { path, slug };
      };
      expect(sources.map(serializeSource)).toMatchSnapshot();
      expect(configs.map(serializeSource)).toMatchSnapshot();
    });

    it('should build once', async () => {
      await builder.build();
      expect(builder.output()).toMatchSnapshot();
    });

    it('should build multiple times', async () => {
      await builder.build();
      const output = builder.output();
      expect(output).toMatchSnapshot();

      const builder2 = builder.create({ clean: false });
      builder2.cleanOutput();
      builder2.touchAll();
      await builder2.build();
      expect(builder2.output()).toEqual(output);

      const builder3 = builder.create({ clean: false });
      builder3.cleanOutput();
      builder3.touchAll();
      await builder3.build();
      expect(builder3.output()).toEqual(output);

      const builder4 = builder.create({ clean: false });
      builder4.cleanOutput();
      builder4.touchAll();
      await builder4.build();
      expect(builder4.output()).toEqual(output);
    }, 20000);

    it('should only rebuild files which have changed', async () => {
      await builder.build();

      const builder2 = builder.create({ clean: false });
      builder2.touch('test1.jsx');
      builder2.cleanOutput();
      await builder2.build();
      expect(builder2.output()).toMatchSnapshot();
    });

    it('should rebuild dependent resources', async () => {
      await builder.build();

      const builder2 = builder.create({ clean: false });
      builder2.touch('test2.jsx');
      builder2.cleanOutput();
      await builder2.build();
      expect(builder2.output()).toMatchSnapshot();
    });

    it('should rebuild dependent resources from a layout change', async () => {
      await builder.build();

      const builder2 = builder.create({ clean: false });
      builder2.touch('layout.jsx');
      builder2.cleanOutput();
      await builder2.build();
      expect(builder2.output()).toMatchSnapshot();
    });

    it('should be the same source on recompile', async () => {
      const builder1 = new MockBuilder();
      builder1.addSource('index.jsx', `<>Home</>`, { title: 'Home' }).write();
      const stats1 = await builder1.build();
      const factory1 = builder1.modules.createModuleFactory(stats1.compilation);
      const module1 = await builder1.modules.require(
        factory1,
        builder1.rootDir,
        path.resolve(builder1.rootDir, 'index.jsx')
      );

      const builder2 = builder1.create({ clean: false });
      const sources = await builder2.registry.list();
      const config = await builder2.builder.config(sources);
      const compiler = webpack(config);
      compiler.inputFileSystem = builder2.fs;
      compiler.outputFileSystem = builder2.fs;
      const compilation = compiler.newCompilation(
        compiler.newCompilationParams()
      );
      const factory2 = builder2.modules.createModuleFactory(compilation);
      const module2 = await builder2.modules.require(
        factory2,
        builder2.rootDir,
        path.resolve(builder2.rootDir, 'index.jsx')
      );

      expect(module2.source).toEqual(module1.source);
    });

    it('should create after a build and evict', async () => {
      const builder = new MockBuilder();
      const filename = path.resolve(builder.rootDir, 'index.jsx');

      const source = builder
        .addSource('index.jsx', `<>Home</>`, { title: 'Home' })
        .write();
      const sources = await builder.registry.list();
      const config = await builder.builder.config(sources);

      const compiler = webpack(config);
      compiler.inputFileSystem = builder.fs;
      compiler.outputFileSystem = builder.fs;
      const compilation = compiler.newCompilation(
        compiler.newCompilationParams()
      );

      const factory1 = builder.modules.createModuleFactory(compilation);

      const module1 = await builder.modules.require(
        factory1,
        builder.rootDir,
        filename
      );
      module1.load(module);

      await builder.modules.evict(factory1, filename, {
        recompile: true,
      });

      const factory2 = builder.modules.createModuleFactory(compilation);
      const compiled = await builder.modules.compiler.compile({
        source,
        filename,
        presets: [require('@babel/preset-react')],
      });
      const module2 = await builder.modules.create(
        factory2,
        new webpack.Module(module1.webpackModule.type),
        filename,
        compiled.source
      );

      expect(module2.source.replace(/\s+/g, ' ')).not.toEqual(
        module1.source.replace(/\s+/g, ' ')
      );
    });

    it('should rebuild from config change', async () => {
      await builder.build();

      const builder2 = builder.create({ clean: false });
      builder2.touch('.pages.yml');
      builder2.cleanOutput();
      await builder2.build();
      expect(builder2.output()).toMatchSnapshot();
    }, 20000);
  });
});
