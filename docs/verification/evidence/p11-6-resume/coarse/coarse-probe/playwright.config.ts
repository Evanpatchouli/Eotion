import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: '.', testMatch: '*.probe.spec.ts', timeout: 30000, workers: 1, retries: 0, use: {baseURL:'http://127.0.0.1:7173', browserName:'chromium', channel:'chrome'}, reporter:[['line'],['json',{outputFile:'results.json'}]], outputDir:'test-results' });
