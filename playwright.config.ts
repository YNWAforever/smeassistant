import {fileURLToPath} from "node:url";
process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ""} --require=${fileURLToPath(new URL("./test/e2e/transport-guard.cjs",import.meta.url))}`;
import {defineConfig,devices} from '@playwright/test';
export default defineConfig({testDir:'./e2e',testIgnore:['**/acceptance/**','**/live/**','**/neon-auth/**'],globalSetup:'./test/e2e/public-setup.ts',fullyParallel:false,workers:1,timeout:180000,expect:{timeout:10000},reporter:'line',use:{baseURL:'http://localhost:3100',trace:'retain-on-failure',launchOptions:{args:['--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=localhost;127.0.0.1;[::1]']}},projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}]});
