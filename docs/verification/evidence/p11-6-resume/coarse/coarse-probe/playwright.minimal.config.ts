import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'*.minimal.spec.ts',timeout:30000,workers:1,retries:0,use:{baseURL:'http://127.0.0.1:7173',browserName:'chromium',channel:'chrome'}});
