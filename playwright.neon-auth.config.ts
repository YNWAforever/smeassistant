import {defineConfig,devices} from '@playwright/test';
import {hostedAuthTarget} from './test/e2e/hosted-auth-target';
const target=hostedAuthTarget(process.env);
export default defineConfig({testDir:'./e2e/neon-auth',workers:1,fullyParallel:false,retries:0,timeout:120000,reporter:'line',use:{baseURL:target.origin,trace:'off',screenshot:'off',video:'off'},projects:[{name:'managed-neon-auth',use:{...devices['Desktop Chrome']}}]});
