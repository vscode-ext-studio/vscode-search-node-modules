import { build } from "esbuild";
const isProd = process.argv.indexOf('--mode=production') >= 0;

build({
    entryPoints: ['./src/extension.ts'],
    bundle: true,
    outfile: "out/extension.js",
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    // logLevel: 'error',
    metafile: true,
    // sourceRoot: __dirname+"/src",
    minify: isProd,
    watch: !isProd,
    sourcemap: !isProd,
    logOverride: {
        'duplicate-object-key': "silent",
        'suspicious-boolean-not': "silent",
    },
    plugins: [
        {
            name: 'build notice',
            setup(build) {
                build.onStart(() => {
                    console.log('build start')
                })
                build.onEnd(() => {
                    console.log('build success')
                })
            }
        },
    ],
})